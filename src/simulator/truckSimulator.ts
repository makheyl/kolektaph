/**
 * Deterministic truck simulator: a truck's state is a pure function of (route, schedule, time,
 * truck events). Every device computing the same time gets the same positions, with no
 * server involved.
 *
 * Model (sample parameters in features/tracking/speeds.ts):
 * - The truck leaves the depot at `departAt` (or the window start).
 * - Transit segments (depot → barangay) at TRANSIT_KMH; collection segments at COLLECT_KMH.
 * - Load grows with collected distance up to schedule.expectedLoad. If that exceeds 1, the
 *   truck becomes FULL part-way and stops there with streets left (the pitch's Problem 3).
 * - Truck events (driver app reports, demo incidents) stop and restart the truck; everything
 *   after a stop shifts later. See simulateTruck().
 * - Schedule exceptions (holidays) move or cancel runs, using the same rules as the schedule.
 */
import { along } from '@turf/along';
import { lineString } from '@turf/helpers';

import { routeRunsOnDay } from '@/features/schedule/collections';
import { segmentMsPerMetre } from '@/features/tracking/speeds';
import { atManilaTime, manilaStartOfDay, MINUTE } from '@/lib/time';
import type {
  BarangayVisitLog,
  DriverStatus,
  LngLat,
  Route,
  RouteSchedule,
  ScheduleException,
  Truck,
  TruckEvent,
  TruckIncident,
  TruckShiftInfo,
  TruckState,
  TruckStatus,
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

/** A stop mapped onto the truck's driving time: it stops after `drivingMs` of driving. */
interface Stop {
  drivingMs: number;
  durationMs: number;
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
  statusSince: null,
  loadReportedAt: null,
  trips: 0,
  shift: null,
});

const byTime = (a: TruckEvent, b: TruckEvent) => a.at - b.at;

/**
 * The truck's state at `at`: a pure function of the schedule, the route and the events
 * reported so far today.
 *
 * Until a driver starts a shift in the driver app, the simulator stands in for the crew: the
 * truck follows the schedule, its load grows with the distance collected, and it becomes FULL
 * where the sample load says it would (demo incidents still apply).
 *
 * Once a driver is on shift, the crew's reports decide: the truck moves only while "Nasa ruta",
 * stops for PUNO / tapunan / break / incidents, empties at the disposal site and carries on.
 * Its load is what the crew last reported (estimated from the distance collected until the
 * first report). A driver can take over a truck mid-route, as in the pitch demo.
 */
export function simulateTruck(
  truck: Truck,
  schedules: RouteSchedule[],
  routes: Route[],
  at: number,
  exceptions: ScheduleException[] = [],
  events: TruckEvent[] = [],
): TruckState {
  const today = manilaStartOfDay(at);
  const todays = events
    .filter((e) => e.truckId === truck.id && e.at <= at && manilaStartOfDay(e.at) === today)
    .sort(byTime);
  const shiftStart = todays.findLast((e) => e.kind === 'shift_start');
  // Driver reports count from the latest shift; demo incidents count all day.
  const mine = todays.filter(
    (e) => e.source === 'demo' || (shiftStart != null && e.at >= shiftStart.at),
  );
  const shiftEnd = shiftStart
    ? mine.find((e) => e.kind === 'shift_end' && e.shiftId === shiftStart.shiftId)
    : undefined;
  const shift: TruckShiftInfo | null = shiftStart
    ? {
        shiftId: shiftStart.shiftId,
        startedAt: shiftStart.at,
        endedAt: shiftEnd?.at ?? null,
        crew: shiftStart.crew,
      }
    : null;
  const shiftAt = shiftStart?.at ?? Infinity;

  const schedule = schedules.find(
    (s) => s.truckId === truck.id && routeRunsOnDay(s, at, exceptions).runs,
  );
  const routeId = shiftStart ? shiftStart.routeId : schedule?.routeId;
  const route = routeId ? routes.find((r) => r.id === routeId) : undefined;
  if (!route) {
    // On shift without a route today (e.g. a GPS test): known, but not on the map.
    return shift
      ? { ...offDuty(truck, at), shift, status: shift.endedAt ? 'done' : 'on_route' }
      : offDuty(truck, at);
  }

  const tl = getTimeline(route);
  const plan = schedule?.routeId === route.id ? schedule : undefined;
  let depart = plan ? atManilaTime(at, plan.departAt ?? plan.start) : shiftAt;
  // "Nasa ruta" before the planned departure means the truck left early.
  const early = mine.find(
    (e) => e.kind === 'status' && e.status === 'on_route' && e.source === 'driver' && e.at < depart,
  );
  if (early) depart = early.at;

  // Where the sample load would make the truck full (only while the simulator drives it).
  const expectedLoad = plan?.expectedLoad ?? 1;
  let full: { index: number; intoM: number } | null = null;
  let fullDrivingMs = Infinity;
  if (expectedLoad > 1) {
    full = locateByCollected(tl, tl.collectLengthM / expectedLoad);
    fullDrivingMs =
      tl.startMs[full.index] + full.intoM * segmentMsPerMetre(route.segments[full.index].collect);
  }

  // ---- Walk through the day: the truck drives while "on route" and is stopped otherwise.
  const w = {
    base: 'on_route' as DriverStatus,
    incident: null as TruckIncident | null,
    ended: false,
    /** The simulator filled the truck up (before any driver shift). */
    fullHit: false,
    trips: 0,
    driving: 0,
    /** Last load reset or report: value, driving time then, and when the crew reported it. */
    anchor: { load: 0, drivingMs: 0, reportedAt: null as number | null },
  };
  const stops: Stop[] = [];

  const finished = () => w.driving >= tl.totalMs;
  const moving = () => !w.ended && !w.incident && w.base === 'on_route' && !finished();
  const effective = (): TruckStatus => {
    if (w.ended) return 'done';
    if (w.incident) return 'breakdown';
    if (finished() && w.base === 'on_route') return 'done';
    return w.base;
  };

  const apply = (e: TruckEvent) => {
    // Without a crew on shift, incidents after the truck has finished are ignored.
    if (!shift && (w.fullHit || finished())) return;
    switch (e.kind) {
      case 'status':
        w.base = e.status;
        if (e.status === 'full') w.anchor = { load: 1, drivingMs: w.driving, reportedAt: e.at };
        break;
      case 'load':
        w.anchor = { load: e.load, drivingMs: w.driving, reportedAt: e.at };
        break;
      case 'disposal':
        if (e.action === 'arrive') w.base = 'to_disposal';
        else {
          w.base = 'on_route';
          w.trips += 1;
          w.anchor = { load: 0, drivingMs: w.driving, reportedAt: null };
        }
        break;
      case 'incident':
        w.incident = { kind: e.incident, since: e.at, until: e.at + e.minutes * MINUTE };
        break;
      case 'incident_end':
        w.incident = null;
        break;
      case 'shift_end':
        w.ended = true;
        break;
      default:
        break;
    }
  };

  let now = depart;
  let i = 0;
  // Reports from before the departure set the starting state (e.g. a break at the depot).
  for (; i < mine.length && mine[i].at <= depart; i++) apply(mine[i]);
  if (w.incident && w.incident.until <= Math.min(depart, at)) w.incident = null;

  let status: TruckStatus = effective();
  let statusSince: number | null = depart;

  while (now < at) {
    // The sample "fills up here" point only applies while the simulator drives the truck.
    const limit = !w.fullHit && now < shiftAt ? Math.min(tl.totalMs, fullDrivingMs) : tl.totalMs;
    const nextEvent = i < mine.length ? mine[i].at : Infinity;
    const expires = w.incident ? w.incident.until : Infinity;
    const capAt = moving() ? now + (limit - w.driving) : Infinity;
    const next = Math.min(nextEvent, expires, capAt, at);
    if (moving()) {
      w.driving = Math.min(limit, w.driving + (next - now));
    } else if (!finished() && next > now) {
      stops.push({ drivingMs: w.driving, durationMs: next - now });
    }
    now = next;
    if (!w.fullHit && full && w.driving >= fullDrivingMs && now <= shiftAt) {
      // The sample load filled the truck: it stops here until a crew empties it.
      w.fullHit = true;
      w.base = 'full';
      w.anchor = { load: 1, drivingMs: w.driving, reportedAt: null };
    }
    if (w.incident && w.incident.until <= now) w.incident = null;
    for (; i < mine.length && mine[i].at <= now; i++) apply(mine[i]);
    const s = effective();
    if (s !== status) {
      status = s;
      statusSince = now;
    }
  }
  if (at < depart) {
    // Waiting at the depot (an incident reported there shows up; the truck has not moved).
    status = w.incident ? 'breakdown' : 'not_started';
    statusSince = w.incident ? w.incident.since : null;
  }
  const { driving, anchor } = w;

  // ---- Where the truck is, and its load.
  let index: number;
  let intoM: number;
  if (full && w.fullHit && driving === fullDrivingMs) ({ index, intoM } = full);
  else if (finished()) {
    index = route.segments.length - 1;
    intoM = route.segments[index].lengthM;
  } else ({ index, intoM } = locateByTime(tl, driving));
  const seg = route.segments[index];
  const progressM = tl.startM[index] + Math.min(intoM, seg.lengthM);

  let load = anchor.load;
  if (anchor.reportedAt == null) {
    // Not reported by the crew: estimate from the distance collected since the last reset.
    const since = locateByTime(tl, anchor.drivingMs);
    const collectedSince =
      collectedAt(tl, index, intoM) - collectedAt(tl, since.index, since.intoM);
    load = Math.min(1, anchor.load + (collectedSince / tl.collectLengthM) * expectedLoad);
  }

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
    incident: status === 'breakdown' ? w.incident : null,
    statusSince,
    loadReportedAt: anchor.reportedAt,
    trips: w.trips,
    shift,
  };
}

export function simulateFleet(
  trucks: Truck[],
  schedules: RouteSchedule[],
  routes: Route[],
  at: number,
  exceptions: ScheduleException[] = [],
  events: TruckEvent[] = [],
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
