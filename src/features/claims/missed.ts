/**
 * "Hindi nadaanan" claim check (HAKOT §10.2, Figure 7), plus "not yet" for a route that is
 * still running:
 *
 *   crew logged "not segregated"          → reason + segregation guide, no pickup
 *   crew logged truck full / road blocked → verified miss, crew not at fault, pickup ticket
 *   (also when the truck filled up before reaching the street)
 *   no GPS from the truck                 → eco-aide check, data gap flagged
 *   truck did not pass within 30 m        → verified miss, priority pickup ticket
 *   passed, collected or nothing logged   → the resident is asked for a photo
 *
 * Crew logs are checked before the GPS verdict so a valid skip (e.g. road blocked, so no GPS
 * near the street) is not counted against the crew.
 */
import {
  buildTraceIndex,
  COVERAGE_RADIUS_M,
  coveredShare,
  COVERAGE_MIN_SHARE,
  isNearTrace,
} from '@/features/coverage/coverage';
import type { DriverStreet, StreetMark } from '@/features/driver/streets';
import { streetProgress } from '@/features/driver/streets';
import type { CollectionOccurrence } from '@/features/schedule/collections';
import { etaBase, travelMs } from '@/features/tracking/eta';
import { metresBetween } from '@/lib/geo';
import type { LngLat, Route, TruckState } from '@/services/types';

export type ClaimVerdict =
  | { kind: 'no_collection_today' }
  | { kind: 'not_yet'; arriveAt: number | null }
  | { kind: 'not_segregated'; at: number }
  | { kind: 'crew_not_at_fault'; reason: 'truck_full' | 'road_blocked' }
  | { kind: 'no_gps' }
  | { kind: 'verified_miss' }
  | { kind: 'please_photo'; passedFrom: number | null; passedTo: number | null };

export interface ClaimInput {
  now: number;
  /** The barangay's collection today, if any. */
  today: CollectionOccurrence | null;
  truck: TruckState | undefined;
  route: Route | undefined;
  /** The resident's street (picked, or the nearest to their point). */
  street: DriverStreet | null;
  /** The resident's point, when they used their location. */
  point: LngLat | null;
  /** GPS received from the truck today. */
  trace: LngLat[];
  /** What the crew logged for that street, if anything. */
  mark: StreetMark | null;
}

/** Streets further than this from the resident's point are not "their" street. */
export const STREET_MATCH_M = 150;

/** The route street closest to a point (null if none is within STREET_MATCH_M). */
export function nearestStreet(
  streets: DriverStreet[],
  route: Route,
  point: LngLat,
): DriverStreet | null {
  let best: { street: DriverStreet; d: number } | null = null;
  for (const street of streets) {
    for (const id of street.segmentIds) {
      const seg = route.segments.find((s) => s.id === id);
      for (const c of seg?.coordinates ?? []) {
        const d = metresBetween(c, point);
        if (!best || d < best.d) best = { street, d };
      }
    }
  }
  return best && best.d <= STREET_MATCH_M ? best.street : null;
}

function streetCoordinates(route: Route, street: DriverStreet): LngLat[][] {
  return street.segmentIds.flatMap((id) => {
    const seg = route.segments.find((s) => s.id === id);
    return seg ? [seg.coordinates] : [];
  });
}

export function judgeClaim(input: ClaimInput): ClaimVerdict {
  const { now, today, truck, route, street, point, trace, mark } = input;
  if (!today) return { kind: 'no_collection_today' };

  if (mark?.outcome === 'skipped' && mark.reason === 'not_segregated') {
    return { kind: 'not_segregated', at: mark.at };
  }
  if (
    mark?.outcome === 'skipped' &&
    (mark.reason === 'truck_full' || mark.reason === 'road_blocked')
  ) {
    return { kind: 'crew_not_at_fault', reason: mark.reason };
  }

  if (!truck || !route || truck.routeId !== today.routeId || truck.status === 'no_signal') {
    return now <= today.end ? { kind: 'not_yet', arriveAt: null } : { kind: 'no_gps' };
  }

  const progress = street ? streetProgress(street, truck.progressM) : null;
  const reached = progress === 'passed';
  if (truck.status === 'full' && !reached)
    return { kind: 'crew_not_at_fault', reason: 'truck_full' };

  const finished = truck.status === 'done' || now > today.end;
  if (!reached && !finished) {
    const base = etaBase(truck, now);
    const arriveAt =
      street && base != null && progress === 'upcoming'
        ? base + travelMs(route, truck.progressM, street.startM)
        : null;
    return { kind: 'not_yet', arriveAt };
  }

  if (!trace.length) return { kind: 'no_gps' };
  const index = buildTraceIndex(trace);
  const passed = point
    ? isNearTrace(index, point, COVERAGE_RADIUS_M) ||
      (street != null &&
        streetCoordinates(route, street).some((c) => coveredShare(c, index) >= COVERAGE_MIN_SHARE))
    : street != null &&
      streetCoordinates(route, street).some((c) => coveredShare(c, index) >= COVERAGE_MIN_SHARE);
  if (!passed) return { kind: 'verified_miss' };

  const visit = street ? truck.visits[street.barangayId] : undefined;
  return {
    kind: 'please_photo',
    passedFrom: visit?.startedAt ?? null,
    passedTo: visit?.finishedAt ?? null,
  };
}
