/**
 * Backup-truck suggestion (pitch slide 14): when a truck is FULL with streets left, suggest the
 * nearest other truck that still has room for those streets. It is only a suggestion; City ENRO
 * staff decide.
 *
 * "Streets left" comes from the GPS coverage check (missed streets with reason truck_full), so
 * the alert and the missed-streets list always agree.
 */
import { CONNECTOR_MAX_M } from '@/features/coverage/coverage';
import { metresBetween } from '@/lib/geo';
import { manilaDateKey } from '@/lib/time';
import type {
  BackupSuggestion,
  MissedStreet,
  Route,
  RouteSchedule,
  TruckState,
} from '@/services/types';
import { getTimeline } from '@/simulator/truckSimulator';

/** Distinct streets in a list of missed pieces (named streets once each; long unnamed roads). */
export function countStreets(missed: MissedStreet[]): number {
  const named = new Set(missed.filter((m) => m.name).map((m) => `${m.name}|${m.barangayId}`));
  const unnamed = missed.filter((m) => !m.name && m.lengthM >= CONNECTOR_MAX_M).length;
  return named.size + unnamed;
}

/**
 * Truck load (0..1) the leftover streets would add: their share of the route's collection
 * length times the load the whole route generates (sample model; real data: tonnes per km).
 */
export function loadNeeded(route: Route, schedule: RouteSchedule, left: MissedStreet[]): number {
  const collectM = getTimeline(route).collectLengthM;
  const leftM = left.reduce((sum, m) => sum + m.lengthM, 0);
  return collectM === 0 ? 0 : (leftM / collectM) * schedule.expectedLoad;
}

export function suggestBackups(
  states: TruckState[],
  routes: Route[],
  schedules: RouteSchedule[],
  now: number,
  missed: MissedStreet[],
): BackupSuggestion[] {
  const scheduleOf = (routeId: string | null) => schedules.find((s) => s.routeId === routeId);
  const out: BackupSuggestion[] = [];

  for (const full of states.filter((s) => s.status === 'full')) {
    const route = routes.find((r) => r.id === full.routeId);
    const schedule = scheduleOf(full.routeId);
    const left = missed.filter((m) => m.routeId === full.routeId && m.reason === 'truck_full');
    if (!route || !schedule || !left.length) continue;
    const firstSegment = route.segments.find((seg) => seg.id === left[0].segmentIds[0]);
    if (!firstSegment) continue;
    const needed = loadNeeded(route, schedule, left);

    const best = states
      .filter(
        (c) =>
          c.truckId !== full.truckId &&
          c.position &&
          c.status === 'on_route' &&
          c.load + needed <= 1 &&
          scheduleOf(c.routeId)?.wasteType === schedule.wasteType,
      )
      .map((c) => ({ c, distanceM: metresBetween(c.position!, firstSegment.coordinates[0]) }))
      .sort((a, b) => a.distanceM - b.distanceM)[0];
    if (!best) continue;

    out.push({
      id: `backup|${manilaDateKey(now)}|${route.id}`,
      fullTruckId: full.truckId,
      routeId: route.id,
      barangayId: left[0].barangayId,
      streetsLeft: countStreets(left),
      candidateTruckId: best.c.truckId,
      candidateLoad: best.c.load,
      distanceM: Math.round(best.distanceM),
    });
  }
  return out;
}
