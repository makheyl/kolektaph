/**
 * "This week" figures for the City ENRO dashboard (SAMPLE: computed from the simulated runs;
 * with real data they come from trip logs and weighbridge slips).
 */
import { routeRunsOnDay } from '@/features/schedule/collections';
import { atManilaTime, DAY, manilaParts, manilaStartOfDay } from '@/lib/time';
import type {
  Route,
  RouteSchedule,
  ScheduleException,
  Truck,
  TruckEvent,
  WeeklyStats,
} from '@/services/types';
import { getTimeline, simulateTruck } from '@/simulator/truckSimulator';

export function weeklyStats(
  input: {
    trucks: Truck[];
    schedules: RouteSchedule[];
    routes: Route[];
    exceptions: ScheduleException[];
    events: TruckEvent[];
    capacityTonnes: number;
  },
  now: number,
): WeeklyStats {
  const today = manilaStartOfDay(now);
  // Week starts on Monday.
  const monday = today - ((manilaParts(now).weekday + 6) % 7) * DAY;
  let tonnes = 0;
  let trips = 0;
  let scheduledM = 0;
  let servedM = 0;

  for (let day = monday; day <= today; day += DAY) {
    const at = day === today ? now : atManilaTime(day, '23:59');
    for (const s of input.schedules) {
      if (!routeRunsOnDay(s, day, input.exceptions).runs) continue;
      const truck = input.trucks.find((t) => t.id === s.truckId);
      const route = input.routes.find((r) => r.id === s.routeId);
      if (!truck || !route) continue;
      const state = simulateTruck(
        truck,
        input.schedules,
        input.routes,
        at,
        input.exceptions,
        input.events,
      );
      if (state.status === 'not_started' || state.status === 'off_duty') continue;
      // One trip to the disposal site at the end of the run, plus any made mid-route (driver
      // app); each mid-route trip is counted as a full load.
      trips += 1 + state.trips;
      tonnes += (state.load + state.trips) * input.capacityTonnes;
      // Served share counts only finished runs (done, or full = cannot finish).
      if (state.status === 'done' || state.status === 'full') {
        const collectM = getTimeline(route).collectLengthM;
        scheduledM += collectM;
        if (state.status === 'done' && state.progressM >= state.routeLengthM) servedM += collectM;
        else if (state.shift) servedM += collectM * (state.progressM / state.routeLengthM);
        else servedM += collectM / s.expectedLoad;
      }
    }
  }
  return {
    tonnes: Math.round(tonnes * 10) / 10,
    trips,
    servedRate: scheduledM === 0 ? 1 : servedM / scheduledM,
  };
}
