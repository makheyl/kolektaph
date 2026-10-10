/**
 * The services on the pilot database (see supabase/README.md).
 *
 * The app keeps calculating what it calculated before: truck positions, alerts, missed streets,
 * statistics and Kolek's answers come from the same simulator and domain code as the sample
 * services. What changes is where the facts come from (this device's copy of the server's rows,
 * kept fresh by `sync`) and where every entry goes (one entry-point function each, which checks
 * the caller and is safe to repeat).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BARANGAYS, ROUTE_SCHEDULES, ROUTES, TRUCKS } from '@/data/carmona';
import { smsInfo } from '@/features/alerts/sms';
import { newTicket, withAutoClose } from '@/features/reports/lifecycle';
import { validateScheduleChange } from '@/features/schedule/editing';
import { barangayAt } from '@/lib/geo';
import { isOnline } from '@/lib/network';
import { manilaDateKey } from '@/lib/time';
import { randomUuid } from '@/lib/uuid';
import { simulatedTrace } from '@/simulator/truckSimulator';
import { useArea } from '@/stores/area';
import { getSimTime } from '@/stores/demo';
import { localEvents, useDriver } from '@/stores/driver';

import { OfflineError, ServerError, SignInError } from '../errors';
import {
  NO_FEATURES,
  unavailableHauling,
  unavailableRewards,
  unavailableScanner,
} from '../unavailable';
import { createMockServices, SMS_LEAD_MAX, SMS_LEAD_MIN } from '../mock';
import { evaluateClaim, missedStreetKey } from '../mock/reports';
import type {
  CityConfig,
  ClaimResult,
  OutboundAlert,
  PhotoRef,
  Services,
  StaffAuthState,
  StaffSession,
  Ticket,
  TruckState,
  UploadResult,
} from '../types';
import { createAuth } from './auth';
import { createSupabaseAccount } from './account';
import type { ApiConfig } from './config';
import { type Caller, createHttp } from './http';
import {
  announcementId,
  GPS_COLUMNS,
  type GpsBatchRow,
  mapStaff,
  mapTickets,
  STAFF_COLUMNS,
  type StaffRow,
  TICKET_SELECT,
  type TicketRow,
  toUploadEvent,
  unpackGps,
} from './mappers';
import { createPhotoStore, type PhotoArg } from './storage';
import { createSync, remoteEvents, useRemote } from './sync';

const STAFF_PROFILE_KEY = 'kolektaph.auth.staff.profile';

/** The mock keeps these on the device; here each has its own entry point on the server. */
const viaServer = (): never => {
  throw new Error('This is written through the server');
};

/** Refusals that mean "sign in (again)", from the entry points and from the sign-in service. */
const needsSignIn = (e: unknown) =>
  e instanceof ServerError &&
  (e.code === 'sign_in_required' || e.code === 'driver_sign_in_required');

export function createSupabaseServices(config: ApiConfig): Services {
  const auth = createAuth(config, AsyncStorage);
  const http = createHttp(config, auth.tokens);
  const photos = createPhotoStore(config, http, (as) => auth.current(as)?.userId ?? null);
  const sync = createSync({
    http,
    auth,
    routes: ROUTES,
    isOnline,
    // Pickups this phone's queue still refers to (see sync.applyTickets).
    keepTicketIds: () => localEvents().flatMap((e) => (e.kind === 'task' ? [e.ticketId] : [])),
  });
  const remote = () => useRemote.getState();

  /** Whose view a read uses: the City ENRO login in the dashboard, else this device's guest. */
  const readerAs = (): Caller => {
    if (useArea.getState().area === 'enro' && auth.current('staff')) return 'staff';
    return auth.current('guest') ? 'guest' : 'anon';
  };
  /** Every request needs signal (also honours the demo "no signal" switch). */
  const online = () => {
    if (!isOnline()) throw new OfflineError();
  };
  const asStaff = async <T>(fn: string, args: Record<string, unknown>) => {
    online();
    const answer = await http.call<T>(fn, args, 'staff');
    sync.poke();
    return answer;
  };
  const asGuest = async <T>(fn: string, args: Record<string, unknown>) => {
    online();
    await auth.ensureGuest();
    const answer = await http.call<T>(fn, args, 'guest');
    sync.poke();
    return answer;
  };

  /**
   * The same announcement sent again (a double tap, or a retry after a lost answer) carries the
   * same reference, so the server sends it once. A new reference is made once one got through.
   */
  const sendRefs = new Map<string, string>();
  const sendRef = (content: string) => {
    const ref = sendRefs.get(content) ?? randomUuid();
    sendRefs.set(content, ref);
    return ref;
  };

  // ---------- Sign-up counts (staff only) ----------

  let registrations: Record<string, number> = {};
  const loadRegistrations = async () => {
    if (!auth.current('staff')) return {};
    const rows = await http.read<{ barangay_id: string; subscribers: number }[]>(
      'sms_subscriber_counts',
      {},
      'staff',
    );
    registrations = Object.fromEntries(rows.map((r) => [r.barangay_id, r.subscribers]));
    return registrations;
  };

  // ---------- The calculation, on this device's copy of the server's rows ----------

  const traceCache = new Map<string, ReturnType<typeof simulatedTrace>>();
  /** GPS for the claim check: the simulated trace, as on the sample data. */
  const traceFor = (s: TruckState) => {
    const route = ROUTES.find((r) => r.id === s.routeId)!;
    const key = `${s.routeId}|${Math.round(s.progressM / 25)}`;
    let trace = traceCache.get(key);
    if (!trace) {
      if (traceCache.size > 64) traceCache.clear();
      trace = simulatedTrace(route, s.progressM);
      traceCache.set(key, trace);
    }
    return trace;
  };
  const getEvents = () => remoteEvents(ROUTES);
  const getSchedules = () => remote().schedules ?? ROUTE_SCHEDULES;

  const base = createMockServices({
    getSimTime,
    getEvents,
    getAnnouncements: () => remote().announcements,
    addAnnouncement: viaServer,
    receiveUpload: viaServer,
    getTraces: () => ({}),
    isOnline,
    getTickets: () => remote().tickets,
    saveTicket: viaServer,
    nextTicketSeq: viaServer,
    getSchedules,
    saveSchedules: viaServer,
    getLeadChanges: () => remote().leadChanges,
    addLeadChange: viaServer,
    getContacts: () => remote().contacts,
    setContact: viaServer,
    getStaff: () => remote().staff,
    saveStaff: viaServer,
    getRegistrations: () => registrations,
    getGpsSummary: (shiftId) =>
      remote().gps[shiftId] ?? {
        points: 0,
        lastFixAt: null,
        source: remote().shifts.find((s) => s.id === shiftId)?.gpsSource ?? null,
      },
    getDecisions: () => remote().decisions,
  });

  const cityConfig = (): CityConfig => {
    const now = getSimTime();
    let minutes: number | null = null;
    for (const c of remote().leadChanges) if (c.at <= now) minutes = c.minutes;
    return { smsLeadMinutes: minutes ?? 15, contacts: remote().contacts };
  };

  /** The phone keeps its shift and its queue; only the PIN is asked again. */
  const endTruckSignIn = () => {
    useDriver.getState().signOut();
    useDriver.getState().setSync({ lastError: 'signin' });
  };

  // ---------- Tickets ----------

  /** Reads tickets again after this device acted on them, and puts them into the copy. */
  const refreshTickets = async (ids: string[], as: Caller): Promise<Ticket[]> => {
    const rows = await http.select<TicketRow>(
      'tickets',
      { select: TICKET_SELECT, id: `in.(${ids.join(',')})` },
      as,
    );
    const mapped = mapTickets(rows, ROUTES);
    sync.putTickets(mapped);
    return mapped.tickets;
  };

  /** How many times the ticket has been collected: makes each collection's photo names unique. */
  const collections = (ticketId: string) =>
    remote()
      .tickets.find((t) => t.id === ticketId)
      ?.history.filter((h) => h.kind === 'collected').length ?? 0;

  // ---------- Staff sign-in ----------

  let staffState: StaffAuthState = { status: 'loading' };
  const staffListeners = new Set<(state: StaffAuthState) => void>();
  const setStaff = (next: StaffAuthState) => {
    staffState = next;
    staffListeners.forEach((l) => l(next));
  };
  const saveProfile = (profile: StaffSession | null) =>
    (profile
      ? AsyncStorage.setItem(STAFF_PROFILE_KEY, JSON.stringify(profile))
      : AsyncStorage.removeItem(STAFF_PROFILE_KEY)
    ).catch(() => {});

  /** The signed-in login's own staff row: rights come from it, never from the login alone. */
  const readProfile = async (userId: string): Promise<StaffSession | null> => {
    const rows = await http.select<StaffRow>(
      'staff',
      { select: STAFF_COLUMNS, user_id: `eq.${userId}` },
      'staff',
    );
    const row = rows.find((r) => r.active);
    return row ? mapStaff(row) : null;
  };

  let checking: Promise<void> | null = null;
  /** Lines the staff state up with the saved login (at start, and whenever either changes). */
  const checkStaff = (): Promise<void> => {
    checking ??= (async () => {
      await auth.ready;
      const session = auth.current('staff');
      if (!session) {
        void saveProfile(null);
        return setStaff({ status: 'signed_out' });
      }
      if (staffState.status === 'loading') {
        // Open the dashboard at once with what was known last time; then check with the server.
        try {
          const saved = JSON.parse(
            (await AsyncStorage.getItem(STAFF_PROFILE_KEY)) ?? 'null',
          ) as StaffSession | null;
          if (saved?.id === session.userId) setStaff({ status: 'signed_in', staff: saved });
        } catch {
          // No saved profile: wait for the server.
        }
      }
      try {
        const profile = await readProfile(session.userId);
        if (auth.current('staff')?.userId !== session.userId) return;
        if (!profile) {
          await auth.signOut('staff');
          void saveProfile(null);
          return setStaff({ status: 'signed_out' });
        }
        void saveProfile(profile);
        setStaff({ status: 'signed_in', staff: profile });
      } catch (e) {
        // No signal: keep what is shown. A login the server no longer accepts ends here.
        if (e instanceof OfflineError && staffState.status !== 'loading') return;
        if (!auth.current('staff')) setStaff({ status: 'signed_out' });
        else if (staffState.status === 'loading') setStaff({ status: 'signed_out' });
      }
    })().finally(() => {
      checking = null;
    });
    return checking;
  };

  auth.subscribe(() => {
    const session = auth.current('staff');
    const shown = staffState.status === 'signed_in' ? staffState.staff.id : null;
    if ((session?.userId ?? null) !== shown) void checkStaff();
  });
  void checkStaff();

  // What the server says about the caller, at every pulse: a changed staff role is picked up,
  // and a truck sign-in that has ended (18 hours, or a new PIN) sends the crew back to the PIN.
  useRemote.subscribe((state, before) => {
    if (state.me === before.me || !state.meKnown) return;
    if (state.readerKey === auth.current('staff')?.userId) {
      if (staffState.status === 'signed_in' && state.me.role !== staffState.staff.role) {
        void checkStaff();
      }
    } else if (state.readerKey === auth.current('guest')?.userId) {
      if (state.me.truck == null && useDriver.getState().session) endTruckSignIn();
    }
  });

  sync.start();

  return {
    geo: base.geo,
    fleet: base.fleet,
    stats: base.stats,
    kolek: base.kolek,

    schedule: {
      getRouteSchedules: async () => getSchedules(),
      getExceptions: base.schedule.getExceptions,
      async updateRouteSchedule(change) {
        const errors = validateScheduleChange(change, getSimTime());
        if (errors.length) throw new Error(`Invalid schedule change: ${errors.join(', ')}`);
        await asStaff('schedule_change', {
          p_route_id: change.routeId,
          p_from: change.from,
          p_truck_id: change.truckId,
          p_days: change.days,
          p_start: change.start,
          p_window_end: change.windowEnd,
          p_waste_type: change.wasteType,
        });
        await sync.reload('schedules');
        return getSchedules();
      },
    },

    alerts: {
      subscribeAlerts: base.alerts.subscribeAlerts,
      async sendAnnouncement({ barangayIds, text }) {
        const body = text.trim();
        const content = `${[...barangayIds].sort().join(',')}|${body}`;
        const answer = await asStaff<{ id: number; sent_at: string; recipient_count: number }>(
          'announcement_send',
          { p_client_ref: sendRef(content), p_body: body, p_barangay_ids: barangayIds },
        );
        sendRefs.delete(content);
        const alert: OutboundAlert = {
          id: announcementId(answer.id),
          kind: 'announcement',
          barangayIds: [...barangayIds].sort(),
          sentAt: Date.parse(answer.sent_at),
          text: body,
          recipients: answer.recipient_count,
          segments: smsInfo(body).segments,
        };
        // Show it at once; the next pulse brings the stored row.
        if (!remote().announcements.some((a) => a.id === alert.id)) {
          useRemote.setState({
            announcements: [
              ...remote().announcements,
              {
                id: alert.id,
                barangayIds: alert.barangayIds,
                text: alert.text,
                sentAt: alert.sentAt,
                recipients: alert.recipients,
              },
            ],
          });
        }
        return alert;
      },
      async getSmsRegistrations() {
        try {
          return await loadRegistrations();
        } catch {
          // Not staff, or no signal: show what was known.
          return registrations;
        }
      },
    },

    ops: {
      subscribeOps: base.ops.subscribeOps,
      getMissedStreets: base.ops.getMissedStreets,
      async getTrace(shiftId) {
        const as = readerAs();
        if (as === 'anon') return [];
        return unpackGps(
          await http.select<GpsBatchRow>(
            'gps_batches',
            { select: GPS_COLUMNS, shift_id: `eq.${shiftId}`, order: 'from_index' },
            as,
          ),
        );
      },
      async decideSuggestion(suggestion, decision) {
        // A suggestion's id is "backup|<day>|<route>": that day and route are its key.
        const day = suggestion.id.split('|')[1];
        await asStaff('suggestion_decide', {
          p_day: day,
          p_route_id: suggestion.routeId,
          p_decision: decision,
        });
        useRemote.setState({
          decisions: { ...remote().decisions, [suggestion.id]: { decision, at: getSimTime() } },
        });
      },
    },

    reports: {
      subscribeTickets: base.reports.subscribeTickets,

      async submit(report) {
        online();
        await auth.ensureGuest();
        const ref = report.clientRef ?? randomUuid();
        // Allowed: no photo, a wide shot, or a wide shot and a close-up.
        const sent: ({ slot: 'wide' | 'close' } & PhotoArg)[] = [];
        for (const [i, photo] of report.photos.slice(0, 2).entries()) {
          const arg = await photos.toArg(photo, `${ref}|${i}`, 'guest');
          if (arg) sent.push({ slot: sent.length ? 'close' : 'wide', ...arg });
        }
        const id = await http.call<string>(
          'report_submit',
          {
            p_client_ref: ref,
            p_category: report.category,
            p_size: report.size,
            p_lng: report.location[0],
            p_lat: report.location[1],
            p_accuracy_m: report.accuracyM,
            p_landmark: report.landmark,
            p_near_waterway: report.nearWaterway,
            p_near_sensitive: report.nearSensitive,
            p_note: report.note,
            p_notify: report.contact != null,
            p_photos: sent,
          },
          'guest',
        );
        sync.poke();
        try {
          const ticket = (await refreshTickets([id], 'guest')).find((t) => t.id === id);
          if (ticket) return ticket;
        } catch {
          // The report is filed; only reading it back failed. The next pulse brings it.
        }
        return newTicket(id, report, {
          at: getSimTime(),
          barangayId: barangayAt(report.location, BARANGAYS)?.properties.id ?? null,
        });
      },

      async act(ticketId, action, by) {
        online();
        const as: Caller = by === 'enro' ? 'staff' : 'guest';
        const id = { p_ticket_id: ticketId };
        try {
          switch (action.type) {
            case 'verify':
              await http.call('ticket_verify', id, 'staff');
              break;
            case 'dispatch':
              await http.call(
                'ticket_dispatch',
                {
                  ...id,
                  p_mode: action.mode,
                  p_truck_id: action.truckId,
                  p_due: action.due == null ? null : new Date(action.due).toISOString(),
                },
                'staff',
              );
              break;
            case 'collect': {
              const key = `${ticketId}|collect|${collections(ticketId)}`;
              const after = await photos.toArg(action.after, `${key}|after`, 'staff');
              if (!after) throw new ServerError('after_photo_required', 400);
              const before = await photos.toArg(action.before, `${key}|before`, 'staff');
              await http.call(
                'ticket_collect',
                { ...id, p_after: after, p_before: before },
                'staff',
              );
              break;
            }
            case 'education':
              await http.call('ticket_educate', { ...id, p_note: action.note }, 'staff');
              break;
            case 'reject':
              await http.call('ticket_reject', { ...id, p_reason: action.reason }, 'staff');
              break;
            case 'merge':
              await http.call('ticket_merge', { ...id, p_into: action.into }, 'staff');
              break;
            case 'reopen':
              await http.call('ticket_reopen', { ...id, p_note: action.note }, 'guest');
              break;
            case 'rate':
              await http.call('ticket_rate', { ...id, p_stars: action.stars }, 'guest');
              break;
            default:
              // "start" comes from the truck phone's upload; "auto_close" is a rule, not an entry.
              throw new ServerError('bad_action', 400);
          }
        } catch (e) {
          // The ticket had already moved on (someone else acted, or an earlier try got through
          // and its answer was lost): show it as it is now instead of failing.
          if (!(e instanceof ServerError) || e.code !== 'invalid_transition') throw e;
        }
        sync.poke();
        const ids = action.type === 'merge' ? [ticketId, action.into] : [ticketId];
        const ticket = (await refreshTickets(ids, as)).find((t) => t.id === ticketId);
        if (!ticket) throw new ServerError('unknown_ticket', 404);
        return withAutoClose(ticket, getSimTime());
      },

      async checkMissed(place): Promise<ClaimResult> {
        // The device works out the verdict, as before; the server files at most one ticket per
        // street and day, and marks it verified only when the crew's own log proves the claim.
        const claim = evaluateClaim({ getSimTime, getEvents, getSchedules, traceFor }, place);
        if (!claim.collection) return { kind: 'no_collection_today', nextStart: claim.nextStart };
        const { collection: today, verdict, street } = claim;
        const file = async (basis: 'not_passed' | 'no_gps' | 'truck_full' | 'road_blocked') => {
          // A point outside the chosen barangay (GPS error) is left out: the street says where.
          const point =
            place.point && barangayAt(place.point, BARANGAYS)?.properties.id === place.barangayId
              ? place.point
              : null;
          const answer = await asGuest<{ ticket_id: string }>('claim_missed', {
            p_barangay_id: place.barangayId,
            p_route_id: today.routeId,
            p_street_key: street?.key ?? null,
            p_lng: point?.[0] ?? null,
            p_lat: point?.[1] ?? null,
            p_basis: basis,
          });
          void refreshTickets([answer.ticket_id], 'guest').catch(() => {});
          return answer.ticket_id;
        };
        switch (verdict.kind) {
          case 'no_collection_today':
            return { kind: 'no_collection_today', nextStart: null };
          case 'not_yet':
            return { kind: 'not_yet', arriveAt: verdict.arriveAt, truckId: today.truckId };
          case 'not_segregated':
          case 'please_photo':
            return verdict;
          case 'crew_not_at_fault':
            return {
              kind: 'crew_not_at_fault',
              reason: verdict.reason,
              ticketId: await file(verdict.reason),
            };
          case 'verified_miss':
            return { kind: 'verified_miss', ticketId: await file('not_passed') };
          case 'no_gps':
            return { kind: 'no_gps', ticketId: await file('no_gps') };
        }
      },

      async scheduleRecollection(missed, day) {
        const id = await asStaff<string>('recollection_create', {
          p_route_id: missed.routeId,
          p_street_key: missedStreetKey(missed),
          p_day: manilaDateKey(day),
          p_basis: missed.skipReason ?? (missed.reason === 'skipped' ? 'other' : missed.reason),
        });
        const ticket = (await refreshTickets([id], 'staff')).find((t) => t.id === id);
        if (!ticket) throw new ServerError('unknown_ticket', 404);
        return ticket;
      },
    },

    admin: {
      subscribeConfig: base.admin.subscribeConfig,
      subscribeStaff: base.admin.subscribeStaff,
      async setSmsLeadMinutes(minutes) {
        if (!Number.isInteger(minutes) || minutes < SMS_LEAD_MIN || minutes > SMS_LEAD_MAX) {
          throw new Error(`SMS lead time must be ${SMS_LEAD_MIN}–${SMS_LEAD_MAX} minutes`);
        }
        await asStaff('sms_lead_set', { p_minutes: minutes });
        await sync.reload('lead');
        return cityConfig();
      },
      async setContact(target, info) {
        await asStaff('contact_set', {
          p_barangay_id: target.kind === 'enro' ? null : target.barangayId,
          p_phone: info.phone ?? '',
          p_hours: info.hours ?? '',
        });
        await sync.reload('contacts');
        return cityConfig();
      },
      async saveStaff(user) {
        if (!user.name.trim()) throw new Error('A name is required');
        await asStaff('staff_save', {
          p_user_id: user.id,
          p_name: user.name.trim(),
          p_role: user.role,
          p_barangay_id: user.barangayId,
          p_active: user.active,
        });
        await sync.reload('staff');
      },
    },

    driver: {
      async signIn(truckId, pin) {
        online();
        const truck = TRUCKS.find((t) => t.id === truckId);
        if (!truck) throw new SignInError('unknown_truck');
        await auth.ensureGuest();
        const answer = await http.call<{
          ok: boolean;
          error?: 'unknown_truck' | 'wrong_pin' | 'locked';
          attempts_left?: number;
          locked_until?: string | null;
        }>('driver_sign_in', { p_truck_code: truck.code, p_pin: pin }, 'guest');
        if (!answer.ok) {
          throw new SignInError(answer.error ?? 'wrong_pin', {
            attemptsLeft: answer.attempts_left,
            lockedUntil: answer.locked_until ? Date.parse(answer.locked_until) : undefined,
          });
        }
        sync.poke();
        return { truckId, signedInAt: getSimTime() };
      },

      async signOut() {
        try {
          if (auth.current('guest') && isOnline()) await http.call('driver_sign_out', {}, 'guest');
        } catch {
          // The sign-in ends on its own after 18 hours.
        }
      },

      async upload(batch): Promise<UploadResult> {
        online();
        await auth.ready;
        if (!auth.current('guest')) throw new SignInError('expired');
        try {
          // Proof photos go to storage first; the event then only names them.
          const events: Record<string, unknown>[] = [];
          for (const e of batch.events) {
            const arg = (photo: PhotoRef | null, slot: string) =>
              photos.toArg(photo, `${e.id}|${slot}`, 'guest');
            events.push(
              toUploadEvent(
                e,
                batch.gps?.shiftId ?? null,
                e.kind === 'task' && e.action === 'done'
                  ? { before: await arg(e.before, 'before'), after: await arg(e.after, 'after') }
                  : null,
              ),
            );
          }
          // Fix times are the phone's own clock: send them in the server's time.
          const offset = sync.clockOffset();
          const answer = await http.call<{
            events: {
              id: string;
              result: 'stored' | 'duplicate' | 'rejected';
              reason: string | null;
            }[];
            gps: {
              result: 'stored' | 'duplicate' | 'gap' | 'rejected';
              reason: string | null;
              next_index: number;
            } | null;
          }>(
            'driver_upload',
            {
              p_events: events,
              p_gps: batch.gps
                ? {
                    shift_id: batch.gps.shiftId,
                    source: batch.gps.source,
                    from_index: batch.gps.fromIndex,
                    fixes: batch.gps.fixes.map((f) => ({
                      t: Math.round(f.t + offset),
                      lng: f.lng,
                      lat: f.lat,
                      acc: f.acc,
                    })),
                  }
                : null,
            },
            'guest',
          );
          sync.poke();
          return {
            accepted: answer.events.filter((e) => e.result !== 'rejected').map((e) => e.id),
            rejected: answer.events
              .filter((e) => e.result === 'rejected')
              .map((e) => ({ id: e.id, reason: e.reason ?? 'rejected' })),
            gps:
              batch.gps && answer.gps
                ? {
                    nextIndex: answer.gps.next_index,
                    blocked:
                      answer.gps.result === 'rejected' ? (answer.gps.reason ?? 'rejected') : null,
                  }
                : null,
          };
        } catch (e) {
          // The truck sign-in ended (18 hours, or a new PIN): the crew signs in again.
          if (needsSignIn(e)) throw new SignInError('expired');
          throw e;
        }
      },

      subscribeOwnTruck: base.driver.subscribeOwnTruck,
    },

    resident: {
      async subscribeSms(mobile, barangayId) {
        await asGuest('sms_subscribe', { p_mobile: mobile, p_barangay_id: barangayId });
      },
      async unsubscribeSms() {
        await auth.ready;
        if (!auth.current('guest')) return;
        online();
        await http.call('sms_unsubscribe', {}, 'guest');
      },
      async forgetMe() {
        await auth.ready;
        if (!auth.current('guest')) return;
        online();
        try {
          await http.call('forget_me', {}, 'guest');
        } catch (e) {
          // Already gone on the server: forgetting it here is all that is left to do.
          if (!needsSignIn(e)) throw e;
        }
        await auth.forget('guest');
        sync.poke();
      },
    },

    auth: {
      required: true,
      subscribe(listener) {
        staffListeners.add(listener);
        listener(staffState);
        return () => {
          staffListeners.delete(listener);
        };
      },
      async signIn(email, password) {
        online();
        const session = await auth.signInStaff(email, password);
        const profile = await readProfile(session.userId).catch(async (e) => {
          await auth.signOut('staff');
          throw e;
        });
        if (!profile) {
          // A login without an active staff row has no rights at all.
          await auth.signOut('staff');
          throw new ServerError('not_staff', 403);
        }
        void saveProfile(profile);
        setStaff({ status: 'signed_in', staff: profile });
        sync.poke();
        return profile;
      },
      async signOut() {
        await auth.signOut('staff');
        void saveProfile(null);
        setStaff({ status: 'signed_out' });
        sync.poke();
      },
    },

    demo: {
      shared: true,
      async jumpTo(simMs) {
        await asStaff('demo_clock_set', { p_sim: new Date(simMs).toISOString() });
      },
      async setSpeed(speed) {
        await asStaff('demo_clock_set', { p_speed: speed });
      },
      async goLive() {
        await asStaff('demo_clock_clear', {});
      },
      async breakdown(truckId) {
        await asStaff('demo_incident', { p_truck_id: truckId });
      },
      async reset() {
        const answer = await asStaff<{ photos_to_remove?: string[] }>('demo_reset', {
          p_confirm: 'RESET',
        });
        try {
          await photos.remove(answer?.photos_to_remove ?? [], 'staff');
        } catch {
          // The rows are gone either way; leftover files are listed again by the next reset.
        }
        sync.forgetActivity();
        sync.poke();
      },
    },

    photos: {
      getUrl: (path) => photos.getUrl(path, readerAs()),
    },

    // Not on the pilot database yet: each turns on when its tables and entry points exist.
    features: NO_FEATURES,
    // Real on the pilot once its migration is applied; the switch above keeps the screens hidden.
    account: createSupabaseAccount({ auth, http, store: AsyncStorage }),
    hauling: unavailableHauling,
    rewards: unavailableRewards,
    scanner: unavailableScanner,
  };
}
