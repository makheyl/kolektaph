import { BARANGAYS, CITY_META, ROUTE_SCHEDULES, ROUTES, TRUCKS } from '@/data/carmona';
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
      getRouteSchedules: async () => ROUTE_SCHEDULES,
      subscribeTruckStates(listener: (states: TruckState[]) => void) {
        const emit = () => listener(simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, getSimTime()));
        emit();
        const timer = setInterval(emit, TICK_MS);
        return () => clearInterval(timer);
      },
    },
  };
}
