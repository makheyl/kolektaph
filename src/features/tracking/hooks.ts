import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { services } from '@/services';
import type { OpsSnapshot, OutboundAlert, TruckState } from '@/services/types';
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

/** Route schedules; re-read every few seconds so City ENRO changes reach every screen. */
export const useRouteSchedules = () =>
  useQuery({
    queryKey: ['routeSchedules'],
    queryFn: services.schedule.getRouteSchedules,
    staleTime: 2_000,
    refetchInterval: 3_000,
  });

export const useScheduleExceptions = () =>
  useQuery({
    queryKey: ['scheduleExceptions'],
    queryFn: services.schedule.getExceptions,
    ...STATIC,
  });

/** Live truck states from the fleet service (simulator today, realtime backend later). */
export function useTruckStates(): TruckState[] {
  const [states, setStates] = useState<TruckState[]>([]);
  // Re-subscribe when the demo clock changes so a time jump shows immediately.
  const clock = useDemo((s) => s.clock);
  useEffect(() => services.fleet.subscribeTruckStates(setStates), [clock]);
  return states;
}

/** Every alert sent so far (SMS + in-app), newest first. */
export function useAlerts(): OutboundAlert[] {
  const [alerts, setAlerts] = useState<OutboundAlert[]>([]);
  const clock = useDemo((s) => s.clock);
  useEffect(() => services.alerts.subscribeAlerts(setAlerts), [clock]);
  return alerts;
}

/** Live operations picture for the City ENRO dashboard (null until the first snapshot). */
export function useOps(): OpsSnapshot | null {
  const [ops, setOps] = useState<OpsSnapshot | null>(null);
  const clock = useDemo((s) => s.clock);
  useEffect(() => services.ops.subscribeOps(setOps), [clock]);
  return ops;
}

export const useSmsRegistrations = () =>
  useQuery({
    queryKey: ['smsRegistrations'],
    queryFn: services.alerts.getSmsRegistrations,
    ...STATIC,
  });

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

/** GPS fixes the server received for a driver shift (refreshed every 5 s). */
export const useTrace = (shiftId: string | null) =>
  useQuery({
    queryKey: ['trace', shiftId],
    queryFn: () => services.ops.getTrace(shiftId as string),
    enabled: shiftId != null,
    refetchInterval: 5_000,
  });

/** Missed streets for a Manila day (refreshed every 5 s so today's list stays current). */
export const useMissedStreets = (day: number) => {
  const clock = useDemo((s) => s.clock);
  return useQuery({
    queryKey: ['missedStreets', day, clock],
    queryFn: () => services.ops.getMissedStreets(day),
    refetchInterval: 5_000,
  });
};
