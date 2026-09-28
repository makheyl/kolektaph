import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { services } from '@/services';
import type { TruckState } from '@/services/types';
import { simNow } from '@/simulator/clock';
import { useDemo } from '@/stores/demo';

const STATIC = { staleTime: Infinity } as const;

export const useBarangays = () =>
  useQuery({ queryKey: ['barangays'], queryFn: services.geo.getBarangays, ...STATIC });

export const useCityMeta = () =>
  useQuery({ queryKey: ['cityMeta'], queryFn: services.geo.getCityMeta, ...STATIC });

export const useTrucks = () =>
  useQuery({ queryKey: ['trucks'], queryFn: services.fleet.getTrucks, ...STATIC });

export const useRoutes = () =>
  useQuery({ queryKey: ['routes'], queryFn: services.fleet.getRoutes, ...STATIC });

export const useRouteSchedules = () =>
  useQuery({ queryKey: ['routeSchedules'], queryFn: services.fleet.getRouteSchedules, ...STATIC });

/** Live truck states from the fleet service (simulator today, realtime backend later). */
export function useTruckStates(): TruckState[] {
  const [states, setStates] = useState<TruckState[]>([]);
  // Re-subscribe when the demo clock changes so a time jump shows immediately.
  const clock = useDemo((s) => s.clock);
  useEffect(() => services.fleet.subscribeTruckStates(setStates), [clock]);
  return states;
}

/** Current simulated time, re-rendering every `intervalMs`. */
export function useSimNow(intervalMs = 1000): number {
  const clock = useDemo((s) => s.clock);
  // State is only set from the timer; right after a clock jump the value is derived directly,
  // so the display never shows the pre-jump time.
  const [tick, setTick] = useState(() => ({ clock, now: simNow(clock) }));
  useEffect(() => {
    const timer = setInterval(() => setTick({ clock, now: simNow(clock) }), intervalMs);
    return () => clearInterval(timer);
  }, [clock, intervalMs]);
  return tick.clock === clock ? tick.now : simNow(clock);
}
