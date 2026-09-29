import {
  ROUTE_SCHEDULES,
  ROUTES,
  SCHEDULE_EXCEPTIONS,
  TRUCK_CAPACITY_TONNES,
  TRUCKS,
} from '@/data/carmona';
import {
  buildTraceIndex,
  coveredShare,
  isNearTrace,
  missedStreets,
} from '@/features/coverage/coverage';
import { countStreets, loadNeeded, suggestBackups } from '@/features/load/backup';
import { weeklyStats } from '@/features/stats/weekly';
import { manilaEpoch } from '@/lib/time';
import type { LngLat, Route } from '@/services/types';
import { simulatedTrace, simulateFleet, simulateTruck } from '@/simulator/truckSimulator';

const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);
const route = (id: string) => ROUTES.find((r) => r.id === id) as Route;
const truck = (id: string) => TRUCKS.find((t) => t.id === id)!;
const sim = (id: string, at: number) =>
  simulateTruck(truck(id), ROUTE_SCHEDULES, ROUTES, at, SCHEDULE_EXCEPTIONS);

describe('GPS coverage check (60% within 30 m)', () => {
  const street: LngLat[] = [
    [121.05, 14.3],
    [121.052, 14.3],
  ]; // ≈ 215 m east-west

  it('treats points within 30 m as near, and farther ones as not', () => {
    const index = buildTraceIndex([[121.051, 14.3]]);
    expect(isNearTrace(index, [121.051, 14.30018])).toBe(true); // ≈ 20 m north
    expect(isNearTrace(index, [121.051, 14.30045])).toBe(false); // ≈ 50 m north
  });

  it('counts a street as served when a GPS trace with normal error runs along it', () => {
    // Trace 15 m off the street (typical phone GPS error), one point every ~10 m.
    const trace: LngLat[] = Array.from({ length: 23 }, (_, i) => [121.05 + i * 0.0001, 14.30014]);
    expect(coveredShare(street, buildTraceIndex(trace))).toBeGreaterThan(0.95);
  });

  it('does not count a street the truck only touched at one end', () => {
    const trace: LngLat[] = [
      [121.05, 14.3],
      [121.0502, 14.3],
    ];
    expect(coveredShare(street, buildTraceIndex(trace))).toBeLessThan(0.6);
  });

  it('finds no missed streets for a finished route with a full GPS trace', () => {
    const s = sim('t4', tue(13));
    const r = route('r-poblacion-maduya');
    expect(s.status).toBe('done');
    const missed = missedStreets({
      route: r,
      truck: s,
      trace: simulatedTrace(r, s.progressM),
      windowEnd: tue(10, 30),
      now: tue(13),
    });
    expect(missed).toEqual([]);
  });

  it('flags the streets a full truck can no longer reach (Mabuhay, same day)', () => {
    const s = sim('t3', tue(8, 30));
    const r = route('r-mabuhay');
    expect(s.status).toBe('full');
    const missed = missedStreets({
      route: r,
      truck: s,
      trace: simulatedTrace(r, s.progressM),
      windowEnd: tue(10),
      now: tue(8, 30),
    });
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((m) => m.reason === 'truck_full' && m.barangayId === 'mabuhay')).toBe(true);
    expect(countStreets(missed)).toBe(3); // pitch slide 14: "full with 3 streets left"
    // A short unnamed connector is folded into its street: one row per street.
    expect(missed).toHaveLength(3);
  });

  it('flags a street the GPS trace skipped once the truck has passed it', () => {
    const s = sim('t4', tue(13));
    const r = route('r-poblacion-maduya');
    const skipped = r.segments.find((seg) => seg.collect && seg.lengthM > 150 && seg.name)!;
    // Remove every trace point near the skipped street (as if the truck detoured around it).
    const skippedIndex = buildTraceIndex(skipped.coordinates);
    const trace = simulatedTrace(r, s.progressM).filter((p) => !isNearTrace(skippedIndex, p, 45));
    const missed = missedStreets({
      route: r,
      truck: s,
      trace,
      windowEnd: tue(10, 30),
      now: tue(13),
    });
    expect(missed.some((m) => m.segmentIds.includes(skipped.id) && m.reason === 'not_passed')).toBe(
      true,
    );
  });
});

describe('backup truck suggestion', () => {
  /** Fleet + missed streets at a moment, the way the ops service computes them. */
  const opsAt = (at: number) => {
    const states = simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, at, SCHEDULE_EXCEPTIONS);
    const missed = states.flatMap((s) => {
      const r = ROUTES.find((x) => x.id === s.routeId);
      const sched = ROUTE_SCHEDULES.find((x) => x.routeId === s.routeId);
      if (!r || !sched || s.status === 'off_duty' || s.status === 'not_started') return [];
      const [h, m] = sched.windowEnd.split(':').map(Number);
      return missedStreets({
        route: r,
        truck: s,
        trace: simulatedTrace(r, s.progressM),
        windowEnd: tue(h, m),
        now: at,
      });
    });
    return { states, missed };
  };

  it('suggests the nearest truck with room when Truck 3 fills up in Mabuhay', () => {
    const at = tue(8, 0);
    const { states, missed } = opsAt(at);
    const [s] = suggestBackups(states, ROUTES, ROUTE_SCHEDULES, at, missed);
    expect(s).toMatchObject({ fullTruckId: 't3', barangayId: 'mabuhay', streetsLeft: 3 });
    expect(s.candidateTruckId).not.toBe('t3');
    // The candidate has room for the leftover streets.
    const left = missed.filter((m) => m.routeId === 'r-mabuhay');
    const needed = loadNeeded(
      route('r-mabuhay'),
      ROUTE_SCHEDULES.find((x) => x.routeId === 'r-mabuhay')!,
      left,
    );
    expect(s.candidateLoad + needed).toBeLessThanOrEqual(1);
    expect(s.distanceM).toBeGreaterThan(0);
  });

  it('at 7:55 AM (demo "puno ang Truck 3") a truck with room is suggested', () => {
    const at = tue(7, 55);
    const { states, missed } = opsAt(at);
    expect(suggestBackups(states, ROUTES, ROUTE_SCHEDULES, at, missed)).toHaveLength(1);
  });

  it('says honestly when no truck has room left (8:30 AM: everyone is over half full)', () => {
    const at = tue(8, 30);
    const { states, missed } = opsAt(at);
    expect(suggestBackups(states, ROUTES, ROUTE_SCHEDULES, at, missed)).toEqual([]);
  });

  it('makes no suggestion while no truck is full', () => {
    const at = tue(7, 30);
    const { states, missed } = opsAt(at);
    expect(suggestBackups(states, ROUTES, ROUTE_SCHEDULES, at, missed)).toEqual([]);
  });
});

describe('weekly stats (sample)', () => {
  const input = {
    trucks: TRUCKS,
    schedules: ROUTE_SCHEDULES,
    routes: ROUTES,
    exceptions: SCHEDULE_EXCEPTIONS,
    events: [],
    capacityTonnes: TRUCK_CAPACITY_TONNES,
  };

  it('counts Monday and Tuesday runs by Tuesday evening', () => {
    const w = weeklyStats(input, tue(18));
    expect(w.trips).toBe(6); // Mon: Bancal, Cabilang Baybay · Tue: 4 routes
    expect(w.tonnes).toBeGreaterThan(20);
    // Mabuhay could not be finished (truck full), so less than 100% was served.
    expect(w.servedRate).toBeLessThan(1);
    expect(w.servedRate).toBeGreaterThan(0.85);
  });

  it('is zero before the first run of the week', () => {
    expect(weeklyStats(input, manilaEpoch(2026, 9, 28, 6, 0))).toEqual({
      tonnes: 0,
      trips: 0,
      servedRate: 1,
    });
  });
});
