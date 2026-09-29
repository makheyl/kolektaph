/**
 * The driver's street list: the route's collection streets, one row per street (not per OSM
 * segment), in the order the truck reaches them, plus what the crew logged for each.
 */
import { CONNECTOR_MAX_M } from '@/features/coverage/coverage';
import { segmentStarts } from '@/features/tracking/eta';
import type { Route, SkipReason, StreetOutcome, TruckEvent } from '@/services/types';

export interface DriverStreet {
  /** Stable key: "barangay|name" for named streets, "barangay|segmentId" for unnamed roads. */
  key: string;
  name: string | null;
  barangayId: string;
  segmentIds: string[];
  lengthM: number;
  /** Where along the route the street starts (first piece) and ends (last piece). */
  startM: number;
  endM: number;
}

/**
 * Groups the route's collection segments into streets. A street driven twice is one row; short
 * unnamed connectors are folded into the street before them (same rule as the GPS check).
 */
export function driverStreets(route: Route): DriverStreet[] {
  const starts = segmentStarts(route);
  const byKey = new Map<string, DriverStreet>();
  let last: DriverStreet | null = null;
  route.segments.forEach((seg, i) => {
    if (!seg.collect || !seg.barangayId || !route.barangayIds.includes(seg.barangayId)) return;
    const end = starts[i] + seg.lengthM;
    if (!seg.name && seg.lengthM < CONNECTOR_MAX_M && last?.barangayId === seg.barangayId) {
      last.segmentIds.push(seg.id);
      last.lengthM += seg.lengthM;
      last.endM = Math.max(last.endM, end);
      return;
    }
    const key = `${seg.barangayId}|${seg.name ?? seg.id}`;
    let street = byKey.get(key);
    if (!street) {
      street = {
        key,
        name: seg.name,
        barangayId: seg.barangayId,
        segmentIds: [],
        lengthM: 0,
        startM: starts[i],
        endM: end,
      };
      byKey.set(key, street);
    }
    street.segmentIds.push(seg.id);
    street.lengthM += seg.lengthM;
    street.endM = Math.max(street.endM, end);
    last = street;
  });
  return [...byKey.values()];
}

export type StreetProgress = 'passed' | 'current' | 'upcoming';

export function streetProgress(street: DriverStreet, progressM: number): StreetProgress {
  if (progressM >= street.endM) return 'passed';
  if (progressM >= street.startM) return 'current';
  return 'upcoming';
}

export interface StreetMark {
  outcome: StreetOutcome;
  reason: SkipReason | null;
  at: number;
}

/** The crew's latest mark per street on a route. */
export function streetMarks(events: TruckEvent[], routeId: string): Map<string, StreetMark> {
  const marks = new Map<string, StreetMark>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.kind !== 'street' || e.routeId !== routeId) continue;
    marks.set(e.streetKey, { outcome: e.outcome, reason: e.reason, at: e.at });
  }
  return marks;
}

/** Segment id → skip reason, for the GPS coverage check (latest mark per street wins). */
export function skipsBySegment(events: TruckEvent[], routeId: string): Map<string, SkipReason> {
  const latest = new Map<string, TruckEvent & { kind: 'street' }>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (e.kind === 'street' && e.routeId === routeId) latest.set(e.streetKey, e);
  }
  const skips = new Map<string, SkipReason>();
  for (const e of latest.values()) {
    if (e.outcome !== 'skipped' || !e.reason) continue;
    for (const id of e.segmentIds) skips.set(id, e.reason);
  }
  return skips;
}
