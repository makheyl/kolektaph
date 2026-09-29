/**
 * GPS coverage check (pitch slide 14, HAKOT §10.1): compares the truck's GPS trace with the
 * planned route. A street segment counts as SERVED when at least 60% of it lies within 30 m of
 * the trace (phone GPS is typically off by 5–20 m in dense areas).
 *
 * Works the same for simulated traces (prototype) and real phone GPS (driver app).
 * Streets the crew logged as skipped in the driver app are listed with the crew's reason
 * (HAKOT §10.2); "walang basura" means there was nothing to collect, so it is not a miss.
 */
import type {
  LngLat,
  MissedStreet,
  Route,
  RouteSegment,
  SkipReason,
  TruckState,
} from '@/services/types';

export const COVERAGE_RADIUS_M = 30;
export const COVERAGE_MIN_SHARE = 0.6;
/** Unnamed pieces shorter than this are intersections/connectors, not streets of their own. */
export const CONNECTOR_MAX_M = 100;
const SAMPLE_EVERY_M = 10;
const CELL_M = 40;

// Local equirectangular projection around Carmona (~14.3° N): plenty accurate at city scale.
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG = 111_320 * Math.cos((14.3 * Math.PI) / 180);
const toXY = ([lng, lat]: LngLat): [number, number] => [lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT];

/** Grid index over trace points, so each lookup checks only nearby cells. */
export interface TraceIndex {
  cells: Map<string, [number, number][]>;
}

export function buildTraceIndex(trace: LngLat[]): TraceIndex {
  const cells = new Map<string, [number, number][]>();
  for (const p of trace) {
    const [x, y] = toXY(p);
    const key = `${Math.floor(x / CELL_M)}|${Math.floor(y / CELL_M)}`;
    const cell = cells.get(key);
    if (cell) cell.push([x, y]);
    else cells.set(key, [[x, y]]);
  }
  return { cells };
}

export function isNearTrace(index: TraceIndex, p: LngLat, radiusM = COVERAGE_RADIUS_M): boolean {
  const [x, y] = toXY(p);
  const cx = Math.floor(x / CELL_M);
  const cy = Math.floor(y / CELL_M);
  const reach = Math.ceil(radiusM / CELL_M);
  const r2 = radiusM * radiusM;
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (const [px, py] of index.cells.get(`${cx + dx}|${cy + dy}`) ?? []) {
        if ((px - x) ** 2 + (py - y) ** 2 <= r2) return true;
      }
    }
  }
  return false;
}

/** Share (0..1) of a polyline lying within the coverage radius of the trace. */
export function coveredShare(coords: LngLat[], index: TraceIndex): number {
  let total = 0;
  let near = 0;
  for (let i = 1; i < coords.length; i++) {
    const [ax, ay] = toXY(coords[i - 1]);
    const [bx, by] = toXY(coords[i]);
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.round(len / SAMPLE_EVERY_M));
    for (let s = 0; s < steps; s++) {
      const f = (s + 0.5) / steps;
      const p: LngLat = [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f,
      ];
      total += len / steps;
      if (isNearTrace(index, p)) near += len / steps;
    }
  }
  return total === 0 ? 1 : near / total;
}

export const isServed = (seg: RouteSegment, index: TraceIndex) =>
  coveredShare(seg.coordinates, index) >= COVERAGE_MIN_SHARE;

interface MissedInput {
  route: Route;
  truck: TruckState;
  trace: LngLat[];
  /** End of the collection window: after it, every unserved street counts as missed. */
  windowEnd: number;
  now: number;
  /** Segment id → the crew's skip reason (from the driver app's street log). */
  skips?: Map<string, SkipReason>;
}

/**
 * Streets missed so far today:
 * - streets the truck has already gone past (or all, once done / after the window) that the
 *   GPS trace does not cover → "not_passed";
 * - when the truck is full, the streets it can no longer reach → "truck_full", flagged
 *   immediately so a backup truck can be sent the same day.
 */
export function missedStreets({
  route,
  truck,
  trace,
  windowEnd,
  now,
  skips = new Map(),
}: MissedInput): MissedStreet[] {
  const index = buildTraceIndex(trace);
  const judgeAll = truck.status === 'done' || now > windowEnd;
  const flagged: {
    seg: RouteSegment;
    reason: MissedStreet['reason'];
    skipReason: SkipReason | null;
  }[] = [];

  let start = 0;
  for (const seg of route.segments) {
    const end = start + seg.lengthM;
    if (seg.collect && seg.barangayId && route.barangayIds.includes(seg.barangayId)) {
      const behind = end <= truck.progressM;
      const skip = skips.get(seg.id) ?? null;
      if (skip === 'no_garbage') {
        // Nothing to collect: served.
      } else if (skip) {
        flagged.push({ seg, reason: 'skipped', skipReason: skip });
      } else if (truck.status === 'full' && !behind) {
        if (!isServed(seg, index)) flagged.push({ seg, reason: 'truck_full', skipReason: null });
      } else if ((behind || judgeAll) && !isServed(seg, index)) {
        flagged.push({ seg, reason: 'not_passed', skipReason: null });
      }
    }
    start = end;
  }

  // Merge consecutive pieces of the same street (same name, barangay and reason). Short unnamed
  // pieces are intersections/connectors: fold them into the street before them, so a street
  // split by a 40 m connector still shows once.
  const merged: MissedStreet[] = [];
  for (const { seg, reason, skipReason } of flagged) {
    const prev = merged[merged.length - 1];
    const sameStreet =
      prev &&
      prev.barangayId === seg.barangayId &&
      prev.reason === reason &&
      prev.skipReason === skipReason &&
      (prev.name === seg.name || (!seg.name && seg.lengthM < CONNECTOR_MAX_M));
    // A named piece after an absorbed connector continues the same street.
    if (prev && sameStreet) {
      prev.segmentIds.push(seg.id);
      prev.lengthM += seg.lengthM;
    } else {
      merged.push({
        id: `${route.id}|${seg.id}`,
        routeId: route.id,
        truckId: truck.truckId,
        barangayId: seg.barangayId as string,
        name: seg.name,
        segmentIds: [seg.id],
        lengthM: seg.lengthM,
        reason,
        skipReason,
      });
    }
  }
  return merged;
}
