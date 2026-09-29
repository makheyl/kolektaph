import {
  BARANGAYS,
  CITY_META,
  ROUTE_SCHEDULES,
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
import { suggestBackups } from '@/features/load/backup';
import { routeRunsOnDay } from '@/features/schedule/collections';
import { weeklyStats } from '@/features/stats/weekly';
import { atManilaTime, DAY, manilaDateKey, manilaStartOfDay, MINUTE } from '@/lib/time';
import { simulatedTrace, simulateFleet } from '@/simulator/truckSimulator';

import type {
  Announcement,
  MissedStreet,
  OpsSnapshot,
  OutboundAlert,
  ScenarioEvent,
  Services,
  TruckState,
} from '../types';

const TICK_MS = 1000;
const ALERT_TICK_MS = 2000;
const OPS_TICK_MS = 2000;
const INBOX_DAYS = 7;

export interface MockDeps {
  /** Current (possibly demo-shifted) time. */
  getSimTime: () => number;
  /** Scripted incidents from the demo controls. */
  getEvents: () => ScenarioEvent[];
  /** Stand-in for the backend's announcements table. */
  getAnnouncements: () => Announcement[];
  addAnnouncement: (a: Announcement) => void;
}

const barangayName = (id: string) =>
  BARANGAYS.features.find((f) => f.properties.id === id)?.properties.name ?? id;

/**
 * Mock services backed by static Carmona data, the deterministic simulator and the alert
 * engine. A real backend implements the same `Services` interface.
 */
export function createMockServices(deps: MockDeps): Services {
  const engineContext = (events: ScenarioEvent[]): EngineContext => ({
    schedules: ROUTE_SCHEDULES,
    routes: ROUTES,
    exceptions: SCHEDULE_EXCEPTIONS,
    trucks: TRUCKS,
    events,
    registrations: SMS_REGISTRATIONS,
    barangayName,
    weekdayFil: (w) => WEEKDAYS_FIL[w],
  });

  // A replayed day never changes unless the scenario events change, so cache per day.
  const dayCache = new Map<string, OutboundAlert[]>();
  const alertsForDay = (day: number, events: ScenarioEvent[]) => {
    const key = `${manilaDateKey(day)}|${JSON.stringify(events)}`;
    let alerts = dayCache.get(key);
    if (!alerts) {
      alerts = alertLog(engineContext(events), day, day);
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

  const opsSnapshot = (): OpsSnapshot => {
    const now = deps.getSimTime();
    const events = deps.getEvents();
    const states = simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, now, SCHEDULE_EXCEPTIONS, events);

    const missed: MissedStreet[] = [];
    for (const s of states) {
      if (!s.routeId || s.status === 'off_duty' || s.status === 'not_started') continue;
      const route = ROUTES.find((r) => r.id === s.routeId);
      const schedule = ROUTE_SCHEDULES.find(
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
        }),
      );
    }

    const weeklyKey = `${Math.floor(now / (5 * MINUTE))}|${JSON.stringify(events)}`;
    if (weeklyCache?.key !== weeklyKey) {
      weeklyCache = {
        key: weeklyKey,
        value: weeklyStats(
          {
            trucks: TRUCKS,
            schedules: ROUTE_SCHEDULES,
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
      suggestions: suggestBackups(states, ROUTES, ROUTE_SCHEDULES, now, missed),
      weekly: weeklyCache.value,
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
              ROUTE_SCHEDULES,
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
      getRouteSchedules: async () => ROUTE_SCHEDULES,
      getExceptions: async () => SCHEDULE_EXCEPTIONS,
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
    },
  };
}
