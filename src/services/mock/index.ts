import {
  BARANGAYS,
  CITY_META,
  DRIVER_DEMO_PIN,
  ROUTES,
  SCHEDULE_EXCEPTIONS,
  SMS_REGISTRATIONS,
  TRUCK_CAPACITY_TONNES,
  TRUCKS,
} from '@/data/carmona';
import { alertLog, type EngineContext } from '@/features/alerts/engine';
import { smsInfo } from '@/features/alerts/sms';
import { WEEKDAYS_FIL } from '@/features/alerts/templates';
import { missedStreets } from '@/features/coverage/coverage';
import { skipsBySegment } from '@/features/driver/streets';
import { suggestBackups } from '@/features/load/backup';
import { routeRunsOnDay } from '@/features/schedule/collections';
import { applyScheduleChange, validateScheduleChange } from '@/features/schedule/editing';
import { weeklyStats } from '@/features/stats/weekly';
import { VICINITY_MINUTES } from '@/features/tracking/eta';
import { atManilaTime, DAY, manilaDateKey, manilaStartOfDay, MINUTE } from '@/lib/time';
import { simulatedTrace, simulateFleet, simulateTruck } from '@/simulator/truckSimulator';

import { OfflineError, SignInError } from '../errors';
import { createMockKolek } from './kolek';
import { createMockReports } from './reports';
import { createMockStats } from './stats';
import type {
  Announcement,
  CityConfig,
  ContactInfo,
  ContactTarget,
  GpsFix,
  GpsSource,
  MissedStreet,
  OpsSnapshot,
  OutboundAlert,
  RouteSchedule,
  Services,
  ShiftSummary,
  StaffUser,
  Ticket,
  TruckEvent,
  TruckState,
  UploadBatch,
} from '../types';

const TICK_MS = 1000;
const ALERT_TICK_MS = 2000;
const OPS_TICK_MS = 2000;
const INBOX_DAYS = 7;
const CONFIG_TICK_MS = 2000;
/** Allowed SMS lead times (minutes); the replay starts 30 minutes before departure. */
export const SMS_LEAD_MIN = 5;
export const SMS_LEAD_MAX = 30;
/** Simulated round trip to the server. */
const NETWORK_MS = 250;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface MockDeps {
  /** Current (possibly demo-shifted) time. */
  getSimTime: () => number;
  /** Every truck event the server knows: driver uploads and demo incidents. */
  getEvents: () => TruckEvent[];
  /** Stand-in for the backend's announcements table. */
  getAnnouncements: () => Announcement[];
  addAnnouncement: (a: Announcement) => void;
  /** Stand-in for the backend's driver-upload endpoint and GPS table. */
  receiveUpload: (batch: UploadBatch) => void;
  getTraces: () => Record<string, { truckId: string; source: GpsSource; fixes: GpsFix[] }>;
  /** Whether this device can reach the server right now. */
  isOnline: () => boolean;
  /** Stand-in for the backend's tickets table. */
  getTickets: () => Ticket[];
  saveTicket: (t: Ticket) => void;
  nextTicketSeq: () => number;
  /** Stand-in for the backend's settings tables (schedules, SMS lead time, contacts, staff). */
  getSchedules: () => RouteSchedule[];
  saveSchedules: (schedules: RouteSchedule[]) => void;
  getLeadChanges: () => { at: number; minutes: number }[];
  addLeadChange: (at: number, minutes: number) => void;
  getContacts: () => CityConfig['contacts'];
  setContact: (target: ContactTarget, info: ContactInfo) => void;
  getStaff: () => StaffUser[];
  saveStaff: (user: StaffUser) => void;
}

const barangayName = (id: string) =>
  BARANGAYS.features.find((f) => f.properties.id === id)?.properties.name ?? id;

/**
 * Mock services backed by static Carmona data, the deterministic simulator and the alert
 * engine. A real backend implements the same `Services` interface.
 */
export function createMockServices(deps: MockDeps): Services {
  const schedules = () => deps.getSchedules();
  /** SMS lead time in force at a moment (changes never rewrite alerts already sent). */
  const leadAt = (at: number) => {
    let minutes = VICINITY_MINUTES;
    for (const c of deps.getLeadChanges()) if (c.at <= at) minutes = c.minutes;
    return minutes;
  };
  /** Changes whenever a setting that affects the replayed day changes. */
  const configKey = () => JSON.stringify([deps.getSchedules(), deps.getLeadChanges()]);

  const engineContext = (events: TruckEvent[]): EngineContext => ({
    schedules: schedules(),
    routes: ROUTES,
    exceptions: SCHEDULE_EXCEPTIONS,
    trucks: TRUCKS,
    events,
    registrations: SMS_REGISTRATIONS,
    barangayName,
    weekdayFil: (w) => WEEKDAYS_FIL[w],
    vicinityMinutes: leadAt,
  });

  // A replayed day only changes when that day's truck events change, so cache per day.
  const dayCache = new Map<string, OutboundAlert[]>();
  const alertsForDay = (day: number, events: TruckEvent[]) => {
    const dayEvents = events.filter((e) => e.at >= day && e.at < day + DAY);
    const key = `${manilaDateKey(day)}|${configKey()}|${JSON.stringify(dayEvents)}`;
    let alerts = dayCache.get(key);
    if (!alerts) {
      if (dayCache.size > 64) dayCache.clear();
      alerts = alertLog(engineContext(dayEvents), day, day);
      dayCache.set(key, alerts);
    }
    return alerts;
  };

  const announcementAlert = (a: Announcement): OutboundAlert => ({
    id: a.id,
    kind: 'announcement',
    barangayIds: a.barangayIds,
    sentAt: a.sentAt,
    text: a.text,
    recipients: a.barangayIds.reduce((sum, b) => sum + (SMS_REGISTRATIONS[b] ?? 0), 0),
    segments: smsInfo(a.text).segments,
  });

  const currentAlerts = (): OutboundAlert[] => {
    const now = deps.getSimTime();
    const events = deps.getEvents();
    const today = manilaStartOfDay(now);
    const out: OutboundAlert[] = [];
    for (let d = today - INBOX_DAYS * DAY; d <= today; d += DAY) {
      out.push(...alertsForDay(d, events).filter((a) => a.sentAt <= now));
    }
    out.push(
      ...deps
        .getAnnouncements()
        .filter((a) => a.sentAt <= now && a.sentAt >= today - INBOX_DAYS * DAY)
        .map(announcementAlert),
    );
    return out.sort((a, b) => b.sentAt - a.sentAt);
  };

  // Truck traces only change when a truck moves; cache by route + distance driven.
  const traceCache = new Map<string, ReturnType<typeof simulatedTrace>>();
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

  let weeklyCache: { key: string; value: OpsSnapshot['weekly'] } | null = null;

  const shiftSummaries = (events: TruckEvent[]): ShiftSummary[] => {
    const traces = deps.getTraces();
    return events.flatMap((e) => {
      if (e.kind !== 'shift_start') return [];
      const end = events.find((x) => x.kind === 'shift_end' && x.shiftId === e.shiftId);
      const trace = traces[e.shiftId];
      return [
        {
          shiftId: e.shiftId,
          truckId: e.truckId,
          routeId: e.routeId,
          startedAt: e.at,
          endedAt: end?.at ?? null,
          crew: e.crew,
          gps: {
            points: trace?.fixes.length ?? 0,
            lastFixAt: trace?.fixes[trace.fixes.length - 1]?.t ?? null,
            source: trace?.source ?? null,
          },
        },
      ];
    });
  };

  /** Missed streets by `now` for the given fleet states (GPS check + crew skip reasons). */
  const missedFor = (states: TruckState[], now: number, events: TruckEvent[]): MissedStreet[] => {
    const today = manilaStartOfDay(now);
    const todays = events.filter((e) => e.at >= today && e.at <= now);
    const missed: MissedStreet[] = [];
    for (const s of states) {
      if (!s.routeId || s.status === 'off_duty' || s.status === 'not_started') continue;
      const route = ROUTES.find((r) => r.id === s.routeId);
      const schedule = schedules().find(
        (sc) => sc.routeId === s.routeId && routeRunsOnDay(sc, now, SCHEDULE_EXCEPTIONS).runs,
      );
      if (!route || !schedule) continue;
      missed.push(
        ...missedStreets({
          route,
          truck: s,
          trace: traceFor(s),
          windowEnd: atManilaTime(now, schedule.windowEnd),
          now,
          skips: skipsBySegment(
            todays.filter((e) => e.truckId === s.truckId),
            route.id,
          ),
        }),
      );
    }
    return missed;
  };

  const opsSnapshot = (): OpsSnapshot => {
    const now = deps.getSimTime();
    const events = deps.getEvents();
    const today = manilaStartOfDay(now);
    const todays = events.filter((e) => e.at >= today && e.at <= now).sort((a, b) => a.at - b.at);
    const states = simulateFleet(TRUCKS, schedules(), ROUTES, now, SCHEDULE_EXCEPTIONS, events);

    const missed = missedFor(states, now, events);

    const weeklyKey = `${Math.floor(now / (5 * MINUTE))}|${configKey()}|${JSON.stringify(events)}`;
    if (weeklyCache?.key !== weeklyKey) {
      weeklyCache = {
        key: weeklyKey,
        value: weeklyStats(
          {
            trucks: TRUCKS,
            schedules: schedules(),
            routes: ROUTES,
            exceptions: SCHEDULE_EXCEPTIONS,
            events,
            capacityTonnes: TRUCK_CAPACITY_TONNES,
          },
          now,
        ),
      };
    }

    return {
      at: now,
      states,
      missed,
      suggestions: suggestBackups(states, ROUTES, schedules(), now, missed),
      weekly: weeklyCache.value,
      events: todays,
      shifts: shiftSummaries(todays),
    };
  };

  return {
    geo: {
      getBarangays: async () => BARANGAYS,
      getCityMeta: async () => CITY_META,
    },
    fleet: {
      getTrucks: async () => TRUCKS,
      getRoutes: async () => ROUTES,
      subscribeTruckStates(listener) {
        const emit = () =>
          listener(
            simulateFleet(
              TRUCKS,
              schedules(),
              ROUTES,
              deps.getSimTime(),
              SCHEDULE_EXCEPTIONS,
              deps.getEvents(),
            ),
          );
        emit();
        const timer = setInterval(emit, TICK_MS);
        return () => clearInterval(timer);
      },
    },
    schedule: {
      getRouteSchedules: async () => schedules(),
      getExceptions: async () => SCHEDULE_EXCEPTIONS,
      async updateRouteSchedule(change) {
        await wait(NETWORK_MS);
        if (!deps.isOnline()) throw new OfflineError();
        const errors = validateScheduleChange(change, deps.getSimTime());
        if (errors.length) throw new Error(`Invalid schedule change: ${errors.join(', ')}`);
        const next = applyScheduleChange(schedules(), change);
        deps.saveSchedules(next);
        return next;
      },
    },
    alerts: {
      subscribeAlerts(listener) {
        let last = '';
        const emit = () => {
          const alerts = currentAlerts();
          const signature = `${alerts.length}|${alerts[0]?.id ?? ''}`;
          if (signature === last) return;
          last = signature;
          listener(alerts);
        };
        emit();
        const timer = setInterval(emit, ALERT_TICK_MS);
        return () => clearInterval(timer);
      },
      async sendAnnouncement({ barangayIds, text }) {
        const sentAt = deps.getSimTime();
        const a: Announcement = {
          id: `announcement|${sentAt}|${Math.random().toString(36).slice(2, 8)}`,
          barangayIds,
          text,
          sentAt,
        };
        deps.addAnnouncement(a);
        return announcementAlert(a);
      },
      getSmsRegistrations: async () => SMS_REGISTRATIONS,
    },
    ops: {
      subscribeOps(listener) {
        const emit = () => listener(opsSnapshot());
        emit();
        const timer = setInterval(emit, OPS_TICK_MS);
        return () => clearInterval(timer);
      },
      getTrace: async (shiftId) => deps.getTraces()[shiftId]?.fixes ?? [],
      async getMissedStreets(day) {
        const now = deps.getSimTime();
        const dayStart = manilaStartOfDay(day);
        if (dayStart > now) return [];
        const at = Math.min(now, atManilaTime(dayStart, '23:59'));
        const events = deps.getEvents();
        const states = simulateFleet(TRUCKS, schedules(), ROUTES, at, SCHEDULE_EXCEPTIONS, events);
        return missedFor(states, at, events);
      },
    },
    reports: createMockReports({
      getSimTime: deps.getSimTime,
      getEvents: deps.getEvents,
      getTickets: deps.getTickets,
      saveTicket: deps.saveTicket,
      nextTicketSeq: deps.nextTicketSeq,
      isOnline: deps.isOnline,
      traceFor,
      getSchedules: schedules,
    }),
    admin: {
      subscribeConfig(listener) {
        let last = '';
        const emit = () => {
          const config: CityConfig = {
            smsLeadMinutes: leadAt(deps.getSimTime()),
            contacts: deps.getContacts(),
          };
          const signature = JSON.stringify(config);
          if (signature === last) return;
          last = signature;
          listener(config);
        };
        emit();
        const timer = setInterval(emit, CONFIG_TICK_MS);
        return () => clearInterval(timer);
      },
      async setSmsLeadMinutes(minutes) {
        await wait(NETWORK_MS);
        if (!deps.isOnline()) throw new OfflineError();
        if (!Number.isInteger(minutes) || minutes < SMS_LEAD_MIN || minutes > SMS_LEAD_MAX) {
          throw new Error(`SMS lead time must be ${SMS_LEAD_MIN}–${SMS_LEAD_MAX} minutes`);
        }
        const now = deps.getSimTime();
        deps.addLeadChange(now, minutes);
        return { smsLeadMinutes: leadAt(now), contacts: deps.getContacts() };
      },
      async setContact(target, info) {
        await wait(NETWORK_MS);
        if (!deps.isOnline()) throw new OfflineError();
        const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
        deps.setContact(target, { phone: clean(info.phone), hours: clean(info.hours) });
        return { smsLeadMinutes: leadAt(deps.getSimTime()), contacts: deps.getContacts() };
      },
      subscribeStaff(listener) {
        let last = '';
        const emit = () => {
          const staff = deps.getStaff();
          const signature = JSON.stringify(staff);
          if (signature === last) return;
          last = signature;
          listener(staff);
        };
        emit();
        const timer = setInterval(emit, CONFIG_TICK_MS);
        return () => clearInterval(timer);
      },
      async saveStaff(user) {
        await wait(NETWORK_MS);
        if (!deps.isOnline()) throw new OfflineError();
        if (!user.name.trim()) throw new Error('A name is required');
        deps.saveStaff({ ...user, name: user.name.trim() });
      },
    },
    stats: createMockStats({
      getSimTime: deps.getSimTime,
      getEvents: deps.getEvents,
      getSchedules: schedules,
      missedFor,
      alertsForDay,
    }),
    kolek: createMockKolek({
      getSimTime: deps.getSimTime,
      getEvents: deps.getEvents,
      getSchedules: schedules,
      getTickets: deps.getTickets,
      getContacts: deps.getContacts,
      leadAt,
      weekly: () => opsSnapshot().weekly,
    }),
    driver: {
      async signIn(truckId, pin) {
        await wait(NETWORK_MS);
        if (!deps.isOnline()) throw new OfflineError();
        if (!TRUCKS.some((t) => t.id === truckId)) throw new SignInError('unknown_truck');
        if (pin !== DRIVER_DEMO_PIN) throw new SignInError('wrong_pin');
        return { truckId, signedInAt: deps.getSimTime() };
      },
      async upload(batch) {
        await wait(NETWORK_MS);
        if (!deps.isOnline()) throw new OfflineError();
        deps.receiveUpload(batch);
      },
      subscribeOwnTruck(truckId, getLocalEvents, listener) {
        const truck = TRUCKS.find((t) => t.id === truckId);
        if (!truck) return () => {};
        const emit = () => {
          const local = getLocalEvents();
          const ids = new Set(local.map((e) => e.id));
          const events = [...deps.getEvents().filter((e) => !ids.has(e.id)), ...local];
          listener(
            simulateTruck(
              truck,
              schedules(),
              ROUTES,
              deps.getSimTime(),
              SCHEDULE_EXCEPTIONS,
              events,
            ),
          );
        };
        emit();
        const timer = setInterval(emit, TICK_MS);
        return () => clearInterval(timer);
      },
    },
  };
}
