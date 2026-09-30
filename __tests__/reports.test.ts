import { ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS, TRUCKS } from '@/data/carmona';
import { SAMPLE_TICKET_COUNT, sampleTickets } from '@/data/carmona/sampleTickets';
import { judgeClaim, nearestStreet } from '@/features/claims/missed';
import { taskState, truckTasks } from '@/features/driver/tasks';
import { driverStreets, streetProgress } from '@/features/driver/streets';
import { nextWorkingDay, responseDue } from '@/features/reports/categories';
import { suggestDispatch } from '@/features/reports/dispatch';
import {
  applyAction,
  canApply,
  newTicket,
  REOPEN_WINDOW_MS,
  TicketActionError,
  ticketNumber,
  withAutoClose,
} from '@/features/reports/lifecycle';
import { priority } from '@/features/reports/priority';
import { collectionsForBarangay, todaysCollection } from '@/features/schedule/collections';
import { DAY, HOUR, manilaEpoch, manilaParts } from '@/lib/time';
import { OfflineError } from '@/services/errors';
import { createMockReports } from '@/services/mock/reports';
import { useBackend } from '@/stores/backend';
import type {
  LngLat,
  NewReport,
  Route,
  Ticket,
  TicketAction,
  TicketActor,
  TruckEvent,
} from '@/services/types';
import { simulatedTrace, simulateTruck } from '@/simulator/truckSimulator';

const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);
const CANAL: LngLat = [121.045, 14.304];
/** A point `m` metres north of `p`. */
const north = ([lng, lat]: LngLat, m: number): LngLat => [lng, lat + m / 110_540];

const report = (over: Partial<NewReport> = {}): NewReport => ({
  category: 'DUMPING',
  size: 'pile',
  photos: [{ kind: 'sample', id: 'dumping' }],
  location: CANAL,
  accuracyM: 8,
  landmark: '',
  nearWaterway: true,
  nearSensitive: false,
  note: '',
  contact: null,
  ...over,
});

let n = 0;
const ticket = (over: Partial<NewReport> = {}, at = tue(8)): Ticket =>
  newTicket(ticketNumber(2026, ++n), report(over), { at, barangayId: 'milagrosa' });
const act = (t: Ticket, action: TicketAction, at: number, by: TicketActor = 'enro') =>
  applyAction(t, action, { at, by, eventId: `${t.id}|${action.type}|${at}` });

describe('priority score (HAKOT B.2)', () => {
  it('reproduces the worked example: dumping pile 12 m from a canal', () => {
    const t = ticket({ location: CANAL }, tue(8));
    expect(priority(t, [t], tue(8))).toMatchObject({ score: 65, level: 'medium' });
    // Still open a day later: +2 for every 12 hours.
    expect(priority(t, [t], tue(8) + DAY).score).toBe(69);
    // A third report at the same spot within 30 days pushes it to High.
    const others = [
      ticket({ location: north(CANAL, 10) }, tue(8) - 5 * DAY),
      ticket({}, tue(8) - 12 * DAY),
    ];
    expect(priority(t, [t, ...others], tue(8) + DAY)).toMatchObject({ score: 79, level: 'high' });
  });

  it('never exceeds 100 and does not double-count waterway reports', () => {
    const t = ticket({ category: 'WATERWAY', size: 'truckload', nearSensitive: true });
    const p = priority(t, [t], tue(8) + 30 * DAY);
    expect(p.parts.waterway).toBe(0);
    expect(p.score).toBeLessThanOrEqual(100);
  });
});

describe('response targets (HAKOT B.1)', () => {
  it('uses 24 h for hazards and 48 h for illegal dumping', () => {
    expect(responseDue('HAZARD', tue(8))).toBe(tue(8) + 24 * HOUR);
    expect(responseDue('DUMPING', tue(8))).toBe(tue(8) + 48 * HOUR);
    expect(responseDue('BULKY', tue(8))).toBeNull();
  });

  it('treats "next working day" as Monday–Friday', () => {
    const friday = manilaEpoch(2026, 10, 2, 9);
    expect(manilaParts(nextWorkingDay(friday)).weekday).toBe(1);
    expect(nextWorkingDay(tue(9))).toBe(manilaEpoch(2026, 9, 30, 17));
  });
});

describe('ticket lifecycle (HAKOT Figure 4)', () => {
  it('numbers tickets like KPH-2026-000123', () => {
    expect(ticketNumber(2026, 123)).toBe('KPH-2026-000123');
  });

  it('goes submitted → verified → scheduled → in progress → collected → closed', () => {
    let t = ticket();
    t = act(t, { type: 'verify' }, tue(9));
    t = act(
      t,
      { type: 'dispatch', mode: 'special_pickup', truckId: 't2', due: tue(20) },
      tue(9, 5),
    );
    t = act(t, { type: 'start' }, tue(10), 'driver');
    t = act(
      t,
      {
        type: 'collect',
        before: { kind: 'sample', id: 'dumping' },
        after: { kind: 'sample', id: 'clean' },
      },
      tue(10, 30),
      'driver',
    );
    t = act(t, { type: 'rate', stars: 4 }, tue(12), 'resident');
    expect(t.status).toBe('closed');
    expect(t.rating).toBe(4);
    expect(t.history.map((h) => h.kind)).toEqual([
      'submitted',
      'verified',
      'dispatched',
      'started',
      'collected',
      'rated',
    ]);
    expect(t.history.every((h, i, all) => i === 0 || h.at >= all[i - 1].at)).toBe(true);
  });

  it('lets the reporter reopen within 48 hours (back to Scheduled), not after', () => {
    let t = act(
      ticket(),
      { type: 'dispatch', mode: 'special_pickup', truckId: 't2', due: null },
      tue(9),
    );
    t = act(
      t,
      { type: 'collect', before: null, after: { kind: 'sample', id: 'clean' } },
      tue(10),
      'driver',
    );
    const reopen: TicketAction = { type: 'reopen', note: 'May naiwan pa' };
    expect(canApply(t, reopen, 'resident', tue(10) + REOPEN_WINDOW_MS - 1)).toBe(true);
    expect(act(t, reopen, tue(12), 'resident')).toMatchObject({ status: 'scheduled' });
    expect(canApply(t, reopen, 'resident', tue(10) + REOPEN_WINDOW_MS + 1)).toBe(false);
    // After the window, it closes on its own (and can still be rated).
    const closed = withAutoClose(t, tue(10) + REOPEN_WINDOW_MS + HOUR);
    expect(closed.status).toBe('closed');
    expect(closed.history.at(-1)).toMatchObject({ kind: 'closed', by: 'system' });
    expect(canApply(closed, { type: 'rate', stars: 5 }, 'resident', tue(10) + 3 * DAY)).toBe(true);
  });

  it('only lets each role do its own steps', () => {
    const t = ticket();
    expect(canApply(t, { type: 'verify' }, 'resident', tue(9))).toBe(false);
    expect(canApply(t, { type: 'reject', reason: '' }, 'enro', tue(9))).toBe(false);
    expect(() =>
      act(
        t,
        { type: 'collect', before: null, after: { kind: 'sample', id: 'clean' } },
        tue(9),
        'driver',
      ),
    ).toThrow(TicketActionError);
    expect(act(t, { type: 'merge', into: 'KPH-2026-000001' }, tue(9))).toMatchObject({
      status: 'merged',
      mergedInto: 'KPH-2026-000001',
    });
  });
});

describe('sample tickets', () => {
  it('cover every status with valid histories', () => {
    const now = tue(12);
    const tickets = sampleTickets(now).map((t) => withAutoClose(t, now));
    expect(tickets).toHaveLength(SAMPLE_TICKET_COUNT);
    expect(new Set(tickets.map((t) => t.id)).size).toBe(tickets.length);
    const statuses = new Set(tickets.map((t) => t.status));
    for (const s of ['submitted', 'verified', 'scheduled', 'collected', 'closed', 'rejected']) {
      expect(statuses.has(s as Ticket['status'])).toBe(true);
    }
  });

  it('the Milagrosa canal pile is High (waterway + a repeat spot)', () => {
    const now = tue(12);
    const tickets = sampleTickets(now);
    expect(priority(tickets[0], tickets, now).level).toBe('high');
  });
});

describe('dispatch suggestion (HAKOT dispatch rules)', () => {
  const base = { schedules: ROUTE_SCHEDULES, routes: ROUTES, exceptions: SCHEDULE_EXCEPTIONS };
  const fleet = (at: number) =>
    TRUCKS.map((t) => simulateTruck(t, ROUTE_SCHEDULES, ROUTES, at, SCHEDULE_EXCEPTIONS));

  it('suggests merging a duplicate at the same spot within 72 hours', () => {
    const first = ticket({ category: 'OVERFLOW', nearWaterway: false }, tue(6));
    const second = ticket(
      { category: 'OVERFLOW', nearWaterway: false, location: north(CANAL, 20) },
      tue(7),
    );
    const s = suggestDispatch({
      ...base,
      ticket: second,
      tickets: [first, second],
      states: fleet(tue(7)),
      now: tue(7),
    });
    expect(s).toEqual({ action: 'merge', into: first.id });
  });

  it('adds it to a nearby truck with room when one is on route', () => {
    const at = tue(7, 50);
    const t2 = fleet(at).find((s) => s.truckId === 't2')!;
    const t = ticket({ location: t2.position!, nearWaterway: false, category: 'OVERFLOW' }, at);
    const s = suggestDispatch({ ...base, ticket: t, tickets: [t], states: fleet(at), now: at });
    expect(s).toMatchObject({ action: 'dispatch', mode: 'add_to_route', truckId: 't2' });
  });

  it('sends a special pickup for hazards when no truck is nearby', () => {
    const at = manilaEpoch(2026, 9, 30, 14); // Wednesday: no routes running
    const t = ticket({ category: 'HAZARD', nearWaterway: false }, at);
    const s = suggestDispatch({ ...base, ticket: t, tickets: [t], states: fleet(at), now: at });
    expect(s).toMatchObject({ action: 'dispatch', mode: 'special_pickup' });
  });

  it('merges small non-urgent reports with a collection due within 24 hours', () => {
    const at = manilaEpoch(2026, 10, 1, 18); // Thursday evening; Milagrosa is collected Friday
    const t = ticket({ category: 'OVERFLOW', size: 'bags', nearWaterway: false }, at);
    const s = suggestDispatch({ ...base, ticket: t, tickets: [t], states: fleet(at), now: at });
    expect(s).toMatchObject({ action: 'dispatch', mode: 'next_schedule', truckId: 't2' });
  });
});

describe('"Hindi nadaanan" claim (HAKOT §10.2)', () => {
  const route = ROUTES.find((r) => r.id === 'r-poblacion-milagrosa') as Route;
  const streets = driverStreets(route).filter((s) => s.barangayId === 'milagrosa');
  const street = streets[Math.floor(streets.length / 2)];
  const t2 = TRUCKS.find((t) => t.id === 't2')!;
  const occ = collectionsForBarangay(
    'milagrosa',
    ROUTE_SCHEDULES,
    ROUTES,
    SCHEDULE_EXCEPTIONS,
    tue(0),
    3,
  );

  const claim = (
    at: number,
    events: TruckEvent[] = [],
    over: Partial<Parameters<typeof judgeClaim>[0]> = {},
  ) => {
    const truck = simulateTruck(t2, ROUTE_SCHEDULES, ROUTES, at, SCHEDULE_EXCEPTIONS, events);
    return judgeClaim({
      now: at,
      today: todaysCollection(occ, at),
      truck,
      route,
      street,
      point: null,
      trace: simulatedTrace(route, truck.progressM),
      mark: null,
      ...over,
    });
  };

  it('says "not yet" with an arrival time while the route is still running', () => {
    const v = claim(tue(7, 20));
    expect(v.kind).toBe('not_yet');
    expect(v.kind === 'not_yet' && v.arriveAt).toBeGreaterThan(tue(7, 20));
  });

  it('OUTCOME 1: verified miss when the truck never came within 30 m (shift ended early)', () => {
    const shift = { truckId: 't2', source: 'driver' as const };
    const events: TruckEvent[] = [
      {
        ...shift,
        id: 's',
        at: tue(7, 0),
        kind: 'shift_start',
        shiftId: 'x',
        routeId: route.id,
        crew: 3,
      },
      { ...shift, id: 'e', at: tue(7, 30), kind: 'shift_end', shiftId: 'x' },
    ];
    expect(
      streetProgress(
        street,
        simulateTruck(t2, ROUTE_SCHEDULES, ROUTES, tue(11), SCHEDULE_EXCEPTIONS, events).progressM,
      ),
    ).not.toBe('passed');
    expect(claim(tue(11), events).kind).toBe('verified_miss');
  });

  it('OUTCOME 2: not segregated, when the crew logged it', () => {
    const v = claim(tue(11), [], {
      mark: { outcome: 'skipped', reason: 'not_segregated', at: tue(7, 45) },
    });
    expect(v).toEqual({ kind: 'not_segregated', at: tue(7, 45) });
  });

  it('OUTCOME 3: crew not at fault when the road was blocked or the truck was full', () => {
    const blocked = claim(tue(11), [], {
      mark: { outcome: 'skipped', reason: 'road_blocked', at: tue(7, 45) },
    });
    expect(blocked).toEqual({ kind: 'crew_not_at_fault', reason: 'road_blocked' });
    // Mabuhay: Truck 3 fills up with streets left (no crew log needed).
    const mabuhay = ROUTES.find((r) => r.id === 'r-mabuhay') as Route;
    const last = driverStreets(mabuhay).at(-1)!;
    const t3 = simulateTruck(TRUCKS[2], ROUTE_SCHEDULES, ROUTES, tue(9), SCHEDULE_EXCEPTIONS);
    const v = judgeClaim({
      now: tue(9),
      today: todaysCollection(
        collectionsForBarangay('mabuhay', ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS, tue(0), 3),
        tue(9),
      ),
      truck: t3,
      route: mabuhay,
      street: last,
      point: null,
      trace: simulatedTrace(mabuhay, t3.progressM),
      mark: null,
    });
    expect(v).toEqual({ kind: 'crew_not_at_fault', reason: 'truck_full' });
  });

  it('OUTCOME 4: asks for a photo when GPS shows the truck passed (collected or nothing logged)', () => {
    const v = claim(tue(11));
    expect(v.kind).toBe('please_photo');
    expect(v.kind === 'please_photo' && v.passedFrom).toBeLessThan(tue(11));
  });

  it('sends it to an eco-aide when the truck sent no GPS', () => {
    expect(claim(tue(11), [], { trace: [] }).kind).toBe('no_gps');
  });

  it('knows there is no collection on a Wednesday', () => {
    const wed = manilaEpoch(2026, 9, 30, 10);
    expect(
      judgeClaim({
        now: wed,
        today: todaysCollection(occ, wed),
        truck: undefined,
        route,
        street,
        point: null,
        trace: [],
        mark: null,
      }),
    ).toEqual({ kind: 'no_collection_today' });
  });

  it("finds the resident's street from their location", () => {
    const seg = route.segments.find((s) => s.id === street.segmentIds[0])!;
    expect(nearestStreet(streets, route, north(seg.coordinates[0], 20))?.key).toBe(street.key);
    expect(nearestStreet(streets, route, north(seg.coordinates[0], 2_000))).toBeNull();
  });
});

describe('reports service (mock backend)', () => {
  const make = (online = true, events: TruckEvent[] = []) => {
    let tickets: Ticket[] = [];
    let seq = 200;
    const now = { t: tue(11) };
    const service = createMockReports({
      getSimTime: () => now.t,
      getEvents: () => events,
      getTickets: () => tickets,
      saveTicket: (t) => {
        tickets = tickets.some((x) => x.id === t.id)
          ? tickets.map((x) => (x.id === t.id ? t : x))
          : [t, ...tickets];
      },
      nextTicketSeq: () => ++seq,
      isOnline: () => online,
      traceFor: (s) =>
        simulatedTrace(
          ROUTES.find((r) => r.id === s.routeId)!,
          s.progressM,
        ),
    });
    return { service, all: () => tickets, now };
  };

  it('gives a new report the next ticket number and its barangay', async () => {
    const { service } = make();
    const t = await service.submit(report({ location: [121.04384, 14.30479] }));
    expect(t.id).toBe('KPH-2026-000201');
    expect(t.barangayId).toBe('milagrosa');
    expect(t.status).toBe('submitted');
  });

  it('keeps the report on the phone when there is no signal', async () => {
    const { service, all } = make(false);
    await expect(service.submit(report())).rejects.toBeInstanceOf(OfflineError);
    expect(all()).toHaveLength(0);
  });

  it('a verified-miss claim opens one priority ticket per street and day', async () => {
    // The crew ended the shift early (7:30), before reaching Milagrosa.
    const crew = { truckId: 't2', source: 'driver' as const };
    const { service, all } = make(true, [
      {
        ...crew,
        id: 's',
        at: tue(7),
        kind: 'shift_start',
        shiftId: 'x',
        routeId: 'r-poblacion-milagrosa',
        crew: 3,
      },
      { ...crew, id: 'e', at: tue(7, 30), kind: 'shift_end', shiftId: 'x' },
    ]);
    const route = ROUTES.find((r) => r.id === 'r-poblacion-milagrosa') as Route;
    const street = driverStreets(route).filter((s) => s.barangayId === 'milagrosa')[0];
    const place = { barangayId: 'milagrosa', streetKey: street.key, point: null };
    const first = await service.checkMissed(place);
    const again = await service.checkMissed(place);
    expect(first.kind).toBe('verified_miss');
    expect(again).toEqual(first);
    expect(all()).toHaveLength(1);
    expect(all()[0]).toMatchObject({ category: 'MISSED', status: 'verified', source: 'claim' });
  });
});

describe('special pickups (crew tasks)', () => {
  it('the crew’s task reports move the ticket to collected, once, with their photos', () => {
    useBackend.getState().reset();
    const target = useBackend
      .getState()
      .tickets.find((t) => t.status === 'scheduled' && t.dispatch?.truckId === 't4')!;
    const crew = { truckId: 't4', source: 'driver' as const };
    const start: TruckEvent = {
      ...crew,
      id: 'task-1',
      at: target.createdAt + HOUR,
      kind: 'task',
      ticketId: target.id,
      action: 'start',
      before: null,
      after: null,
    };
    const done: TruckEvent = {
      ...crew,
      id: 'task-2',
      at: target.createdAt + 2 * HOUR,
      kind: 'task',
      ticketId: target.id,
      action: 'done',
      before: { kind: 'sample', id: 'waterway' },
      after: { kind: 'sample', id: 'clean' },
    };
    useBackend.getState().receive({ truckId: 't4', events: [start, done], gps: null });
    // A retried upload changes nothing.
    useBackend.getState().receive({ truckId: 't4', events: [start, done], gps: null });
    const t = useBackend.getState().tickets.find((x) => x.id === target.id)!;
    expect(t.status).toBe('collected');
    expect(t.proof).toMatchObject({ by: 'driver', after: { kind: 'sample', id: 'clean' } });
    expect(t.history.filter((h) => h.kind === 'collected')).toHaveLength(1);
  });

  it('lists a truck’s open pickups and marks the ones done on the phone', () => {
    let t = act(
      ticket(),
      { type: 'dispatch', mode: 'special_pickup', truckId: 't1', due: tue(12) },
      tue(9),
    );
    expect(truckTasks([t], 't1', [])).toHaveLength(1);
    expect(truckTasks([t], 't2', [])).toHaveLength(0);
    const local: TruckEvent[] = [
      {
        truckId: 't1',
        source: 'driver',
        id: 'x',
        at: tue(10),
        kind: 'task',
        ticketId: t.id,
        action: 'done',
        before: null,
        after: { kind: 'sample', id: 'clean' },
      },
    ];
    expect(taskState(t, local)).toBe('done');
    t = act(
      t,
      { type: 'collect', before: null, after: { kind: 'sample', id: 'clean' } },
      tue(10),
      'driver',
    );
    // Still shown this shift after upload, as done.
    expect(truckTasks([t], 't1', local)).toHaveLength(1);
    expect(truckTasks([t], 't1', [])).toHaveLength(0);
  });
});
