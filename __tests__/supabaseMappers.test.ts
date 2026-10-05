/**
 * Database rows → app types. The database stores each fact once; these tests check that what
 * the app rebuilds from the rows is exactly what the sample (mock) backend produces for the same
 * story, so both backends drive the same screens.
 */
import { ROUTE_SCHEDULES, ROUTES } from '@/data/carmona';
import { shiftEndId, shiftStartId } from '@/features/driver/outbox';
import { driverStreets } from '@/features/driver/streets';
import {
  applyAction,
  newTicket,
  REOPEN_WINDOW_MS,
  withAutoClose,
} from '@/features/reports/lifecycle';
import { applyScheduleChange } from '@/features/schedule/editing';
import { HOUR, manilaEpoch } from '@/lib/time';
import {
  buildTruckEvents,
  type EventRow,
  mapAnnouncement,
  mapContacts,
  mapDecisions,
  mapLeadChanges,
  mapSchedules,
  mapShift,
  mapStaff,
  mapTicket,
  mapTickets,
  parseTime,
  type ScheduleRow,
  type TicketEventRow,
  type TicketPhotoRow,
  type TicketRow,
  toUploadEvent,
  unpackGps,
} from '@/services/supabase/mappers';
import type { NewReport, Ticket, TruckEvent } from '@/services/types';

const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
const t0 = manilaEpoch(2026, 10, 2, 8);

describe('times from the database', () => {
  it('reads timestamps with microseconds and a UTC offset', () => {
    expect(parseTime('2026-10-01T16:13:07.804807+00:00')).toBe(
      Date.UTC(2026, 9, 1, 16, 13, 7, 804),
    );
    expect(parseTime('2026-10-02T00:13:07+08:00')).toBe(Date.UTC(2026, 9, 1, 16, 13, 7));
    expect(parseTime('2026-10-01T16:13:07.8+00:00')).toBe(Date.UTC(2026, 9, 1, 16, 13, 7, 800));
  });
});

describe('schedules', () => {
  /** The seeded rows, as the API returns them. */
  const seedRows: ScheduleRow[] = ROUTE_SCHEDULES.map((s, i) => ({
    id: i + 1,
    route_id: s.routeId,
    truck_id: s.truckId,
    days: s.days,
    start_time: `${s.start}:00`,
    window_end: `${s.windowEnd}:00`,
    depart_at: s.departAt ? `${s.departAt}:00` : null,
    waste_type: s.wasteType,
    expected_load: s.expectedLoad,
    valid_from: null,
  }));

  it('the seeded rows map back to the bundled sample schedule', () => {
    expect(mapSchedules(seedRows)).toEqual(ROUTE_SCHEDULES);
  });

  it('a dated change ends the earlier record the day before, as the app does itself', () => {
    const change = {
      routeId: 'r-poblacion-milagrosa',
      from: '2026-10-05',
      truckId: 't2',
      days: [1, 4] as (1 | 4)[],
      start: '07:00',
      windowEnd: '10:00',
      wasteType: 'mixed' as const,
    };
    const rows: ScheduleRow[] = [
      ...seedRows,
      {
        id: 7,
        route_id: change.routeId,
        truck_id: 't2',
        days: [4, 1],
        start_time: '07:00:00',
        window_end: '10:00:00',
        depart_at: '07:17:00',
        waste_type: 'mixed',
        expected_load: 0.85,
        valid_from: '2026-10-05',
      },
    ];
    expect(mapSchedules(rows)).toEqual(applyScheduleChange(ROUTE_SCHEDULES, change));
  });

  it('with two changes each record ends where the next one starts', () => {
    const later: ScheduleRow = { ...seedRows[0], id: 9, valid_from: '2026-11-02' };
    const sooner: ScheduleRow = { ...seedRows[0], id: 8, valid_from: '2026-10-12' };
    const lantic = mapSchedules([...seedRows, later, sooner]).filter(
      (s) => s.routeId === seedRows[0].route_id,
    );
    expect(lantic.map((s) => [s.validFrom, s.validUntil])).toEqual([
      [undefined, '2026-10-11'],
      ['2026-10-12', '2026-11-01'],
      ['2026-11-02', undefined],
    ]);
  });
});

describe('tickets', () => {
  const report: NewReport = {
    category: 'DUMPING',
    size: 'pile',
    photos: [
      { kind: 'sample', id: 'dumping' },
      { kind: 'sample', id: 'waterway' },
    ],
    location: [121.04384, 14.30479],
    accuracyM: 8,
    landmark: 'Tabi ng kanal',
    nearWaterway: true,
    nearSensitive: false,
    note: '',
    contact: null,
  };
  const id = 'KPH-2026-000201';

  const row = (
    over: Partial<TicketRow> = {},
    events: TicketEventRow[] = [],
    photos: TicketPhotoRow[] = [
      { event_id: null, slot: 'close', storage_path: null, sample_id: 'waterway' },
      { event_id: null, slot: 'wide', storage_path: null, sample_id: 'dumping' },
    ],
  ): TicketRow => ({
    id,
    category: 'DUMPING',
    size: 'pile',
    location: { coordinates: [121.04384, 14.30479] },
    accuracy_m: 8,
    barangay_id: 'milagrosa',
    landmark: 'Tabi ng kanal',
    near_waterway: true,
    near_sensitive: false,
    note: null,
    notify: false,
    created_at: iso(t0),
    status: 'submitted',
    dispatch_mode: null,
    dispatch_truck_id: null,
    dispatch_due: null,
    merged_into: null,
    rating: null,
    missed_route_id: null,
    missed_street_key: null,
    missed_day: null,
    missed_basis: null,
    is_sample: false,
    source: 'resident',
    ticket_events: events,
    ticket_photos: photos,
    ...over,
  });
  const ev = (
    n: number,
    kind: TicketEventRow['kind'],
    hours: number,
    over: Partial<TicketEventRow> = {},
  ): TicketEventRow => ({
    id: n,
    kind,
    at: iso(t0 + hours * HOUR),
    actor: 'enro',
    truck_id: null,
    note: null,
    client_event_id: null,
    ...over,
  });
  /** What the timeline says, without the ids (those differ by design). */
  const story = (t: Ticket) => t.history.map((h) => [h.kind, h.status, h.at, h.by, h.note]);

  it('a new report maps to the ticket the app itself would create', () => {
    const mine = newTicket(id, report, { at: t0, barangayId: 'milagrosa' });
    expect(mapTicket(row(), ROUTES)).toEqual(mine);
  });

  it('rebuilds the whole timeline: dispatch (which verifies), start, collect, rate', () => {
    // The same story through the app's own lifecycle…
    let mine = newTicket(id, report, { at: t0, barangayId: 'milagrosa' });
    const step = (
      action: Parameters<typeof applyAction>[1],
      hours: number,
      by: 'enro' | 'driver' | 'resident',
    ) => {
      mine = applyAction(mine, action, { at: t0 + hours * HOUR, by, eventId: `e${hours}` });
    };
    const due = t0 + 6 * HOUR;
    step({ type: 'dispatch', mode: 'special_pickup', truckId: 't2', due }, 1, 'enro');
    step({ type: 'start' }, 2, 'driver');
    step(
      {
        type: 'collect',
        before: { kind: 'sample', id: 'dumping' },
        after: { kind: 'remote', path: 'u/p.jpg' },
      },
      3,
      'driver',
    );
    step({ type: 'rate', stars: 4 }, 4, 'resident');

    // …and as the database stores it: one row per action, the details on the ticket.
    const mapped = mapTicket(
      row(
        {
          status: 'closed',
          dispatch_mode: 'special_pickup',
          dispatch_truck_id: 't2',
          dispatch_due: iso(due),
          rating: 4,
        },
        [
          ev(13, 'collected', 3, { actor: 'driver', truck_id: 't2', client_event_id: 't2|task|b' }),
          ev(11, 'dispatched', 1),
          ev(14, 'rated', 4, { actor: 'resident' }),
          ev(12, 'started', 2, { actor: 'driver', truck_id: 't2', client_event_id: 't2|task|a' }),
        ],
        [
          { event_id: null, slot: 'wide', storage_path: null, sample_id: 'dumping' },
          { event_id: null, slot: 'close', storage_path: null, sample_id: 'waterway' },
          { event_id: 13, slot: 'before', storage_path: null, sample_id: 'dumping' },
          { event_id: 13, slot: 'after', storage_path: 'u/p.jpg', sample_id: null },
        ],
      ),
      ROUTES,
    );

    expect(story(mapped)).toEqual(story(mine));
    expect(mapped.history.map((h) => h.kind)).toEqual([
      'submitted',
      'verified',
      'dispatched',
      'started',
      'collected',
      'rated',
    ]);
    const { history: _a, ...rest } = mapped;
    const { history: _b, ...want } = mine;
    expect(rest).toEqual(want);
    // A crew's action keeps the id the phone gave it, so the phone recognises its own report.
    expect(mapped.history[3].id).toBe('t2|task|a');
  });

  it('a collected ticket closes on its own after 48 hours, exactly as on the sample data', () => {
    const collected = row(
      { status: 'collected', dispatch_mode: 'add_to_route', dispatch_truck_id: 't3' },
      [ev(1, 'dispatched', 1), ev(2, 'collected', 2, { actor: 'driver', truck_id: 't3' })],
      [{ event_id: 2, slot: 'after', storage_path: null, sample_id: 'clean' }],
    );
    const mapped = mapTicket(collected, ROUTES);
    expect(mapped.status).toBe('collected');
    expect(mapped.proof).toEqual({
      before: null,
      after: { kind: 'sample', id: 'clean' },
      by: 'driver',
    });
    expect(withAutoClose(mapped, t0 + 49 * HOUR).status).toBe('collected');
    expect(withAutoClose(mapped, t0 + 51 * HOUR).status).toBe('closed');
  });

  it('a rating after the window shows the automatic close before it', () => {
    const mapped = mapTicket(
      row(
        { status: 'closed', rating: 5, dispatch_mode: 'add_to_route' },
        [
          ev(1, 'dispatched', 1),
          ev(2, 'collected', 2),
          ev(3, 'rated', 2 + 60, { actor: 'resident' }),
        ],
        [{ event_id: 2, slot: 'after', storage_path: null, sample_id: 'clean' }],
      ),
      ROUTES,
    );
    const closed = mapped.history.find((h) => h.kind === 'closed');
    expect(closed).toMatchObject({ by: 'system', at: t0 + 2 * HOUR + REOPEN_WINDOW_MS + 1 });
    expect(mapped.history.map((h) => h.kind).slice(-2)).toEqual(['closed', 'rated']);
    expect(mapped.rating).toBe(5);
  });

  it('reopen keeps the dispatch and the latest proof wins', () => {
    const mapped = mapTicket(
      row(
        { status: 'collected', dispatch_mode: 'special_pickup', dispatch_truck_id: 't2' },
        [
          ev(1, 'dispatched', 1),
          ev(2, 'collected', 2),
          ev(3, 'reopened', 3, { actor: 'resident', note: 'May naiwan pa' }),
          ev(4, 'collected', 5),
        ],
        [
          { event_id: 2, slot: 'after', storage_path: 'u/first.jpg', sample_id: null },
          { event_id: 4, slot: 'after', storage_path: 'u/second.jpg', sample_id: null },
        ],
      ),
      ROUTES,
    );
    expect(mapped.history.map((h) => h.status).slice(-3)).toEqual([
      'collected',
      'scheduled',
      'collected',
    ]);
    expect(mapped.history.find((h) => h.kind === 'reopened')?.note).toBe('May naiwan pa');
    expect(mapped.proof?.after).toEqual({ kind: 'remote', path: 'u/second.jpg' });
    expect(mapped.dispatch).toEqual({ mode: 'special_pickup', truckId: 't2', due: null });
    expect(mapped.photos).toEqual([]);
  });

  it('a rejection carries its reason; an education notice closes with its note', () => {
    const rejected = mapTicket(
      row({ status: 'rejected' }, [ev(1, 'rejected', 1, { note: 'Walang basura sa larawan.' })]),
      ROUTES,
    );
    expect(rejected.rejectReason).toBe('Walang basura sa larawan.');
    expect(rejected.history[1]).toMatchObject({ kind: 'rejected', status: 'rejected' });
    const educated = mapTicket(
      row({ status: 'closed' }, [ev(1, 'verified', 1), ev(2, 'education', 2, { note: 'Paalala' })]),
      ROUTES,
    );
    expect(educated.history.map((h) => [h.kind, h.status, h.note]).slice(1)).toEqual([
      ['verified', 'verified', null],
      ['education', 'closed', 'Paalala'],
    ]);
  });

  it('a merge shows on both tickets, though it is stored once', () => {
    const keep = row({ id: 'KPH-2026-000300', status: 'verified' }, [ev(1, 'verified', 1)]);
    const dup = row({ id: 'KPH-2026-000301', status: 'merged', merged_into: 'KPH-2026-000300' }, [
      ev(2, 'merged', 2),
    ]);
    const { tickets } = mapTickets([dup, keep], ROUTES);
    const [a, b] = ['KPH-2026-000300', 'KPH-2026-000301'].map((x) =>
      tickets.find((t) => t.id === x)!,
    );
    expect(b.mergedInto).toBe(a.id);
    expect(b.history[1]).toMatchObject({ kind: 'merged', status: 'merged', note: a.id });
    expect(a.history[2]).toMatchObject({
      id: `${a.id}|merged-from|${b.id}`,
      kind: 'merged',
      status: 'verified',
      note: b.id,
    });
    expect(a.status).toBe('verified');
  });

  it('a missed-collection ticket names its street and says why it was filed', () => {
    const route = ROUTES.find((r) => r.id === 'r-mabuhay')!;
    const street = driverStreets(route).find((s) => s.name)!;
    const mapped = mapTicket(
      row(
        {
          category: 'MISSED',
          size: 'bags',
          landmark: null,
          source: 'claim',
          barangay_id: 'mabuhay',
          missed_route_id: route.id,
          missed_street_key: street.key,
          missed_day: '2026-10-02',
          missed_basis: 'truck_full',
          status: 'verified',
        },
        [ev(1, 'verified', 0, { actor: 'system' })],
        [],
      ),
      ROUTES,
    );
    expect(mapped.missed).toEqual({
      routeId: route.id,
      streetKey: street.key,
      streetName: street.name,
      day: '2026-10-02',
    });
    expect(mapped.landmark).toBe(street.name);
    expect(mapped.note).toBe('truck_full');
    expect(mapped.history[1]).toMatchObject({ kind: 'verified', by: 'system' });
  });

  it('newest first, and crew work on real tickets becomes task events (samples do not)', () => {
    const older = row({ id: 'KPH-2026-000401', created_at: iso(t0 - HOUR) });
    const real = row(
      { id: 'KPH-2026-000402', status: 'collected', dispatch_mode: 'special_pickup' },
      [
        ev(1, 'dispatched', 1),
        ev(2, 'started', 2, { actor: 'driver', truck_id: 't4', client_event_id: 't4|task|s1' }),
        ev(3, 'collected', 3, { actor: 'driver', truck_id: 't4', client_event_id: 't4|task|d1' }),
      ],
      [{ event_id: 3, slot: 'after', storage_path: 'u/after.jpg', sample_id: null }],
    );
    const sample = { ...real, id: 'KPH-2026-000101', is_sample: true };
    const { tickets, tasks } = mapTickets([older, real, sample], ROUTES);
    expect(tickets.map((t) => t.id)).toEqual([
      'KPH-2026-000402',
      'KPH-2026-000101',
      'KPH-2026-000401',
    ]);
    expect(tasks).toEqual([
      {
        id: 't4|task|s1',
        truckId: 't4',
        at: t0 + 2 * HOUR,
        source: 'driver',
        kind: 'task',
        ticketId: 'KPH-2026-000402',
        action: 'start',
        before: null,
        after: null,
      },
      {
        id: 't4|task|d1',
        truckId: 't4',
        at: t0 + 3 * HOUR,
        source: 'driver',
        kind: 'task',
        ticketId: 'KPH-2026-000402',
        action: 'done',
        before: null,
        after: { kind: 'remote', path: 'u/after.jpg' },
      },
    ]);
  });
});

describe('truck events', () => {
  const route = ROUTES.find((r) => r.id === 'r-mabuhay')!;
  const street = driverStreets(route)[0];
  const shift = mapShift({
    id: 'shift|t3|abc|x1',
    truck_id: 't3',
    route_id: route.id,
    crew: 3,
    gps_source: 'phone',
    started_at: iso(t0),
    ended_at: iso(t0 + 3 * HOUR),
  });
  const rows: EventRow[] = [
    {
      seq: 5,
      id: 't3|status|1',
      truck_id: 't3',
      shift_id: shift.id,
      at: t0 + 60_000,
      kind: 'status',
      status: 'on_route',
    },
    {
      seq: 6,
      id: 't3|load|1',
      truck_id: 't3',
      shift_id: shift.id,
      at: t0 + 120_000,
      kind: 'load',
      load: 0.5,
    },
    {
      seq: 7,
      id: 't3|street|1',
      truck_id: 't3',
      shift_id: shift.id,
      at: t0 + 180_000,
      kind: 'street',
      street_key: street.key,
      street_outcome: 'skipped',
      skip_reason: 'road_blocked',
    },
    {
      seq: 8,
      id: 'demo-breakdown|t2|1',
      truck_id: 't2',
      at: t0 + 240_000,
      kind: 'incident',
      incident: 'breakdown',
      incident_minutes: 120,
    },
    {
      seq: 9,
      id: 't3|disposal|1',
      truck_id: 't3',
      shift_id: shift.id,
      at: t0 + 300_000,
      kind: 'disposal',
      disposal_action: 'arrive',
    },
    {
      seq: 10,
      id: 't3|incident_end|1',
      truck_id: 't3',
      shift_id: shift.id,
      at: t0 + 360_000,
      kind: 'incident_end',
    },
  ];

  it('a shift becomes the start and end events the simulator expects, with shared ids', () => {
    const events = buildTruckEvents([], [shift], ROUTES, []);
    expect(events).toEqual([
      {
        id: shiftStartId(shift.id),
        truckId: 't3',
        at: t0,
        source: 'driver',
        shiftId: shift.id,
        kind: 'shift_start',
        routeId: route.id,
        crew: 3,
      },
      {
        id: shiftEndId(shift.id),
        truckId: 't3',
        at: t0 + 3 * HOUR,
        source: 'driver',
        shiftId: shift.id,
        kind: 'shift_end',
      },
    ]);
  });

  it('maps each kind, in time order, with the street taken from the shift route', () => {
    const events = buildTruckEvents(rows, [shift], ROUTES, []);
    expect(events.map((e) => e.kind)).toEqual([
      'shift_start',
      'status',
      'load',
      'street',
      'incident',
      'disposal',
      'incident_end',
      'shift_end',
    ]);
    expect(events.find((e) => e.kind === 'street')).toEqual({
      id: 't3|street|1',
      truckId: 't3',
      at: t0 + 180_000,
      source: 'driver',
      shiftId: shift.id,
      kind: 'street',
      routeId: route.id,
      streetKey: street.key,
      segmentIds: street.segmentIds,
      outcome: 'skipped',
      reason: 'road_blocked',
    });
    // A row with no shift is an incident from the demo controls.
    expect(events.find((e) => e.kind === 'incident')).toEqual({
      id: 'demo-breakdown|t2|1',
      truckId: 't2',
      at: t0 + 240_000,
      source: 'demo',
      kind: 'incident',
      incident: 'breakdown',
      minutes: 120,
    });
  });

  it('waits with a street tap until its shift is known', () => {
    expect(buildTruckEvents(rows, [], ROUTES, []).some((e) => e.kind === 'street')).toBe(false);
  });
});

describe('the driver queue as driver_upload takes it', () => {
  const base = { truckId: 't3', at: t0 + 0.4, source: 'driver' as const, shiftId: 'shift|t3|a|b' };
  const sent = (e: TruckEvent, photos?: Parameters<typeof toUploadEvent>[2]) =>
    toUploadEvent(e, null, photos);

  it('names the shift on every event and rounds the time', () => {
    expect(
      sent({
        ...base,
        id: 'shift|t3|a|b|start',
        kind: 'shift_start',
        routeId: 'r-mabuhay',
        crew: 3,
      }),
    ).toEqual({
      id: 'shift|t3|a|b|start',
      kind: 'shift_start',
      at: t0,
      shift_id: 'shift|t3|a|b',
      route_id: 'r-mabuhay',
      crew: 3,
    });
    expect(sent({ ...base, id: 'e1', kind: 'status', status: 'full' })).toMatchObject({
      shift_id: 'shift|t3|a|b',
      status: 'full',
    });
    expect(sent({ ...base, id: 'e2', kind: 'load', load: 0.75 })).toMatchObject({ load: 0.75 });
    expect(sent({ ...base, id: 'e3', kind: 'disposal', action: 'leave' })).toMatchObject({
      action: 'leave',
    });
    expect(
      sent({ ...base, id: 'e4', kind: 'incident', incident: 'flood', minutes: 60 }),
    ).toMatchObject({
      incident: 'flood',
      minutes: 60,
    });
    expect(
      sent({
        ...base,
        id: 'e5',
        kind: 'street',
        routeId: 'r-mabuhay',
        streetKey: 'mabuhay|Rizal Street',
        segmentIds: ['s1'],
        outcome: 'skipped',
        reason: 'truck_full',
      }),
    ).toEqual({
      id: 'e5',
      kind: 'street',
      at: t0,
      shift_id: 'shift|t3|a|b',
      street_key: 'mabuhay|Rizal Street',
      outcome: 'skipped',
      reason: 'truck_full',
    });
  });

  it('a pickup report names its ticket and its uploaded photos', () => {
    const task: TruckEvent = {
      ...base,
      id: 'e6',
      kind: 'task',
      ticketId: 'KPH-2026-000113',
      action: 'done',
      before: { kind: 'uri', uri: 'file:///b.jpg' },
      after: { kind: 'uri', uri: 'file:///a.jpg' },
    };
    expect(sent(task, { before: { sample: 'dumping' }, after: { path: 'u/a.jpg' } })).toEqual({
      id: 'e6',
      kind: 'task',
      at: t0,
      shift_id: 'shift|t3|a|b',
      ticket_id: 'KPH-2026-000113',
      action: 'done',
      before: { sample: 'dumping' },
      after: { path: 'u/a.jpg' },
    });
  });

  it('an older queued event without a shift takes the one being uploaded', () => {
    const { shiftId: _none, ...old } = { ...base, id: 'e7', kind: 'incident_end' as const };
    expect(toUploadEvent(old, 'shift|t3|a|b')).toMatchObject({ shift_id: 'shift|t3|a|b' });
  });
});

describe('city settings and GPS', () => {
  it('announcements, lead time, contacts, decisions and staff', () => {
    expect(
      mapAnnouncement({
        id: 4,
        body: 'Paalala po.',
        sent_at: iso(t0),
        recipient_count: 12,
        announcement_barangays: [{ barangay_id: 'milagrosa' }, { barangay_id: 'bancal' }],
      }),
    ).toEqual({
      id: 'announcement|4',
      barangayIds: ['bancal', 'milagrosa'],
      text: 'Paalala po.',
      sentAt: t0,
      recipients: 12,
    });
    expect(
      mapLeadChanges([
        { effective_at: iso(t0 + HOUR), minutes: 20 },
        { effective_at: iso(t0), minutes: 10 },
      ]),
    ).toEqual([
      { at: t0, minutes: 10 },
      { at: t0 + HOUR, minutes: 20 },
    ]);
    expect(
      mapContacts([
        { barangay_id: null, phone: '(046) 000 0000', hours: null },
        { barangay_id: 'milagrosa', phone: null, hours: 'Lunes-Biyernes' },
      ]),
    ).toEqual({
      enro: { phone: '(046) 000 0000', hours: null },
      barangays: { milagrosa: { phone: null, hours: 'Lunes-Biyernes' } },
    });
    // The key is the app's own suggestion id (features/load/backup.ts).
    expect(
      mapDecisions([
        {
          service_day: '2026-10-02',
          route_id: 'r-mabuhay',
          decision: 'dismissed',
          decided_at: iso(t0),
        },
      ]),
    ).toEqual({ 'backup|2026-10-02|r-mabuhay': { decision: 'dismissed', at: t0 } });
    expect(
      mapStaff({
        user_id: 'u1',
        name: 'Dispatcher',
        role: 'dispatcher',
        barangay_id: null,
        active: true,
      }),
    ).toEqual({ id: 'u1', name: 'Dispatcher', role: 'dispatcher', barangayId: null, active: true });
  });

  it('unpacks GPS uploads back into fixes, in order', () => {
    expect(
      unpackGps([
        {
          from_index: 2,
          t0: iso(t0 + 10_000),
          dt_ms: [0],
          lng_e6: [121050300],
          lat_e6: [14310000],
          acc_m: [null],
        },
        {
          from_index: 0,
          t0: iso(t0),
          dt_ms: [0, 5000],
          lng_e6: [121050000, 121050100],
          lat_e6: [14310000, 14310050],
          acc_m: [8, 12],
        },
      ]),
    ).toEqual([
      { t: t0, lng: 121.05, lat: 14.31, acc: 8 },
      { t: t0 + 5000, lng: 121.0501, lat: 14.31005, acc: 12 },
      { t: t0 + 10_000, lng: 121.0503, lat: 14.31, acc: null },
    ]);
  });
});
