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
 * Where the truck is relative to a barangay on its route. ETAs are null when the truck is not
 * moving (full, broken down, no signal) because no honest estimate exists.
 */
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
  const moving = truck.status === 'on_route' || truck.status === 'not_started';

  if (truck.progressM > firstM) {
    return {
      state: 'in_progress',
      finishAt: moving ? now + travelMs(route, truck.progressM, lastEndM) : null,
    };
  }
  return {
    state: 'upcoming',
    arriveAt: moving ? now + travelMs(route, truck.progressM, firstM) : null,
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
      arriveAt: now + travelMs(route, truck.progressM, starts[i]),
    });
  }
  return out;
}
