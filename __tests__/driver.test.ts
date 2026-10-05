import {
  BARANGAYS,
  ROUTE_SCHEDULES,
  ROUTES,
  SCHEDULE_EXCEPTIONS,
  SMS_REGISTRATIONS,
  TRUCKS,
} from '@/data/carmona';
import { type EngineContext, operationalAlerts } from '@/features/alerts/engine';
import { WEEKDAYS_FIL } from '@/features/alerts/templates';
import { missedStreets } from '@/features/coverage/coverage';
import { acceptFixes, STILL_HEARTBEAT_MS, traceStats } from '@/features/driver/gpsLog';
import {
  buildBatch,
  GPS_BATCH,
  type OutboxItem,
  pendingCounts,
  readyEvents,
  retryDelayMs,
  shiftEndId,
  shiftStartId,
} from '@/features/driver/outbox';
import {
  driverStreets,
  skipsBySegment,
  streetMarks,
  streetProgress,
} from '@/features/driver/streets';
import { suggestBackups } from '@/features/load/backup';
import { manilaEpoch, MINUTE } from '@/lib/time';
import type { GpsFix, Route, TruckEvent, TruckEventInput } from '@/services/types';
import { useBackend } from '@/stores/backend';
import { useDriver } from '@/stores/driver';
import { useGps } from '@/stores/gps';
import { simulatedTrace, simulateFleet, simulateTruck } from '@/simulator/truckSimulator';

const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);
const truck = (id: string) => TRUCKS.find((t) => t.id === id)!;
const route = (id: string) => ROUTES.find((r) => r.id === id) as Route;
const nameOf = (id: string) =>
  BARANGAYS.features.find((f) => f.properties.id === id)!.properties.name;

let seq = 0;
/** A driver report for Truck 3 (Mabuhay route) at a Tuesday time. */
const t3 = (at: number, input: TruckEventInput): TruckEvent =>
  ({ ...input, id: `e${++seq}`, truckId: 't3', at, source: 'driver' }) as TruckEvent;
const shiftStart = (at: number) =>
  t3(at, { kind: 'shift_start', shiftId: 's3', routeId: 'r-mabuhay', crew: 3 });

const sim = (id: string, at: number, events: TruckEvent[] = []) =>
  simulateTruck(truck(id), ROUTE_SCHEDULES, ROUTES, at, SCHEDULE_EXCEPTIONS, events);

const ctx = (events: TruckEvent[]): EngineContext => ({
  schedules: ROUTE_SCHEDULES,
  routes: ROUTES,
  exceptions: SCHEDULE_EXCEPTIONS,
  trucks: TRUCKS,
  events,
  registrations: SMS_REGISTRATIONS,
  barangayName: nameOf,
  weekdayFil: (w) => WEEKDAYS_FIL[w],
});

describe('simulator with a driver on shift', () => {
  it('takes over mid-route without sending the truck back to the depot', () => {
    const events = [shiftStart(tue(7, 40))];
    const withDriver = sim('t3', tue(7, 40), events);
    expect(withDriver.progressM).toBeCloseTo(sim('t3', tue(7, 40)).progressM, 3);
    expect(withDriver.shift).toMatchObject({ shiftId: 's3', crew: 3, endedAt: null });
  });

  it('PUNO stops the truck where it is, at 100%, until it goes to the tapunan', () => {
    const events = [shiftStart(tue(7, 20)), t3(tue(7, 40), { kind: 'status', status: 'full' })];
    const at = sim('t3', tue(7, 40), events);
    const later = sim('t3', tue(9, 0), events);
    expect(later.status).toBe('full');
    expect(later.load).toBe(1);
    expect(later.loadReportedAt).toBe(tue(7, 40));
    expect(later.position).toEqual(at.position);
    expect(later.statusSince).toBe(tue(7, 40));
  });

  it('empties at the tapunan, counts the trip and carries on with the route', () => {
    const events = [
      shiftStart(tue(7, 20)),
      t3(tue(7, 40), { kind: 'status', status: 'full' }),
      t3(tue(7, 42), { kind: 'status', status: 'to_disposal' }),
      t3(tue(8, 10), { kind: 'disposal', action: 'arrive' }),
      t3(tue(8, 30), { kind: 'disposal', action: 'leave' }),
    ];
    const atDisposal = sim('t3', tue(8, 15), events);
    expect(atDisposal.status).toBe('to_disposal');
    const back = sim('t3', tue(8, 45), events);
    expect(back.status).toBe('on_route');
    expect(back.trips).toBe(1);
    expect(back.load).toBeGreaterThan(0);
    expect(back.load).toBeLessThan(0.5);
    // 50 minutes stopped: exactly where it would be 50 minutes earlier without stopping.
    const noStop = sim('t3', tue(7, 55), [shiftStart(tue(7, 20))]);
    expect(back.progressM).toBeCloseTo(noStop.progressM, 3);
    // Eventually it finishes the whole route (no simulated "full" once a crew is on shift).
    expect(sim('t3', tue(12, 0), events).status).toBe('done');
  });

  it('shows the load the crew reported', () => {
    const events = [shiftStart(tue(7, 0)), t3(tue(7, 20), { kind: 'load', load: 0.5 })];
    const s = sim('t3', tue(7, 30), events);
    expect(s.load).toBe(0.5);
    expect(s.loadReportedAt).toBe(tue(7, 20));
  });

  it('stops for an incident until the crew says it is fixed', () => {
    const events = [
      shiftStart(tue(7, 0)),
      t3(tue(7, 20), { kind: 'incident', incident: 'flood', minutes: 60 }),
      t3(tue(7, 35), { kind: 'incident_end' }),
    ];
    const during = sim('t3', tue(7, 30), events);
    expect(during.status).toBe('breakdown');
    expect(during.incident).toEqual({ kind: 'flood', since: tue(7, 20), until: tue(8, 20) });
    const after = sim('t3', tue(7, 40), events);
    expect(after.status).toBe('on_route');
    expect(after.progressM).toBeGreaterThan(during.progressM);
  });

  it('a break stops the truck; ending the shift finishes it', () => {
    const events = [
      shiftStart(tue(7, 0)),
      t3(tue(7, 20), { kind: 'status', status: 'break' }),
      t3(tue(7, 50), { kind: 'status', status: 'on_route' }),
      t3(tue(8, 0), { kind: 'shift_end', shiftId: 's3' }),
    ];
    expect(sim('t3', tue(7, 30), events).status).toBe('break');
    const ended = sim('t3', tue(9, 0), events);
    expect(ended.status).toBe('done');
    expect(ended.shift?.endedAt).toBe(tue(8, 0));
    expect(ended.progressM).toBeLessThan(ended.routeLengthM);
  });

  it('"Nasa ruta" before the planned departure means leaving early', () => {
    const t2 = (at: number, input: TruckEventInput) =>
      ({ ...input, id: `x${++seq}`, truckId: 't2', at, source: 'driver' }) as TruckEvent;
    const events = [
      t2(tue(6, 50), {
        kind: 'shift_start',
        shiftId: 's2',
        routeId: 'r-poblacion-milagrosa',
        crew: 2,
      }),
      t2(tue(7, 0), { kind: 'status', status: 'on_route' }),
    ];
    expect(sim('t2', tue(7, 10), events).departAt).toBe(tue(7, 0));
    // Without the tap, Truck 2 waits for its 7:17 departure even with a driver on shift.
    expect(sim('t2', tue(7, 10), events.slice(0, 1)).status).toBe('not_started');
  });
});

describe('alerts from driver reports', () => {
  it('DONE-WHEN S4: PUNO from the driver raises the backup suggestion for City ENRO', () => {
    const events = [shiftStart(tue(7, 20)), t3(tue(7, 45), { kind: 'status', status: 'full' })];
    const at = tue(7, 46);
    const states = simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, at, SCHEDULE_EXCEPTIONS, events);
    const s3 = states.find((s) => s.truckId === 't3')!;
    expect(s3.status).toBe('full');
    const missed = missedStreets({
      route: route('r-mabuhay'),
      truck: s3,
      trace: simulatedTrace(route('r-mabuhay'), s3.progressM),
      windowEnd: tue(10),
      now: at,
    });
    const [suggestion] = suggestBackups(states, ROUTES, ROUTE_SCHEDULES, at, missed);
    expect(suggestion).toMatchObject({ fullTruckId: 't3', barangayId: 'mabuhay' });
    expect(suggestion.streetsLeft).toBeGreaterThanOrEqual(3);
  });

  it('tells Mabuhay about the delay, then texts again when the truck is back', () => {
    const events = [
      shiftStart(tue(7, 0)),
      t3(tue(7, 30), { kind: 'status', status: 'full' }),
      t3(tue(7, 32), { kind: 'status', status: 'to_disposal' }),
      t3(tue(8, 30), { kind: 'disposal', action: 'leave' }),
    ];
    const alerts = operationalAlerts(ctx(events), manilaEpoch(2026, 9, 29));
    const full = alerts.find((a) => a.kind === 'delay_full' && a.barangayIds[0] === 'mabuhay');
    expect(full?.sentAt).toBe(tue(7, 30));
    const resumed = alerts.filter(
      (a) =>
        a.kind.startsWith('vicinity') && a.barangayIds[0] === 'mabuhay' && a.sentAt >= tue(8, 30),
    );
    expect(resumed).toHaveLength(1);
  });

  it('names the incident in the delay SMS', () => {
    const events = [
      shiftStart(tue(7, 0)),
      t3(tue(7, 10), { kind: 'incident', incident: 'flood', minutes: 60 }),
    ];
    const delay = operationalAlerts(ctx(events), manilaEpoch(2026, 9, 29)).find(
      (a) => a.kind === 'delay_breakdown',
    );
    expect(delay?.text).toContain('dahil sa baha');
    expect(delay?.sentAt).toBe(tue(7, 10));
  });
});

describe('street log', () => {
  const r = route('r-poblacion-milagrosa');
  const streets = driverStreets(r);

  it('lists every collection segment of the route exactly once, one row per street', () => {
    const ids = streets.flatMap((s) => s.segmentIds);
    const expected = r.segments
      .filter((s) => s.collect && s.barangayId && r.barangayIds.includes(s.barangayId))
      .map((s) => s.id);
    expect(new Set(ids)).toEqual(new Set(expected));
    expect(ids).toHaveLength(expected.length);
    expect(new Set(streets.map((s) => s.key)).size).toBe(streets.length);
    expect(streets.every((s) => s.startM < s.endM)).toBe(true);
  });

  it('tells passed, current and upcoming streets apart', () => {
    const s = streets[3];
    expect(streetProgress(s, s.startM - 1)).toBe('upcoming');
    expect(streetProgress(s, (s.startM + s.endM) / 2)).toBe('current');
    expect(streetProgress(s, s.endM)).toBe('passed');
  });

  it('lists a skipped street with the crew reason; "walang basura" is not a miss', () => {
    const blocked = streets.find((s) => s.barangayId === 'milagrosa' && s.name)!;
    const empty = streets.find((s) => s.barangayId === 'milagrosa' && s.name && s !== blocked)!;
    const mk = (s: typeof blocked, reason: 'road_blocked' | 'no_garbage'): TruckEvent => ({
      id: `st${++seq}`,
      truckId: 't2',
      at: tue(7, 45),
      source: 'driver',
      kind: 'street',
      routeId: r.id,
      streetKey: s.key,
      segmentIds: s.segmentIds,
      outcome: 'skipped',
      reason,
    });
    const events = [mk(blocked, 'road_blocked'), mk(empty, 'no_garbage')];
    expect(streetMarks(events, r.id).get(blocked.key)?.reason).toBe('road_blocked');
    const state = sim('t2', tue(13));
    const missed = missedStreets({
      route: r,
      truck: state,
      trace: simulatedTrace(r, state.progressM),
      windowEnd: tue(10),
      now: tue(13),
      skips: skipsBySegment(events, r.id),
    });
    expect(missed).toEqual([
      expect.objectContaining({
        name: blocked.name,
        reason: 'skipped',
        skipReason: 'road_blocked',
      }),
    ]);
  });
});

describe('offline queue', () => {
  const ev = (id: string): TruckEvent => ({
    id,
    truckId: 't1',
    at: tue(8),
    source: 'driver',
    kind: 'load',
    load: 0.5,
  });
  const item = (id: string, holdUntil = 0, synced = false): OutboxItem => ({
    event: ev(id),
    holdUntil,
    synced,
  });

  it('sends in order and waits for a tap that can still be undone', () => {
    const outbox = [item('a', 0, true), item('b'), item('c', 5_000), item('d')];
    expect(readyEvents(outbox, 1_000).map((e) => e.id)).toEqual(['b']);
    expect(readyEvents(outbox, 6_000).map((e) => e.id)).toEqual(['b', 'c', 'd']);
  });

  it('uploads GPS fixes in batches from the first unsent one', () => {
    const fixes: GpsFix[] = Array.from({ length: 450 }, (_, i) => ({
      t: i * 5_000,
      lng: 121,
      lat: 14,
      acc: 5,
    }));
    const batch = buildBatch('t1', [], { shiftId: 's', source: 'phone', fixes, sentCount: 200 }, 0);
    expect(batch?.gps).toMatchObject({ shiftId: 's', fromIndex: 200 });
    expect(batch?.gps?.fixes).toHaveLength(GPS_BATCH);
    expect(buildBatch('t1', [], { shiftId: 's', source: 'phone', fixes, sentCount: 450 }, 0)).toBe(
      null,
    );
  });

  it('backs off between failed uploads, up to a minute', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000,
    ]);
  });

  it('the server ignores repeats of events and GPS fixes it already has', () => {
    useBackend.getState().reset();
    const fixes: GpsFix[] = [0, 1, 2, 3].map((i) => ({ t: i, lng: 121, lat: 14, acc: 5 }));
    const gps = (from: number, to: number) => ({
      shiftId: 's',
      source: 'phone' as const,
      fromIndex: from,
      fixes: fixes.slice(from, to),
    });
    useBackend.getState().receive({ truckId: 't1', events: [ev('a')], gps: gps(0, 3) });
    // A retry after a lost reply resends overlapping data.
    useBackend.getState().receive({ truckId: 't1', events: [ev('a'), ev('b')], gps: gps(1, 4) });
    const { events, traces } = useBackend.getState();
    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(traces.s.fixes.map((f) => f.t)).toEqual([0, 1, 2, 3]);
  });
});

describe('GPS recording rules', () => {
  const shift = { startedAtDevice: 1_000_000, endedAtDevice: 2_000_000 };
  const fix = (t: number, lng = 121.05, acc: number | null = 8): GpsFix => ({
    t,
    lng,
    lat: 14.3,
    acc,
  });

  it('TC-09: keeps nothing before the shift starts or after it ends', () => {
    const { accepted } = acceptFixes(shift, null, [
      fix(999_000),
      fix(1_500_000),
      fix(2_000_001, 121.06),
    ]);
    expect(accepted.map((f) => f.t)).toEqual([1_500_000]);
    expect(acceptFixes(null, null, [fix(1_500_000)]).accepted).toEqual([]);
  });

  it('drops rough fixes and repeats, and thins out a truck standing still', () => {
    const moving = [
      fix(1_010_000, 121.05),
      fix(1_015_000, 121.0501, 250),
      fix(1_015_000, 121.0502),
    ];
    expect(acceptFixes(shift, null, moving).accepted.map((f) => f.t)).toEqual([
      1_010_000, 1_015_000,
    ]);
    const still = [0, 5, 10, 15, 20, 25, 30, 35].map((s) => fix(1_100_000 + s * 1000));
    const kept = acceptFixes(shift, null, still).accepted;
    expect(kept.map((f) => f.t - 1_100_000)).toEqual([0, STILL_HEARTBEAT_MS]);
  });

  it('summarises a recording, including gaps (e.g. a phone switched off)', () => {
    const fixes = [0, 5, 10, 200, 205].map((s) => fix(s * 1000, 121.05 + s * 0.00001));
    const stats = traceStats(fixes);
    expect(stats.points).toBe(5);
    expect(stats.gaps).toEqual([[10_000, 200_000]]);
    expect(stats.durationMs).toBe(205_000);
    expect(stats.distanceM).toBeGreaterThan(0);
  });
});

describe('recording keeps up with a 1-hour shift', () => {
  it('a 1-hour walk at one fix per 5 s stays small enough to keep on the phone', () => {
    const fixes = Array.from({ length: 720 }, (_, i) => ({
      t: 1_000_000 + i * 5_000,
      lng: 121.05 + i * 0.00005,
      lat: 14.3,
      acc: 6,
    }));
    const { accepted } = acceptFixes({ startedAtDevice: 0, endedAtDevice: null }, null, fixes);
    expect(accepted).toHaveLength(720);
    expect(JSON.stringify(accepted).length).toBeLessThan(60_000);
    expect(traceStats(accepted).gaps).toEqual([]);
    expect(traceStats(accepted).durationMs).toBe(719 * 5_000);
    expect(MINUTE).toBe(60_000);
  });
});

describe('the phone and the server agree on what was sent', () => {
  beforeEach(() => {
    useDriver.setState({
      session: { truckId: 't2', signedInAt: 0 },
      shift: null,
      outbox: [],
      sync: {
        lastOkAt: null,
        failures: 0,
        nextTryAt: 0,
        lastError: null,
        refused: 0,
        lastRefusal: null,
      },
    });
  });

  it('a shift start and end get ids made from the shift, so both copies are one', () => {
    useDriver
      .getState()
      .startShift({ routeId: 'r-poblacion-milagrosa', crew: 3, gpsSource: 'demo' });
    const { shiftId } = useDriver.getState().shift!;
    useDriver.getState().report({ kind: 'status', status: 'on_route' });
    useDriver.getState().endShift();
    const events = useDriver.getState().outbox.map((o) => o.event);
    expect(events.map((e) => e.id)).toEqual([
      shiftStartId(shiftId),
      expect.stringMatching(/^t2\|status\|/),
      shiftEndId(shiftId),
    ]);
    // Every report names its shift, so the upload can say which shift it belongs to.
    expect(events.every((e) => e.shiftId === shiftId)).toBe(true);
    // Ids must fit the server's rule for event and shift ids.
    expect(events.every((e) => /^[A-Za-z0-9|_.:-]{8,80}$/.test(e.id))).toBe(true);
    expect(shiftId).toMatch(/^[A-Za-z0-9|_.:-]{8,80}$/);
  });

  it('reports the server refused for good are dropped and counted, the rest stay', () => {
    useDriver.getState().startShift({ routeId: null, crew: 2, gpsSource: 'demo' });
    const a = useDriver.getState().report({ kind: 'load', load: 0.5 });
    const b = useDriver.getState().report({ kind: 'status', status: 'full' });
    useDriver.getState().dropRefused([{ id: a, reason: 'bad_time' }]);
    expect(useDriver.getState().outbox.map((o) => o.event.id)).not.toContain(a);
    expect(useDriver.getState().outbox.map((o) => o.event.id)).toContain(b);
    expect(useDriver.getState().sync).toMatchObject({ refused: 1, lastRefusal: 'bad_time' });
  });

  it('after a gap the phone sends GPS again from where the server really is', () => {
    useGps.getState().begin('s1', 'phone');
    useGps.setState({
      fixes: [0, 1, 2, 3, 4].map((t) => ({ t, lng: 121, lat: 14, acc: 5 })),
      sentCount: 4,
    });
    useGps.getState().setSent('s1', 2);
    expect(useGps.getState().sentCount).toBe(2);
    useGps.getState().setSent('other-shift', 0);
    expect(useGps.getState().sentCount).toBe(2);
    useGps.getState().setSent('s1', 99);
    expect(useGps.getState().sentCount).toBe(5);
  });

  it('GPS the server refuses for good is no longer sent, and no longer counts as waiting', () => {
    const queue = {
      shiftId: 's1',
      source: 'phone' as const,
      fixes: [0, 1, 2].map((t) => ({ t, lng: 121, lat: 14, acc: 5 })),
      sentCount: 1,
    };
    expect(buildBatch('t2', [], queue, 0)?.gps?.fixes).toHaveLength(2);
    expect(buildBatch('t2', [], { ...queue, blocked: 'bad_fixes' }, 0)).toBeNull();
    expect(pendingCounts([], { ...queue, blocked: 'bad_fixes' }).fixes).toBe(0);
  });
});
