/**
 * Keeps this device's copy of the server's data up to date.
 *
 * Every few seconds the device asks `pulse` (see supabase/migrations/…_app_sync.sql): the answer
 * carries the shared clock, the truck events that arrived since the last one seen, and a
 * fingerprint of each set of rows the caller can read. A set is read again only when its
 * fingerprint changed, so an idle app costs one small request per tick.
 *
 * The copy lives in `useRemote`. The services read it; the screens never do. Truck events,
 * shifts and tickets are kept in memory only. The public settings (schedules, SMS lead time,
 * contacts, announcements) are also saved on the device, so a resident who opens the app
 * without signal still sees the schedule as it was last changed, not the original one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DAY, manilaDateKey } from '@/lib/time';
import { followServer, LIVE_CLOCK } from '@/simulator/clock';
import { useArea } from '@/stores/area';
import { getSimTime, useDemo } from '@/stores/demo';

import { OfflineError } from '../errors';
import type {
  Announcement,
  CityConfig,
  GpsSource,
  Route,
  RouteSchedule,
  StaffRole,
  StaffUser,
  SuggestionDecision,
  Ticket,
  TruckEvent,
} from '../types';
import type { Auth } from './auth';
import type { Caller, Http } from './http';
import {
  ANNOUNCEMENT_SELECT,
  type AnnouncementRow,
  buildTruckEvents,
  type ContactRow,
  type DecisionRow,
  type EventRow,
  type LeadRow,
  mapAnnouncement,
  mapContacts,
  mapDecisions,
  mapLeadChanges,
  mapSchedules,
  mapShift,
  mapStaff,
  mapTickets,
  SCHEDULE_COLUMNS,
  type ScheduleRow,
  type Shift,
  SHIFT_COLUMNS,
  type ShiftRow,
  STAFF_COLUMNS,
  type StaffRow,
  TICKET_SELECT,
  type TicketRow,
} from './mappers';

/** How often each app asks (ms). The dashboard and the truck phone follow more closely. */
const TICK_MS = { enro: 3_000, driver: 4_000, resident: 5_000 } as const;
/** Events come 500 at a time; a full page means there is more to fetch right away. */
const PAGE = 500;
/** The app replays at most the last eight days; the server sends nine. */
const WINDOW_MS = 9 * DAY;
/** A new clock reading replaces the old one only when it differs by more than this (ms). */
const CLOCK_TOLERANCE_MS = 250;

export interface PulseAnswer {
  now: number;
  clock: { anchor_real: number | null; anchor_sim: number | null; speed: number };
  reference: string | null;
  me: { role: StaffRole | null; barangay: string | null; truck: string | null };
  first_seq: number | null;
  last_seq: number | null;
  events: EventRow[];
  rev: Record<string, string>;
}

export interface GpsSummary {
  points: number;
  lastFixAt: number | null;
  source: GpsSource | null;
}

type Contacts = CityConfig['contacts'];
const NO_CONTACTS: Contacts = { enro: { phone: null, hours: null }, barangays: {} };

interface RemoteState {
  /** The first answer arrived (or the first try failed): screens need not wait any longer. */
  ready: boolean;
  /** The last try reached the server. */
  online: boolean;
  /** Whose view the sets below are: an identity, or 'anon'. */
  readerKey: string;
  me: PulseAnswer['me'];
  /** `me` is the server's answer for this caller (false until the first one arrives). */
  meKnown: boolean;
  /** Version of the map data the server was seeded with. */
  referenceVersion: string | null;
  /** The last truck event seen. */
  cursor: number;
  eventRows: EventRow[];
  shifts: Shift[];
  /** null = not received yet: the bundled sample schedule stands in. */
  schedules: RouteSchedule[] | null;
  leadChanges: { at: number; minutes: number }[];
  contacts: Contacts;
  announcements: Announcement[];
  tickets: Ticket[];
  /** Crew work on pickups, taken from the tickets (the City ENRO timeline shows it). */
  tasks: TruckEvent[];
  decisions: Record<string, { decision: SuggestionDecision; at: number }>;
  staff: StaffUser[];
  gps: Record<string, GpsSummary>;
  /** The fingerprint each set had when it was last read. */
  rev: Record<string, string>;
}

/** What belongs to one caller's view and must go when the caller changes. */
const forReader = (readerKey: string) => ({
  readerKey,
  me: { role: null, barangay: null, truck: null } as PulseAnswer['me'],
  meKnown: false,
  tickets: [] as Ticket[],
  tasks: [] as TruckEvent[],
  decisions: {},
  staff: [] as StaffUser[],
  gps: {},
});
const OWN_SETS = ['tickets', 'decisions', 'staff', 'gps'];

export const useRemote = create<RemoteState>()(
  persist(
    (): RemoteState => ({
      ready: false,
      online: true,
      referenceVersion: null,
      cursor: 0,
      eventRows: [],
      shifts: [],
      schedules: null,
      leadChanges: [],
      contacts: NO_CONTACTS,
      announcements: [],
      rev: {},
      ...forReader('anon'),
    }),
    {
      name: 'kolektaph.remote',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ schedules, leadChanges, contacts, announcements }) => ({
        schedules,
        leadChanges,
        contacts,
        announcements,
      }),
    },
  ),
);

let eventsMemo: {
  rows: EventRow[];
  shifts: Shift[];
  tasks: TruckEvent[];
  out: TruckEvent[];
} | null = null;

/** Every truck event the simulator replays, built once per change of its sources. */
export function remoteEvents(routes: Route[]): TruckEvent[] {
  const { eventRows, shifts, tasks } = useRemote.getState();
  if (
    !eventsMemo ||
    eventsMemo.rows !== eventRows ||
    eventsMemo.shifts !== shifts ||
    eventsMemo.tasks !== tasks
  ) {
    eventsMemo = {
      rows: eventRows,
      shifts,
      tasks,
      out: buildTruckEvents(eventRows, shifts, routes, tasks),
    };
  }
  return eventsMemo.out;
}

export interface SyncDeps {
  http: Http;
  auth: Auth;
  routes: Route[];
  /** False while the device has no signal (or the demo "no signal" switch is on). */
  isOnline: () => boolean;
  /** Tickets to keep on the device even when the server stops showing them (see applyTickets). */
  keepTicketIds: () => string[];
}

export function createSync({ http, auth, routes, isOnline, keepTicketIds }: SyncDeps) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let running = false;
  let again = false;
  let failures = 0;
  let clockFix: { offsetMs: number; rttMs: number } | null = null;
  let markFirst: () => void = () => {};
  const first = new Promise<void>((resolve) => {
    markFirst = resolve;
  });

  /** Whose view to read: the City ENRO login in the dashboard, else this device's guest. */
  const reader = (): { as: Caller; key: string } => {
    const staff = auth.current('staff');
    const guest = auth.current('guest');
    if (useArea.getState().area === 'enro' && staff) return { as: 'staff', key: staff.userId };
    if (guest) return { as: 'guest', key: guest.userId };
    return { as: 'anon', key: 'anon' };
  };

  const since = () => new Date(getSimTime() - WINDOW_MS).toISOString();

  /** Lines this device's clock up with the server's and follows the shared demo clock. */
  function applyClock(answer: PulseAnswer, sentAt: number, receivedAt: number) {
    const rttMs = receivedAt - sentAt;
    const offsetMs = Math.round(answer.now - (sentAt + receivedAt) / 2);
    const drift = clockFix ? Math.abs(offsetMs - clockFix.offsetMs) : Infinity;
    // Keep a reading until a better one (a faster round trip) or a clearly different one comes.
    if (
      !clockFix ||
      drift > (rttMs + clockFix.rttMs) / 2 + CLOCK_TOLERANCE_MS ||
      (rttMs < clockFix.rttMs && drift > CLOCK_TOLERANCE_MS)
    ) {
      clockFix = { offsetMs, rttMs };
    }
    const next = followServer(
      {
        anchorRealMs: answer.clock.anchor_real,
        anchorSimMs: answer.clock.anchor_sim,
        speed: answer.clock.speed,
      },
      clockFix.offsetMs,
    );
    const now = useDemo.getState().clock;
    const same =
      now.mode === next.mode &&
      now.speed === next.speed &&
      now.anchorSimMs === next.anchorSimMs &&
      Math.abs(now.anchorRealMs - next.anchorRealMs) <= CLOCK_TOLERANCE_MS &&
      Math.abs((now.offsetMs ?? 0) - (next.offsetMs ?? 0)) <= CLOCK_TOLERANCE_MS;
    if (!same) useDemo.getState().setClock(next);
  }

  function applyEvents(answer: PulseAnswer) {
    const state = useRemote.getState();
    let rows = state.eventRows;
    let cursor = state.cursor;
    const last = answer.last_seq ?? 0;
    if (last < cursor) {
      // The server holds less than this device has seen: start over.
      rows = [];
      cursor = 0;
      again = true;
    } else {
      // Rows the server no longer has (a demo reset removed them) go here too.
      const firstSeq = answer.first_seq;
      if (firstSeq == null) rows = rows.length ? [] : rows;
      else if (rows.length && rows[0].seq < firstSeq) rows = rows.filter((r) => r.seq >= firstSeq);
      const fresh = answer.events.filter((e) => e.seq > cursor);
      if (fresh.length) rows = [...rows, ...fresh];
      const full = answer.events.length >= PAGE;
      cursor = full ? answer.events[answer.events.length - 1].seq : Math.max(cursor, last);
      if (full) again = true;
    }
    const floor = getSimTime() - WINDOW_MS;
    if (rows.some((r) => r.at < floor)) rows = rows.filter((r) => r.at >= floor);
    if (rows !== state.eventRows || cursor !== state.cursor) {
      useRemote.setState({ eventRows: rows, cursor });
    }
  }

  /** Each set, read as the caller. Returns the part of the state it fills. */
  const readers: Record<string, (as: Caller) => Promise<Partial<RemoteState>>> = {
    shifts: async (as) => ({
      shifts: (
        await http.select<ShiftRow>(
          'shifts',
          { select: SHIFT_COLUMNS, started_at: `gte.${since()}`, order: 'started_at' },
          as,
        )
      ).map(mapShift),
    }),
    schedules: async (as) => ({
      schedules: mapSchedules(
        await http.select<ScheduleRow>(
          'route_schedules',
          { select: SCHEDULE_COLUMNS, order: 'id' },
          as,
        ),
      ),
    }),
    lead: async (as) => ({
      leadChanges: mapLeadChanges(
        await http.select<LeadRow>(
          'sms_lead_changes',
          { select: 'effective_at,minutes', order: 'effective_at' },
          as,
        ),
      ),
    }),
    contacts: async (as) => ({
      contacts: mapContacts(
        await http.select<ContactRow>('contacts', { select: 'barangay_id,phone,hours' }, as),
      ),
    }),
    announcements: async (as) => ({
      announcements: (
        await http.select<AnnouncementRow>(
          'announcements',
          { select: ANNOUNCEMENT_SELECT, sent_at: `gte.${since()}`, order: 'sent_at' },
          as,
        )
      ).map(mapAnnouncement),
    }),
    tickets: async (as) => {
      const rows = await http.select<TicketRow>(
        'tickets',
        { select: TICKET_SELECT, order: 'created_at.desc' },
        as,
      );
      return applyTickets(mapTickets(rows, routes));
    },
    decisions: async (as) => ({
      decisions: mapDecisions(
        await http.select<DecisionRow>(
          'suggestion_decisions',
          {
            select: 'service_day,route_id,decision,decided_at',
            service_day: `gte.${manilaDateKey(getSimTime() - WINDOW_MS)}`,
          },
          as,
        ),
      ),
    }),
    staff: async (as) => ({
      staff: (
        await http.select<StaffRow>('staff', { select: STAFF_COLUMNS, order: 'name' }, as)
      ).map(mapStaff),
    }),
    gps: async (as) => {
      if (as === 'anon') return { gps: {} };
      const rows = await http.read<
        { shift_id: string; source: GpsSource | null; points: number; last_fix_at: number | null }[]
      >('shift_gps', { p_since: since() }, as);
      return {
        gps: Object.fromEntries(
          rows.map((r) => [
            r.shift_id,
            { points: r.points, lastFixAt: r.last_fix_at, source: r.source },
          ]),
        ),
      };
    },
  };

  /**
   * A truck phone is shown only the pickups it still has to do, so a pickup disappears from the
   * server's answer once the crew marks it done. The phone keeps its last copy while its own
   * queue still refers to it, so "done this shift" stays on the crew's list.
   */
  function applyTickets(next: { tickets: Ticket[]; tasks: TruckEvent[] }) {
    const keep = new Set(keepTicketIds());
    const kept = keep.size
      ? useRemote
          .getState()
          .tickets.filter((t) => keep.has(t.id) && !next.tickets.some((n) => n.id === t.id))
      : [];
    return { tickets: kept.length ? [...next.tickets, ...kept] : next.tickets, tasks: next.tasks };
  }

  async function refreshSets(rev: Record<string, string>, who: { as: Caller; key: string }) {
    const known = useRemote.getState().rev;
    const changed = Object.keys(rev).filter((k) => readers[k] && rev[k] !== known[k]);
    const results = await Promise.allSettled(changed.map((k) => readers[k](who.as)));
    // The caller changed while reading: this answer belongs to someone else's view.
    if (useRemote.getState().readerKey !== who.key) return;
    const patch: Partial<RemoteState> = {};
    const done: Record<string, string> = {};
    let failed: unknown = null;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        Object.assign(patch, r.value);
        done[changed[i]] = rev[changed[i]];
      } else {
        failed ??= r.reason;
      }
    });
    if (Object.keys(done).length) {
      useRemote.setState({ ...patch, rev: { ...useRemote.getState().rev, ...done } });
    }
    // A set that could not be read keeps its old fingerprint, so the next tick tries again.
    if (failed) throw failed;
  }

  async function pulse(): Promise<void> {
    await auth.ready;
    const who = reader();
    if (useRemote.getState().readerKey !== who.key) {
      const rev = { ...useRemote.getState().rev };
      OWN_SETS.forEach((k) => delete rev[k]);
      useRemote.setState({ ...forReader(who.key), rev });
    }
    const sentAt = Date.now();
    const answer = await http.read<PulseAnswer>(
      'pulse',
      { p_seq: useRemote.getState().cursor },
      who.as,
    );
    const receivedAt = Date.now();
    if (useRemote.getState().readerKey !== who.key) return;
    applyClock(answer, sentAt, receivedAt);
    applyEvents(answer);
    const { me, meKnown, referenceVersion, online } = useRemote.getState();
    if (
      !online ||
      !meKnown ||
      referenceVersion !== answer.reference ||
      me.role !== answer.me.role ||
      me.barangay !== answer.me.barangay ||
      me.truck !== answer.me.truck
    ) {
      useRemote.setState({
        online: true,
        referenceVersion: answer.reference,
        me: answer.me,
        meKnown: true,
      });
    }
    await refreshSets(answer.rev, who);
  }

  const visible = () => {
    const doc = (globalThis as { document?: { visibilityState?: string } }).document;
    if (doc?.visibilityState) return doc.visibilityState !== 'hidden';
    return AppState.currentState !== 'background';
  };

  const plan = (delayMs: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void tick(), delayMs);
  };

  async function tick() {
    if (running) {
      again = true;
      return;
    }
    const every = TICK_MS[useArea.getState().area];
    // Nobody is looking, or there is no signal: ask again later instead of now.
    if (!visible() || !isOnline()) {
      if (!isOnline() && useRemote.getState().online) useRemote.setState({ online: false });
      settle();
      plan(every);
      return;
    }
    running = true;
    again = false;
    try {
      await pulse();
      failures = 0;
    } catch (e) {
      failures += 1;
      if (e instanceof OfflineError && useRemote.getState().online) {
        useRemote.setState({ online: false });
      }
    } finally {
      running = false;
      settle();
    }
    plan(again ? 0 : failures ? Math.min(30_000, every * 2 ** Math.min(failures, 3)) : every);
  }

  function settle() {
    if (useRemote.getState().ready) return;
    useRemote.setState({ ready: true });
    markFirst();
  }

  return {
    /** Starts asking (once). Until the first answer, time is the device's own. */
    start() {
      if (started) return;
      started = true;
      const begin = () => {
        // A demo time saved by an earlier run may be long over: the server says what holds now.
        if (useDemo.getState().clock.mode !== 'live') useDemo.getState().setClock(LIVE_CLOCK);
        plan(0);
      };
      if (useDemo.persist.hasHydrated()) begin();
      else useDemo.persist.onFinishHydration(begin);
      const doc = (
        globalThis as { document?: { addEventListener?: (t: string, l: () => void) => void } }
      ).document;
      if (typeof doc?.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', () => visible() && plan(0));
      } else {
        AppState.addEventListener('change', (state) => state === 'active' && plan(0));
      }
      // A change of identity or of app area shows a different view: ask at once.
      auth.subscribe(() => plan(0));
      useArea.subscribe(() => plan(0));
    },
    /** One round right now, whatever the timer says (errors are the caller's to handle). */
    pulseNow: pulse,
    /** Ask now (after this device changed something on the server). */
    poke() {
      if (!started) return;
      if (running) again = true;
      else plan(0);
    },
    /** Resolves after the first answer (or the first failed try). */
    whenReady: () => first,
    /** How far the server's clock is ahead of this device's (ms; 0 until known). */
    clockOffset: () => clockFix?.offsetMs ?? 0,
    /** Reads one set again now, whatever its fingerprint says. */
    async reload(set: string): Promise<void> {
      const who = reader();
      const read = readers[set];
      if (!read) return;
      const patch = await read(who.as);
      if (useRemote.getState().readerKey === who.key) useRemote.setState(patch);
    },
    /** Puts one freshly read ticket into the copy (after this device acted on it). */
    putTickets(next: { tickets: Ticket[]; tasks: TruckEvent[] }) {
      const state = useRemote.getState();
      const ids = new Set(next.tickets.map((t) => t.id));
      useRemote.setState({
        tickets: [...next.tickets, ...state.tickets.filter((t) => !ids.has(t.id))].sort(
          (a, b) => b.createdAt - a.createdAt,
        ),
        tasks: [
          ...state.tasks.filter((e) => e.kind !== 'task' || !ids.has(e.ticketId)),
          ...next.tasks,
        ].sort((a, b) => a.at - b.at),
      });
    },
    /** Empties the copy of everything a demo reset removes on the server. */
    forgetActivity() {
      useRemote.setState({
        eventRows: [],
        shifts: [],
        tickets: [],
        tasks: [],
        decisions: {},
        gps: {},
        announcements: [],
        leadChanges: [],
        contacts: NO_CONTACTS,
        rev: {},
      });
    },
  };
}

export type Sync = ReturnType<typeof createSync>;
