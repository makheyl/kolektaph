/**
 * Deterministic truck simulator: a truck's state is a pure function of (route, schedule, time).
 * Every device computing the same time gets the same positions, with no server involved.
 *
 * Model (sample parameters in features/tracking/speeds.ts):
 * - Transit segments (depot → barangay) at TRANSIT_KMH; collection segments at COLLECT_KMH.
 * - Load grows with collected distance up to schedule.expectedLoad. If that exceeds 1, the
 *   truck becomes FULL part-way and stops there with streets left (the pitch's Problem 3).
 * - Schedule exceptions (holidays) move or cancel runs, using the same rules as the schedule.
 */
import { along } from '@turf/along';
import { lineString } from '@turf/helpers';

import { routeRunsOnDay } from '@/features/schedule/collections';
import { segmentMsPerMetre } from '@/features/tracking/speeds';
import { atManilaTime } from '@/lib/time';
import type {
  BarangayVisitLog,
  LngLat,
  Route,
  RouteSchedule,
  ScheduleException,
  Truck,
  TruckState,
} from '@/services/types';

interface Timeline {
  route: Route;
  /** Offset (ms after shift start) at which each segment begins. */
  startMs: number[];
  /** Distance along the route at which each segment begins. */
  startM: number[];
  totalMs: number;
  collectLengthM: number;
}

const timelines = new WeakMap<Route, Timeline>();

export function getTimeline(route: Route): Timeline {
  const cached = timelines.get(route);
  if (cached) return cached;
  const startMs: number[] = [];
  const startM: number[] = [];
  let t = 0;
  let m = 0;
  let collectLengthM = 0;
  for (const seg of route.segments) {
    startMs.push(t);
    startM.push(m);
    t += seg.lengthM * segmentMsPerMetre(seg.collect);
    m += seg.lengthM;
    if (seg.collect) collectLengthM += seg.lengthM;
  }
  const timeline = { route, startMs, startM, totalMs: t, collectLengthM };
  timelines.set(route, timeline);
  return timeline;
}

/** Position `metresIntoSegment` along segment `index`. */
export function pointOnSegment(route: Route, index: number, metresIntoSegment: number): LngLat {
  const seg = route.segments[index];
  const clamped = Math.max(0, Math.min(seg.lengthM, metresIntoSegment));
  const p = along(lineString(seg.coordinates), clamped / 1000).geometry.coordinates;
  return [p[0], p[1]];
}

/** Segment index and metres into it for a given elapsed time since shift start. */
function locateByTime(tl: Timeline, elapsedMs: number): { index: number; intoM: number } {
  const { segments } = tl.route;
  let i = 0;
  while (i < segments.length - 1 && tl.startMs[i + 1] <= elapsedMs) i++;
  return { index: i, intoM: (elapsedMs - tl.startMs[i]) / segmentMsPerMetre(segments[i].collect) };
}

/** Collected metres (collection segments only) at a point on the route. */
function collectedAt(tl: Timeline, index: number, intoM: number): number {
  let sum = 0;
  for (let i = 0; i < index; i++)
    if (tl.route.segments[i].collect) sum += tl.route.segments[i].lengthM;
  if (tl.route.segments[index].collect) sum += Math.min(intoM, tl.route.segments[index].lengthM);
  return sum;
}

/** Where on the route the collected distance first reaches `targetM`. */
function locateByCollected(tl: Timeline, targetM: number): { index: number; intoM: number } {
  let sum = 0;
  const { segments } = tl.route;
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].collect) continue;
    if (sum + segments[i].lengthM >= targetM) return { index: i, intoM: targetM - sum };
    sum += segments[i].lengthM;
  }
  const last = segments.length - 1;
  return { index: last, intoM: segments[last].lengthM };
}

/**
 * When the truck started and finished collecting in each of the route's barangays, given how
 * far it has travelled. A barangay is finished once its last collection segment is done.
 */
function visitLog(
  tl: Timeline,
  shiftStart: number,
  progressM: number,
): Record<string, BarangayVisitLog> {
  const log: Record<string, BarangayVisitLog> = {};
  const { segments } = tl.route;
  for (const barangayId of tl.route.barangayIds) {
    const idx = segments.flatMap((s, i) => (s.collect && s.barangayId === barangayId ? [i] : []));
    if (!idx.length) continue;
    const first = idx[0];
    const last = idx[idx.length - 1];
    const lastEndM = tl.startM[last] + segments[last].lengthM;
    const lastEndMs = tl.startMs[last] + segments[last].lengthM * segmentMsPerMetre(true);
    log[barangayId] = {
      startedAt: progressM > tl.startM[first] ? shiftStart + tl.startMs[first] : null,
      finishedAt: progressM >= lastEndM ? shiftStart + lastEndMs : null,
    };
  }
  return log;
}

function stateAt(
  truck: Truck,
  tl: Timeline,
  shiftStart: number,
  index: number,
  intoM: number,
  status: TruckState['status'],
  load: number,
  at: number,
): TruckState {
  const { route } = tl;
  const seg = route.segments[index];
  const progressM = tl.startM[index] + Math.min(intoM, seg.lengthM);
  return {
    truckId: truck.id,
    routeId: route.id,
    status,
    position: pointOnSegment(route, index, intoM),
    segmentIndex: index,
    barangayId: seg.barangayId,
    streetName: seg.name,
    progressM,
    routeLengthM: route.lengthM,
    load,
    at,
    visits: visitLog(tl, shiftStart, progressM),
  };
}

export function simulateTruck(
  truck: Truck,
  schedules: RouteSchedule[],
  routes: Route[],
  at: number,
  exceptions: ScheduleException[] = [],
): TruckState {
  const schedule = schedules.find(
    (s) => s.truckId === truck.id && routeRunsOnDay(s, at, exceptions).runs,
  );
  const route = schedule && routes.find((r) => r.id === schedule.routeId);
  if (!schedule || !route) {
    return {
      truckId: truck.id,
      routeId: null,
      status: 'off_duty',
      position: null,
      segmentIndex: 0,
      barangayId: null,
      streetName: null,
      progressM: 0,
      routeLengthM: 0,
      load: 0,
      at,
      visits: {},
    };
  }

  const tl = getTimeline(route);
  const start = atManilaTime(at, schedule.start);
  const elapsed = at - start;
  if (elapsed < 0) return stateAt(truck, tl, start, 0, 0, 'not_started', 0, at);

  // If the route generates more than a full truck, find when (and where) it fills up.
  if (schedule.expectedLoad > 1) {
    const full = locateByCollected(tl, tl.collectLengthM / schedule.expectedLoad);
    const fullElapsed =
      tl.startMs[full.index] + full.intoM * segmentMsPerMetre(route.segments[full.index].collect);
    if (elapsed >= fullElapsed) {
      return stateAt(truck, tl, start, full.index, full.intoM, 'full', 1, at);
    }
  }

  if (elapsed >= tl.totalMs) {
    const last = route.segments.length - 1;
    const load = Math.min(1, schedule.expectedLoad);
    return stateAt(truck, tl, start, last, route.segments[last].lengthM, 'done', load, at);
  }

  const { index, intoM } = locateByTime(tl, elapsed);
  const load = Math.min(
    1,
    (collectedAt(tl, index, intoM) / tl.collectLengthM) * schedule.expectedLoad,
  );
  return stateAt(truck, tl, start, index, intoM, 'on_route', load, at);
}

export function simulateFleet(
  trucks: Truck[],
  schedules: RouteSchedule[],
  routes: Route[],
  at: number,
  exceptions: ScheduleException[] = [],
): TruckState[] {
  return trucks.map((t) => simulateTruck(t, schedules, routes, at, exceptions));
}
