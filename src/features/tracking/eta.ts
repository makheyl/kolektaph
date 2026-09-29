/**
 * ETA estimation along a route. Remaining distance is converted to time with the planning
 * speeds (collection vs transit). In the pilot the speeds get calibrated from GPS history; the
 * shape of this function stays the same.
 */
import type { Route, TruckState } from '@/services/types';

import { segmentMsPerMetre } from './speeds';

/** Minutes before arrival at which residents are told to bring their garbage out (pitch: 15). */
export const VICINITY_MINUTES = 15;

/** Distance along the route at which each segment starts. */
export function segmentStarts(route: Route): number[] {
  const starts: number[] = [];
  let m = 0;
  for (const s of route.segments) {
    starts.push(m);
    m += s.lengthM;
  }
  return starts;
}

/** Estimated milliseconds to travel from `fromM` to `toM` along the route. */
export function travelMs(route: Route, fromM: number, toM: number): number {
  if (toM <= fromM) return 0;
  let ms = 0;
  let start = 0;
  for (const seg of route.segments) {
    const end = start + seg.lengthM;
    const overlap = Math.min(end, toM) - Math.max(start, fromM);
    if (overlap > 0) ms += overlap * segmentMsPerMetre(seg.collect);
    if (end >= toM) break;
    start = end;
  }
  return ms;
}

export type BarangayVisit =
  | { state: 'upcoming'; arriveAt: number | null }
  | { state: 'in_progress'; finishAt: number | null }
  | { state: 'passed'; passedAt: number };

/**
 * The moment from which remaining travel is counted, or null when no honest estimate exists:
 * - not yet departed → the departure time (or now, if it's late);
 * - broken down → when the crew expects to move again;
 * - full / no signal / done → null.
 */
export function etaBase(truck: TruckState, now: number): number | null {
  switch (truck.status) {
    case 'on_route':
      return now;
    case 'not_started':
      return Math.max(now, truck.departAt ?? now);
    case 'breakdown':
      return truck.incident ? Math.max(now, truck.incident.until) : null;
    default:
      return null;
  }
}

/** Where the truck is relative to a barangay on its route, with ETAs when they are honest. */
export function barangayVisit(
  route: Route,
  truck: TruckState,
  barangayId: string,
  now: number,
): BarangayVisit | null {
  const idx = route.segments.flatMap((s, i) =>
    s.collect && s.barangayId === barangayId ? [i] : [],
  );
  if (!idx.length) return null;

  const log = truck.visits[barangayId];
  if (log?.finishedAt != null) return { state: 'passed', passedAt: log.finishedAt };

  const starts = segmentStarts(route);
  const firstM = starts[idx[0]];
  const last = idx[idx.length - 1];
  const lastEndM = starts[last] + route.segments[last].lengthM;
  const base = etaBase(truck, now);

  if (truck.progressM > firstM) {
    return {
      state: 'in_progress',
      finishAt: base == null ? null : base + travelMs(route, truck.progressM, lastEndM),
    };
  }
  return {
    state: 'upcoming',
    arriveAt: base == null ? null : base + travelMs(route, truck.progressM, firstM),
  };
}

export interface UpcomingStreet {
  segmentId: string;
  segmentIndex: number;
  name: string | null;
  barangayId: string | null;
  arriveAt: number;
}

/** Collection streets ahead of the truck with estimated arrival times (one entry per street). */
export function upcomingStreets(
  route: Route,
  truck: TruckState,
  now: number,
  limit = 8,
): UpcomingStreet[] {
  const base = etaBase(truck, now);
  if (base == null) return [];
  const starts = segmentStarts(route);
  const seen = new Set<string>();
  const out: UpcomingStreet[] = [];
  for (let i = 0; i < route.segments.length && out.length < limit; i++) {
    const seg = route.segments[i];
    if (!seg.collect || starts[i] < truck.progressM) continue;
    const key = `${seg.name ?? seg.id}|${seg.barangayId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      segmentId: seg.id,
      segmentIndex: i,
      name: seg.name,
      barangayId: seg.barangayId,
      arriveAt: base + travelMs(route, truck.progressM, starts[i]),
    });
  }
  return out;
}
