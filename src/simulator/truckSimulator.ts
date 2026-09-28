/**
 * Deterministic truck simulator: a truck's state is a pure function of (route, schedule, time).
 * Every device computing the same time gets the same positions, with no server involved.
 *
 * Model (sample parameters, to be tuned against real GPS logs):
 * - Transit segments (depot → barangay) at TRANSIT_KMH.
 * - Collection segments at COLLECT_KMH, an effective speed that includes stopping at houses.
 * - Load grows with collected distance up to schedule.expectedLoad. If that exceeds 1, the
 *   truck becomes FULL part-way and stops there with streets left (the pitch's Problem 3).
 */
import { along } from '@turf/along';
import { lineString } from '@turf/helpers';

import { atManilaTime, manilaParts } from '@/lib/time';
import type { LngLat, Route, RouteSchedule, Truck, TruckState } from '@/services/types';

export const COLLECT_KMH = 8;
export const TRANSIT_KMH = 25;

const msPerMetre = (kmh: number) => 3600 / kmh; // (3600 s/h ÷ km/h) = ms per metre

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
    t += seg.lengthM * msPerMetre(seg.collect ? COLLECT_KMH : TRANSIT_KMH);
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
  const speed = msPerMetre(segments[i].collect ? COLLECT_KMH : TRANSIT_KMH);
  return { index: i, intoM: (elapsedMs - tl.startMs[i]) / speed };
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

function stateAt(
  truck: Truck,
  route: Route,
  index: number,
  intoM: number,
  status: TruckState['status'],
  load: number,
  at: number,
): TruckState {
  const tl = getTimeline(route);
  const seg = route.segments[index];
  return {
    truckId: truck.id,
    routeId: route.id,
    status,
    position: pointOnSegment(route, index, intoM),
    segmentIndex: index,
    barangayId: seg.barangayId,
    streetName: seg.name,
    progressM: tl.startM[index] + Math.min(intoM, seg.lengthM),
    routeLengthM: route.lengthM,
    load,
    at,
  };
}

export function simulateTruck(
  truck: Truck,
  schedules: RouteSchedule[],
  routes: Route[],
  at: number,
): TruckState {
  const weekday = manilaParts(at).weekday;
  const schedule = schedules.find((s) => s.truckId === truck.id && s.days.includes(weekday));
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
    };
  }

  const tl = getTimeline(route);
  const start = atManilaTime(at, schedule.start);
  const elapsed = at - start;
  if (elapsed < 0) return stateAt(truck, route, 0, 0, 'not_started', 0, at);

  // If the route generates more than a full truck, find when (and where) it fills up.
  if (schedule.expectedLoad > 1) {
    const fullAtCollected = tl.collectLengthM / schedule.expectedLoad;
    const full = locateByCollected(tl, fullAtCollected);
    const fullElapsed =
      tl.startMs[full.index] +
      full.intoM * msPerMetre(route.segments[full.index].collect ? COLLECT_KMH : TRANSIT_KMH);
    if (elapsed >= fullElapsed) return stateAt(truck, route, full.index, full.intoM, 'full', 1, at);
  }

  if (elapsed >= tl.totalMs) {
    const last = route.segments.length - 1;
    const load = Math.min(1, schedule.expectedLoad);
    return stateAt(truck, route, last, route.segments[last].lengthM, 'done', load, at);
  }

  const { index, intoM } = locateByTime(tl, elapsed);
  const load = Math.min(
    1,
    (collectedAt(tl, index, intoM) / tl.collectLengthM) * schedule.expectedLoad,
  );
  return stateAt(truck, route, index, intoM, 'on_route', load, at);
}

export function simulateFleet(
  trucks: Truck[],
  schedules: RouteSchedule[],
  routes: Route[],
  at: number,
): TruckState[] {
  return trucks.map((t) => simulateTruck(t, schedules, routes, at));
}
