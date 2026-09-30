import { useMemo } from 'react';

import { useCityConfig } from '@/features/admin/hooks';
import {
  collectionsForBarangay,
  LOOKAHEAD_DAYS,
  nextCollection,
  nextCollectionAfterToday,
  todaysCollection,
} from '@/features/schedule/collections';
import {
  useRoutes,
  useRouteSchedules,
  useScheduleExceptions,
  useSimNow,
  useTruckStates,
} from '@/features/tracking/hooks';
import { manilaStartOfDay } from '@/lib/time';
import { useSettings } from '@/stores/settings';

import { homeStatus } from './homeStatus';

/** Everything the resident screens need to answer "kailan darating ang truck?". */
export function useResidentToday(barangayOverride?: string | null) {
  const savedBarangay = useSettings((s) => s.barangayId);
  const barangayId = barangayOverride === undefined ? savedBarangay : barangayOverride;
  const now = useSimNow();
  const states = useTruckStates();
  const { data: schedules } = useRouteSchedules();
  const { data: routes } = useRoutes();
  const { data: exceptions } = useScheduleExceptions();
  const leadMinutes = useCityConfig()?.smsLeadMinutes;

  // The schedule only changes when the Manila day changes, not every tick.
  const day = manilaStartOfDay(now);
  const occurrences = useMemo(
    () =>
      barangayId && schedules && routes && exceptions
        ? collectionsForBarangay(barangayId, schedules, routes, exceptions, day, LOOKAHEAD_DAYS)
        : [],
    [barangayId, schedules, routes, exceptions, day],
  );

  const today = todaysCollection(occurrences, now);
  const next = nextCollection(occurrences, now);
  const nextAfterToday = nextCollectionAfterToday(occurrences, now);
  const truck = today ? states.find((s) => s.truckId === today.truckId) : undefined;
  const route = today ? routes?.find((r) => r.id === today.routeId) : undefined;

  return {
    barangayId,
    now,
    occurrences,
    today,
    next,
    nextAfterToday,
    truck,
    route,
    states,
    routes,
    ready: !!(schedules && routes && exceptions),
    status: homeStatus({ barangayId, now, today, nextAfterToday, truck, route, leadMinutes }),
  };
}
