import { ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS } from '@/data/carmona';
import { homeStatus } from '@/features/resident/homeStatus';
import { routeRunsOnDay } from '@/features/schedule/collections';
import {
  collectionsForBarangay,
  nextCollectionAfterToday,
  todaysCollection,
} from '@/features/schedule/collections';
import {
  applyScheduleChange,
  scheduleConflicts,
  scheduleOn,
  validateScheduleChange,
} from '@/features/schedule/editing';
import {
  byBarangay,
  coverageByDay,
  statsCsv,
  summarize,
  ticketsByCategory,
} from '@/features/stats/history';
import { DAY, manilaEpoch } from '@/lib/time';
import { createMockServices } from '@/services/mock';
import type {
  Announcement,
  CityConfig,
  OutboundAlert,
  RouteSchedule,
  ScheduleChange,
  StaffUser,
} from '@/services/types';
import { simulateFleet } from '@/simulator/truckSimulator';
import { TRUCKS } from '@/data/carmona';
import { sampleTickets } from '@/data/carmona/sampleTickets';

const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);
const MILAGROSA_ROUTE = 'r-poblacion-milagrosa';

const change = (over: Partial<ScheduleChange> = {}): ScheduleChange => ({
  routeId: MILAGROSA_ROUTE,
  from: '2026-10-05',
  truckId: 't2',
  days: [1, 4],
  start: '07:00',
  windowEnd: '10:00',
  wasteType: 'mixed',
  ...over,
});

/** Mock services on in-memory stand-ins for the server tables. */
function makeServices(start = tue(6)) {
  const clock = { t: start };
  const db = {
    schedules: null as RouteSchedule[] | null,
    leadChanges: [] as { at: number; minutes: number }[],
    contacts: { enro: { phone: null, hours: null }, barangays: {} } as CityConfig['contacts'],
    staff: [] as StaffUser[],
    announcements: [] as Announcement[],
  };
  const services = createMockServices({
    getSimTime: () => clock.t,
    getEvents: () => [],
    getAnnouncements: () => db.announcements,
    addAnnouncement: (a) => db.announcements.push(a),
    receiveUpload: () => {},
    getTraces: () => ({}),
    isOnline: () => true,
    getTickets: () => [],
    saveTicket: () => {},
    nextTicketSeq: () => 1,
    getSchedules: () => db.schedules ?? ROUTE_SCHEDULES,
    saveSchedules: (s) => (db.schedules = s),
    getLeadChanges: () => db.leadChanges,
    addLeadChange: (at, minutes) => db.leadChanges.push({ at, minutes }),
    getContacts: () => db.contacts,
    setContact: (target, info) => {
      if (target.kind === 'enro') db.contacts.enro = info;
      else db.contacts.barangays[target.barangayId] = info;
    },
    getStaff: () => db.staff,
    saveStaff: (u) => (db.staff = [...db.staff.filter((x) => x.id !== u.id), u]),
  });
  return { services, clock, db };
}

/** The alerts sent so far (subscribe emits once, synchronously). */
function alertsNow(services: ReturnType<typeof makeServices>['services']): OutboundAlert[] {
  let out: OutboundAlert[] = [];
  services.alerts.subscribeAlerts((a) => (out = a))();
  return out;
}

describe('schedule changes (City ENRO)', () => {
  it('start on a chosen day; past days keep the schedule they had', () => {
    const next = applyScheduleChange(ROUTE_SCHEDULES, change());
    const old = next.find((s) => s.routeId === MILAGROSA_ROUTE && s.validUntil)!;
    const fresh = next.find((s) => s.routeId === MILAGROSA_ROUTE && s.validFrom)!;
    expect(old.validUntil).toBe('2026-10-04');
    expect(fresh).toMatchObject({ validFrom: '2026-10-05', days: [1, 4], departAt: '07:17' });
    expect(routeRunsOnDay(old, tue(8), []).runs).toBe(true);
    expect(routeRunsOnDay(old, tue(8) + 7 * DAY, []).runs).toBe(false);
    expect(routeRunsOnDay(fresh, manilaEpoch(2026, 10, 5, 8), []).runs).toBe(true);
    expect(routeRunsOnDay(fresh, tue(8) + 7 * DAY, []).runs).toBe(false);
    // Other routes are untouched.
    expect(next.filter((s) => s.routeId !== MILAGROSA_ROUTE)).toEqual(
      ROUTE_SCHEDULES.filter((s) => s.routeId !== MILAGROSA_ROUTE),
    );
  });

  it('a later change ends the pending one; a change on the same day replaces it', () => {
    const one = applyScheduleChange(ROUTE_SCHEDULES, change());
    const two = applyScheduleChange(one, change({ from: '2026-10-08', days: [3] }));
    const mine = two.filter((s) => s.routeId === MILAGROSA_ROUTE);
    expect(mine.map((s) => [s.validFrom ?? null, s.validUntil ?? null])).toEqual([
      [null, '2026-10-04'],
      ['2026-10-05', '2026-10-07'],
      ['2026-10-08', null],
    ]);
    const same = applyScheduleChange(one, change({ days: [2, 5], start: '08:00' }));
    const sameMine = same.filter((s) => s.routeId === MILAGROSA_ROUTE);
    expect(sameMine).toHaveLength(2);
    expect(sameMine[1]).toMatchObject({ start: '08:00', validFrom: '2026-10-05' });
    // The late departure was tuned to 7:00, so it is dropped when the start changes.
    expect(sameMine[1].departAt).toBeUndefined();
    expect(scheduleOn(same, MILAGROSA_ROUTE, '2026-10-06')?.start).toBe('08:00');
  });

  it('rejects changes without days, with bad times, or starting today', () => {
    expect(validateScheduleChange(change(), tue(9))).toEqual([]);
    expect(validateScheduleChange(change({ days: [] }), tue(9))).toEqual(['no_days']);
    expect(validateScheduleChange(change({ start: '7am' }), tue(9))).toEqual(['bad_time']);
    expect(validateScheduleChange(change({ windowEnd: '06:00' }), tue(9))).toEqual([
      'end_before_start',
    ]);
    expect(validateScheduleChange(change({ from: '2026-09-29' }), tue(9))).toEqual(['too_soon']);
  });

  it('warns when a truck would run two routes at the same time', () => {
    // Truck 1 runs Lantic on Tuesdays 7–11; moving Bancal (also Truck 1) to Tuesday clashes.
    const bancal = change({ routeId: 'r-bancal', truckId: 't1', days: [2, 4] });
    expect(scheduleConflicts(ROUTE_SCHEDULES, bancal)).toEqual([
      { routeId: 'r-lantic', days: [2] },
    ]);
    // An afternoon run on the same day is fine.
    expect(
      scheduleConflicts(ROUTE_SCHEDULES, { ...bancal, start: '13:00', windowEnd: '15:00' }),
    ).toEqual([]);
  });

  it('are saved by the schedule service and reach every screen and Kolek', async () => {
    const { services, clock } = makeServices(tue(9));
    await expect(
      services.schedule.updateRouteSchedule(change({ from: '2026-09-29' })),
    ).rejects.toThrow('too_soon');
    const saved = await services.schedule.updateRouteSchedule(change());
    expect(await services.schedule.getRouteSchedules()).toBe(saved);
    // From next week Milagrosa is collected Monday and Thursday.
    const occ = collectionsForBarangay('milagrosa', saved, ROUTES, SCHEDULE_EXCEPTIONS, tue(9), 14);
    expect(occ.map((o) => new Date(o.day + 8 * 3600_000).getUTCDay())).toEqual([2, 5, 1, 4, 1]);
    // Kolek announces it.
    clock.t = tue(10);
    const reply = await services.kolek.reply(
      [{ id: 'q', from: 'resident', at: clock.t, text: 'may pagbabago ba sa iskedyul?' }],
      { barangayId: 'milagrosa', smsOn: false, myTicketIds: [] },
    );
    expect(reply.lines.map((l) => l.key)).toContain('kolek.a.scheduleChange');
  });
});

describe('SMS lead time (City ENRO setting)', () => {
  const milagrosaVicinity = (alerts: OutboundAlert[]) =>
    alerts.find((a) => a.kind === 'vicinity' && a.barangayIds[0] === 'milagrosa')!;

  it('sends the "ilabas na" SMS later with a shorter lead time', async () => {
    const base = makeServices(tue(6));
    base.clock.t = tue(9);
    const at15 = milagrosaVicinity(alertsNow(base.services));

    const short = makeServices(tue(6));
    await short.services.admin.setSmsLeadMinutes(10);
    short.clock.t = tue(9);
    const at10 = milagrosaVicinity(alertsNow(short.services));

    expect(at10.sentAt).toBeGreaterThan(at15.sentAt);
    expect(at10.etaAt! - at10.sentAt).toBeLessThanOrEqual(10 * 60_000);
    expect(at15.etaAt! - at15.sentAt).toBeGreaterThan(10 * 60_000);
  });

  it('never rewrites texts already sent', async () => {
    const before = makeServices(tue(9));
    const original = milagrosaVicinity(alertsNow(before.services));
    await before.services.admin.setSmsLeadMinutes(30);
    expect(milagrosaVicinity(alertsNow(before.services)).sentAt).toBe(original.sentAt);
  });

  it('only accepts 5 to 30 minutes', async () => {
    const { services } = makeServices();
    await expect(services.admin.setSmsLeadMinutes(45)).rejects.toThrow();
    await expect(services.admin.setSmsLeadMinutes(4)).rejects.toThrow();
  });

  it('moves the Home "ilabas na" moment with it', () => {
    const now = tue(7, 28);
    const occ = collectionsForBarangay(
      'milagrosa',
      ROUTE_SCHEDULES,
      ROUTES,
      SCHEDULE_EXCEPTIONS,
      now,
      14,
    );
    const today = todaysCollection(occ, now)!;
    const states = simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, now, SCHEDULE_EXCEPTIONS, []);
    const input = {
      barangayId: 'milagrosa',
      now,
      today,
      nextAfterToday: nextCollectionAfterToday(occ, now),
      truck: states.find((s) => s.truckId === today.truckId),
      route: ROUTES.find((r) => r.id === today.routeId),
    };
    expect(homeStatus(input).kind).toBe('bring_out');
    expect(homeStatus({ ...input, leadMinutes: 5 }).kind).toBe('approaching');
  });
});

describe('contacts and staff (City ENRO settings)', () => {
  it('saves trimmed contacts that Kolek then gives residents', async () => {
    const { services } = makeServices(tue(9));
    await services.admin.setContact(
      { kind: 'barangay', barangayId: 'milagrosa' },
      { phone: '  (046) 555 0100 ', hours: '   ' },
    );
    let config: CityConfig | null = null;
    services.admin.subscribeConfig((c) => (config = c))();
    expect(config!.contacts.barangays.milagrosa).toEqual({ phone: '(046) 555 0100', hours: null });
    const reply = await services.kolek.reply(
      [{ id: 'q', from: 'resident', at: tue(9), text: 'sino ang mayor?' }],
      { barangayId: 'milagrosa', smsOn: false, myTicketIds: [] },
    );
    expect(reply.lines[1]).toMatchObject({
      key: 'kolek.a.contactBarangay',
      values: { phone: { kind: 'text', value: '(046) 555 0100' } },
    });
  });

  it('adds and updates staff accounts', async () => {
    const { services, db } = makeServices();
    const user: StaffUser = {
      id: 'u1',
      name: ' Dispatcher 3 ',
      role: 'dispatcher',
      barangayId: null,
      active: true,
    };
    await services.admin.saveStaff(user);
    await services.admin.saveStaff({ ...user, name: 'Dispatcher 3', active: false });
    expect(db.staff).toEqual([{ ...user, name: 'Dispatcher 3', active: false }]);
    await expect(services.admin.saveStaff({ ...user, name: '  ' })).rejects.toThrow();
  });
});

describe('statistics', () => {
  it('replays a collection day per barangay: tonnes, coverage, on time, SMS before the truck', async () => {
    const { services } = makeServices(tue(18));
    const stats = await services.stats.getDailyStats(tue(0), tue(0));
    expect(stats.runs.map((r) => r.routeId).sort()).toEqual(
      ['r-lantic', 'r-mabuhay', 'r-poblacion-maduya', 'r-poblacion-milagrosa'].sort(),
    );
    // The tonnes of a run are split over its barangays.
    const milagrosaRun = stats.runs.find((r) => r.routeId === MILAGROSA_ROUTE)!;
    const split = stats.barangays
      .filter((b) => b.routeId === MILAGROSA_ROUTE)
      .reduce((s, b) => s + b.tonnes, 0);
    expect(split).toBeCloseTo(milagrosaRun.tonnes, 0);
    // Truck 3 fills up in Mabuhay: streets left unserved, not on time.
    const mabuhay = stats.barangays.find((b) => b.barangayId === 'mabuhay')!;
    expect(mabuhay.servedM).toBeLessThan(mabuhay.collectM);
    expect(mabuhay.finishedAt).toBeNull();
    // Milagrosa got its text before the truck.
    const milagrosa = stats.barangays.find((b) => b.barangayId === 'milagrosa')!;
    expect(milagrosa.smsAt).not.toBeNull();
    expect(milagrosa.smsAt!).toBeLessThanOrEqual(milagrosa.arrivedAt!);

    const summary = summarize(stats, tue(18));
    expect(summary.servedRate).toBeGreaterThan(0.5);
    expect(summary.servedRate).toBeLessThan(1);
    expect(summary.onTimeRate).toBeLessThan(1);
    expect(summary.smsBeforeRate).toBe(1);
    expect(byBarangay(stats, tue(18))[0].tonnes).toBeGreaterThan(0);
    expect(coverageByDay(stats)).toHaveLength(1);
  });

  it('feeds Kolek the month-to-date figures for a barangay (pitch slide 13)', async () => {
    const { services } = makeServices(tue(18));
    const reply = await services.kolek.reply(
      [
        {
          id: 'q',
          from: 'resident',
          at: tue(18),
          text: 'Ilang tons na ang nakolekta sa Milagrosa ngayong buwan?',
        },
      ],
      { barangayId: 'mabuhay', smsOn: false, myTicketIds: [] },
    );
    const from = manilaEpoch(2026, 9, 1);
    const stats = await services.stats.getDailyStats(from, tue(0));
    const milagrosa = byBarangay(stats, tue(18)).find((b) => b.barangayId === 'milagrosa')!;
    expect(reply.lines[0]).toEqual({
      key: 'kolek.a.statsBarangay',
      values: {
        barangay: { kind: 'barangay', id: 'milagrosa' },
        from: { kind: 'date', at: from },
        tonnes: { kind: 'number', value: milagrosa.tonnes },
        served: { kind: 'percent', value: milagrosa.servedRate },
      },
    });
    expect(reply.lines.map((l) => l.key)).toEqual([
      'kolek.a.statsBarangay',
      'kolek.a.statsOnTime',
      'kolek.a.sampleNote',
    ]);
  });

  it('does not count streets the truck has not reached yet as unserved', async () => {
    // 7:25 AM: Truck 2 is still in the Poblacion; Milagrosa is next.
    const { services } = makeServices(tue(7, 25));
    const stats = await services.stats.getDailyStats(tue(0), tue(0));
    const milagrosa = stats.barangays.find((b) => b.barangayId === 'milagrosa')!;
    expect(milagrosa).toMatchObject({ collectM: 0, servedM: 0, finishedAt: null });
    expect(summarize(stats, tue(7, 25)).servedRate).toBe(1);
  });

  it('only counts what has happened so far today', async () => {
    const { services } = makeServices(tue(6));
    const stats = await services.stats.getDailyStats(tue(0), tue(0) + 3 * DAY);
    expect(stats.runs).toEqual([]);
  });

  it('exports one CSV row per barangay collection, marked as sample data', async () => {
    const { services } = makeServices(tue(18));
    const stats = await services.stats.getDailyStats(tue(0), tue(0));
    const csv = statsCsv(stats, tue(18), { barangay: (id) => id, truck: (id) => id });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toMatch(/^date,barangay,route,truck,planned_m,served_m/);
    expect(lines).toHaveLength(stats.barangays.length + 1);
    expect(
      lines.every((l, i) => i === 0 || (l.startsWith('2026-09-29,') && l.endsWith(',yes'))),
    ).toBe(true);
  });

  it('counts reports by type in the range', () => {
    const now = tue(12);
    const tickets = sampleTickets(now);
    const rows = ticketsByCategory(tickets, now - 30 * DAY, now);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(tickets.length);
    expect(rows.every((r) => r.open <= r.total)).toBe(true);
  });
});

describe('decisions on backup-truck suggestions', () => {
  it('go through the service and come back with the live picture', async () => {
    const decisions: Record<string, { decision: 'dispatched' | 'dismissed'; at: number }> = {};
    const clock = { t: tue(8) };
    const services = createMockServices({
      getSimTime: () => clock.t,
      getEvents: () => [],
      getAnnouncements: () => [],
      addAnnouncement: () => {},
      receiveUpload: () => {},
      getTraces: () => ({}),
      isOnline: () => true,
      getTickets: () => [],
      saveTicket: () => {},
      nextTicketSeq: () => 1,
      getSchedules: () => ROUTE_SCHEDULES,
      saveSchedules: () => {},
      getLeadChanges: () => [],
      addLeadChange: () => {},
      getContacts: () => ({ enro: { phone: null, hours: null }, barangays: {} }),
      setContact: () => {},
      getStaff: () => [],
      saveStaff: () => {},
      getDecisions: () => decisions,
      saveDecision: (id, decision, at) => (decisions[id] = { decision, at }),
    });
    const suggestion = {
      id: 'backup|2026-09-29|r-mabuhay',
      fullTruckId: 't3',
      routeId: 'r-mabuhay',
      barangayId: 'mabuhay',
      streetsLeft: 3,
      candidateTruckId: 't1',
      candidateLoad: 0.4,
      distanceM: 900,
    };
    await services.ops.decideSuggestion(suggestion, 'dispatched');
    let snapshot: { decisions: typeof decisions } | null = null;
    services.ops.subscribeOps((s) => (snapshot = s))();
    expect(snapshot!.decisions).toEqual({
      'backup|2026-09-29|r-mabuhay': { decision: 'dispatched', at: tue(8) },
    });
  });

  it('on the sample data the dashboard opens as a sample admin, without a login', () => {
    const { services } = makeServices();
    let state: unknown = null;
    services.auth.subscribe((s) => (state = s))();
    expect(services.auth.required).toBe(false);
    expect(state).toMatchObject({ status: 'signed_in', staff: { role: 'admin' } });
  });
});
