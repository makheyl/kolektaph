/**
 * Mock StatsService: per-day figures replayed from the deterministic simulation, the GPS
 * coverage check (missed streets) and the alert log, the same sources Live Operations uses.
 * SAMPLE numbers: with real data they come from trip logs, weighbridge slips and GPS.
 */
import { ROUTES, SCHEDULE_EXCEPTIONS, TRUCK_CAPACITY_TONNES, TRUCKS } from '@/data/carmona';
import { routeRunsOnDay } from '@/features/schedule/collections';
import { segmentStarts } from '@/features/tracking/eta';
import { atManilaTime, DAY, manilaStartOfDay } from '@/lib/time';
import { simulateFleet } from '@/simulator/truckSimulator';

import type {
  BarangayDayStat,
  DailyStats,
  MissedStreet,
  OutboundAlert,
  RouteSchedule,
  RunDayStat,
  StatsService,
  TruckEvent,
  TruckState,
} from '../types';

export interface StatsDeps {
  getSimTime: () => number;
  getEvents: () => TruckEvent[];
  getSchedules: () => RouteSchedule[];
  /** Missed streets by `now` (GPS coverage check + crew skip reasons). */
  missedFor: (states: TruckState[], now: number, events: TruckEvent[]) => MissedStreet[];
  /** Every automatic alert of a Manila day. */
  alertsForDay: (day: number, events: TruckEvent[]) => OutboundAlert[];
}

const FINISHED = new Set<TruckState['status']>(['done', 'full']);

export function createMockStats(deps: StatsDeps): StatsService {
  const dayStats = (day: number, now: number): DailyStats => {
    const today = manilaStartOfDay(now);
    const at = day === today ? now : atManilaTime(day, '23:59');
    const events = deps.getEvents();
    const schedules = deps.getSchedules();
    const states = simulateFleet(TRUCKS, schedules, ROUTES, at, SCHEDULE_EXCEPTIONS, events);
    const missed = deps.missedFor(states, at, events);
    const vicinity = deps
      .alertsForDay(day, events)
      .filter((a) => (a.kind === 'vicinity' || a.kind === 'vicinity_now') && a.sentAt <= at);

    const runs: RunDayStat[] = [];
    const barangays: BarangayDayStat[] = [];
    for (const s of states) {
      if (!s.routeId || s.status === 'off_duty' || s.status === 'not_started') continue;
      const schedule = schedules.find(
        (sc) => sc.routeId === s.routeId && routeRunsOnDay(sc, day, SCHEDULE_EXCEPTIONS).runs,
      );
      const route = ROUTES.find((r) => r.id === s.routeId);
      if (!schedule || !route) continue;
      // Same rule as the weekly figure on Live Operations: one trip at the end of the run plus
      // any mid-route trips, each counted as a full load.
      const tonnes = (s.load + s.trips) * TRUCK_CAPACITY_TONNES;
      runs.push({
        day,
        routeId: route.id,
        truckId: s.truckId,
        trips: 1 + s.trips,
        tonnes: Math.round(tonnes * 10) / 10,
      });

      const windowEnd = atManilaTime(day, schedule.windowEnd);
      // Before the run ends, only streets the truck has already passed count.
      const reachedM = FINISHED.has(s.status) || at >= windowEnd ? Infinity : s.progressM;
      const starts = segmentStarts(route);
      const rows = route.barangayIds.map((b) => {
        let collectM = 0;
        let passedM = 0;
        route.segments.forEach((seg, i) => {
          if (!seg.collect || seg.barangayId !== b) return;
          collectM += seg.lengthM;
          if (starts[i] + seg.lengthM <= reachedM) passedM += seg.lengthM;
        });
        const missedM = missed
          .filter((m) => m.routeId === route.id && m.barangayId === b)
          .reduce((sum, m) => sum + m.lengthM, 0);
        const sms = vicinity.find((a) => a.barangayIds.includes(b) && a.truckId === s.truckId);
        return {
          day,
          barangayId: b,
          routeId: route.id,
          truckId: s.truckId,
          collectM: Math.round(collectM),
          servedM: Math.round(Math.max(0, passedM - missedM)),
          tonnes: 0,
          windowEnd,
          arrivedAt: s.visits[b]?.startedAt ?? null,
          finishedAt: s.visits[b]?.finishedAt ?? null,
          smsAt: sms?.sentAt ?? null,
        };
      });
      const servedTotal = rows.reduce((sum, r) => sum + r.servedM, 0);
      for (const r of rows) {
        r.tonnes = servedTotal ? Math.round(((tonnes * r.servedM) / servedTotal) * 100) / 100 : 0;
        barangays.push(r);
      }
    }
    return { runs, barangays };
  };

  return {
    async getDailyStats(fromDay, toDay) {
      const now = deps.getSimTime();
      const out: DailyStats = { runs: [], barangays: [] };
      const last = Math.min(manilaStartOfDay(toDay), manilaStartOfDay(now));
      for (let day = manilaStartOfDay(fromDay); day <= last; day += DAY) {
        // Replaying a day takes a moment; let the screen breathe between days.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const d = dayStats(day, now);
        out.runs.push(...d.runs);
        out.barangays.push(...d.barangays);
      }
      return out;
    },
  };
}
