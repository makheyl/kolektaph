import {
  BARANGAYS,
  CITY_META,
  ROUTE_SCHEDULES,
  ROUTES,
  SCHEDULE_EXCEPTIONS,
  TRUCKS,
} from '@/data/carmona';
import { simulateFleet } from '@/simulator/truckSimulator';

import type { Services, TruckState } from '../types';

const TICK_MS = 1000;

/**
 * Mock services backed by static Carmona data and the deterministic simulator.
 * `getSimTime` supplies the (possibly demo-shifted) current time.
 */
export function createMockServices(getSimTime: () => number): Services {
  return {
    geo: {
      getBarangays: async () => BARANGAYS,
      getCityMeta: async () => CITY_META,
    },
    fleet: {
      getTrucks: async () => TRUCKS,
      getRoutes: async () => ROUTES,
      subscribeTruckStates(listener: (states: TruckState[]) => void) {
        const emit = () =>
          listener(
            simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, getSimTime(), SCHEDULE_EXCEPTIONS),
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
  };
}
