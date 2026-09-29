/**
 * Deterministic truck simulator: a truck's state is a pure function of (route, schedule, time,
 * scenario events). Every device computing the same time gets the same positions, with no
 * server involved.
 *
 * Model (sample parameters in features/tracking/speeds.ts):
 * - The truck leaves the depot at `departAt` (or the window start).
 * - Transit segments (depot → barangay) at TRANSIT_KMH; collection segments at COLLECT_KMH.
 * - Load grows with collected distance up to schedule.expectedLoad. If that exceeds 1, the
 *   truck becomes FULL part-way and stops there with streets left (the pitch's Problem 3).
 * - Breakdown events stop the truck for their duration; everything after shifts later.
 * - Schedule exceptions (holidays) move or cancel runs, using the same rules as the schedule.
 */
import { along } from '@turf/along';
import { lineString } from '@turf/helpers';

import { routeRunsOnDay } from '@/features/schedule/collections';
import { segmentMsPerMetre } from '@/features/tracking/speeds';
import { atManilaTime, manilaStartOfDay, MINUTE } from '@/lib/time';
import type {
  BarangayVisitLog,
  LngLat,
  Route,
  RouteSchedule,
  ScenarioEvent,
  ScheduleException,
  Truck,
  TruckIncident,
  TruckState,
} from '@/services/types';

interface Timeline {
  route: Route;
  /** Offset (ms of driving after departure) at which each segment begins. */
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

/** Segment index and metres into it after `drivingMs` of driving. */
function locateByTime(tl: Timeline, drivingMs: number): { index: number; intoM: number } {
  const { segments } = tl.route;
  let i = 0;
  while (i < segments.length - 1 && tl.startMs[i + 1] <= drivingMs) i++;
  return { index: i, intoM: (drivingMs - tl.startMs[i]) / segmentMsPerMetre(segments[i].collect) };
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

/** A breakdown mapped onto the truck's driving time: it stops after `drivingMs` of driving. */
interface Stop {
  drivingMs: number;
  durationMs: number;
  since: number;
  until: number;
}

/**
 * Converts driving time to wall-clock time, adding every stop that happened before it.
 * A stop "at" drivingMs d delays everything strictly after d.
 */
function wallClock(depart: number, stops: Stop[], drivingMs: number): number {
  let t = depart + drivingMs;
  for (const s of stops) if (s.drivingMs < drivingMs) t += s.durationMs;
  return t;
}

/**
 * When the truck started and finished collecting in each of the route's barangays, given how
 * far it has driven. A barangay is finished once its last collection segment is done.
 */
function visitLog(
  tl: Timeline,
  depart: number,
  stops: Stop[],
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
      startedAt: progressM > tl.startM[first] ? wallClock(depart, stops, tl.startMs[first]) : null,
      finishedAt: progressM >= lastEndM ? wallClock(depart, stops, lastEndMs) : null,
    };
  }
  return log;
}

interface Ctx {
  truck: Truck;
  tl: Timeline;
  depart: number;
  stops: Stop[];
  at: number;
}

function stateAt(
  { truck, tl, depart, stops, at }: Ctx,
  index: number,
  intoM: number,
  status: TruckState['status'],
  load: number,
  incident: TruckIncident | null = null,
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
    visits: visitLog(tl, depart, stops, progressM),
    departAt: depart,
    incident,
  };
}

const offDuty = (truck: Truck, at: number): TruckState => ({
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
  departAt: null,
  incident: null,
});

export function simulateTruck(
  truck: Truck,
  schedules: RouteSchedule[],
  routes: Route[],
  at: number,
  exceptions: ScheduleException[] = [],
  events: ScenarioEvent[] = [],
): TruckState {
  const schedule = schedules.find(
    (s) => s.truckId === truck.id && routeRunsOnDay(s, at, exceptions).runs,
  );
  const route = schedule && routes.find((r) => r.id === schedule.routeId);
  if (!schedule || !route) return offDuty(truck, at);

  const tl = getTimeline(route);
  const depart = atManilaTime(at, schedule.departAt ?? schedule.start);

  // Driving time at which the truck fills up (Infinity if the route fits in one load).
  let fullDrivingMs = Infinity;
  let full: { index: number; intoM: number } | null = null;
  if (schedule.expectedLoad > 1) {
    full = locateByCollected(tl, tl.collectLengthM / schedule.expectedLoad);
    fullDrivingMs =
      tl.startMs[full.index] + full.intoM * segmentMsPerMetre(route.segments[full.index].collect);
  }
  const lastDrivingMs = Math.min(tl.totalMs, fullDrivingMs);

  // Breakdowns count only if they happen while this truck is actually driving its route today.
  const today = manilaStartOfDay(at);
  const stops: Stop[] = [];
  for (const e of events
    .filter((ev) => ev.kind === 'breakdown' && ev.truckId === truck.id)
    .filter((ev) => manilaStartOfDay(ev.at) === today && ev.at <= at)
    .sort((a, b) => a.at - b.at)) {
    const drivingMs = e.at - depart - stops.reduce((sum, s) => sum + s.durationMs, 0);
    if (drivingMs < 0 || drivingMs >= lastDrivingMs) continue;
    const durationMs = e.minutes * MINUTE;
    stops.push({ drivingMs, durationMs, since: e.at, until: e.at + durationMs });
  }

  const ctx: Ctx = { truck, tl, depart, stops, at };
  const active = stops.find((s) => at >= s.since && at < s.until);
  // Driving done so far = wall time since departure minus time spent stopped.
  const stoppedMs = stops.reduce((sum, s) => sum + Math.max(0, Math.min(at, s.until) - s.since), 0);
  const driving = at - depart - stoppedMs;

  if (driving < 0) return stateAt(ctx, 0, 0, 'not_started', 0);

  if (full && driving >= fullDrivingMs) {
    return stateAt(ctx, full.index, full.intoM, 'full', 1);
  }

  if (driving >= tl.totalMs) {
    const last = route.segments.length - 1;
    const load = Math.min(1, schedule.expectedLoad);
    return stateAt(ctx, last, route.segments[last].lengthM, 'done', load);
  }

  const { index, intoM } = locateByTime(tl, driving);
  const load = Math.min(
    1,
    (collectedAt(tl, index, intoM) / tl.collectLengthM) * schedule.expectedLoad,
  );
  if (active) {
    return stateAt(ctx, index, intoM, 'breakdown', load, {
      kind: 'breakdown',
      since: active.since,
      until: active.until,
    });
  }
  return stateAt(ctx, index, intoM, 'on_route', load);
}

export function simulateFleet(
  trucks: Truck[],
  schedules: RouteSchedule[],
  routes: Route[],
  at: number,
  exceptions: ScheduleException[] = [],
  events: ScenarioEvent[] = [],
): TruckState[] {
  return trucks.map((t) => simulateTruck(t, schedules, routes, at, exceptions, events));
}

/**
 * The GPS points a truck would have sent so far: one every `spacingM` metres along the part of
 * the route it has driven. The coverage check treats these exactly like real phone GPS.
 */
export function simulatedTrace(route: Route, progressM: number, spacingM = 15): LngLat[] {
  const tl = getTimeline(route);
  const points: LngLat[] = [];
  route.segments.forEach((seg, i) => {
    const start = tl.startM[i];
    if (start > progressM) return;
    const driven = Math.min(seg.lengthM, progressM - start);
    for (let m = 0; m <= driven; m += spacingM) points.push(pointOnSegment(route, i, m));
  });
  return points;
}
