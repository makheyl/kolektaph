import { ROUTE_SCHEDULES, ROUTES, TRUCKS } from '@/data/carmona';
import { manilaEpoch } from '@/lib/time';
import type { Truck } from '@/services/types';
import { getTimeline, simulateFleet, simulateTruck } from '@/simulator/truckSimulator';

const truck = (id: string) => TRUCKS.find((t) => t.id === id) as Truck;
// 2026-09-29 is a Tuesday (Tue/Fri routes run); 2026-09-30 is a Wednesday (no routes).
const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);
const sim = (id: string, at: number) => simulateTruck(truck(id), ROUTE_SCHEDULES, ROUTES, at);

describe('deterministic truck simulator', () => {
  it('waits at the depot before the shift starts', () => {
    const s = sim('t2', tue(6, 30));
    const route = ROUTES.find((r) => r.id === 'r-poblacion-milagrosa')!;
    expect(s.status).toBe('not_started');
    expect(s.routeId).toBe('r-poblacion-milagrosa');
    expect(s.position).toEqual(route.segments[0].coordinates[0]);
    expect(s.load).toBe(0);
  });

  it('serves Poblacion first, then is in Milagrosa by 7:50 AM Tuesday', () => {
    expect(sim('t2', tue(7, 25)).barangayId).toMatch(/^brgy-[1-4]$/);
    const s = sim('t2', tue(7, 50));
    expect(s.status).toBe('on_route');
    // The street under the truck may belong to a neighbouring barangay between stops; the
    // service log is what says Milagrosa collection has started.
    expect(s.visits.milagrosa.startedAt).toBeLessThan(tue(7, 50));
    expect(s.visits.milagrosa.finishedAt).toBeNull();
    expect(s.progressM).toBeGreaterThan(0);
    expect(s.load).toBeGreaterThan(0);
    expect(s.load).toBeLessThan(1);
  });

  it('only moves forward and loads up over time', () => {
    const times = [tue(7, 5), tue(7, 20), tue(7, 40), tue(7, 55)];
    const states = times.map((t) => sim('t2', t));
    for (let i = 1; i < states.length; i++) {
      expect(states[i].progressM).toBeGreaterThanOrEqual(states[i - 1].progressM);
      expect(states[i].load).toBeGreaterThanOrEqual(states[i - 1].load);
    }
  });

  it('gives identical results for the same time (so every device agrees)', () => {
    expect(sim('t1', tue(8, 15))).toEqual(sim('t1', tue(8, 15)));
  });

  it('finishes the route with the expected load', () => {
    const s = sim('t2', tue(13, 0));
    expect(s.status).toBe('done');
    expect(s.load).toBeCloseTo(0.85);
    expect(s.progressM).toBe(s.routeLengthM);
  });

  it('fills up Mabuhay truck part-way and stops with streets left (Problem 3)', () => {
    const later = sim('t3', tue(11, 0));
    const muchLater = sim('t3', tue(15, 0));
    expect(later.status).toBe('full');
    expect(later.load).toBe(1);
    expect(later.progressM).toBeLessThan(later.routeLengthM);
    expect(muchLater.position).toEqual(later.position);
  });

  it('has no trucks on duty on a Wednesday', () => {
    const wed = manilaEpoch(2026, 9, 30, 8, 0);
    const states = simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, wed);
    expect(states.every((s) => s.status === 'off_duty' && s.position === null)).toBe(true);
  });

  it('runs the Mon/Thu routes on Monday', () => {
    const mon = manilaEpoch(2026, 9, 28, 8, 0);
    expect(sim('t1', mon).routeId).toBe('r-bancal');
    expect(sim('t2', mon).routeId).toBe('r-cabilang-baybay');
    expect(sim('t3', mon).status).toBe('off_duty');
  });

  it('builds a timeline that fits every sample route inside its schedule window', () => {
    for (const sched of ROUTE_SCHEDULES) {
      const route = ROUTES.find((r) => r.id === sched.routeId)!;
      const [dh, dm] = (sched.departAt ?? sched.start).split(':').map(Number);
      const [eh, em] = sched.windowEnd.split(':').map(Number);
      const availableMs = (eh * 60 + em - (dh * 60 + dm)) * 60_000;
      expect(getTimeline(route).totalMs).toBeLessThanOrEqual(availableMs);
    }
  });

  it('leaves the depot at its departure time, after the window opens (Truck 2: 7:17)', () => {
    expect(sim('t2', tue(7, 16)).status).toBe('not_started');
    expect(sim('t2', tue(7, 18)).status).toBe('on_route');
    expect(sim('t2', tue(7, 0)).departAt).toBe(tue(7, 17));
  });

  it('stops for a breakdown and resumes later, shifting the rest of the route', () => {
    const events = [
      { id: 'b', kind: 'breakdown' as const, truckId: 't1', at: tue(7, 30), minutes: 60 },
    ];
    const withBreakdown = (at: number) =>
      simulateTruck(truck('t1'), ROUTE_SCHEDULES, ROUTES, at, [], events);
    const during = withBreakdown(tue(8, 0));
    expect(during.status).toBe('breakdown');
    expect(during.incident).toMatchObject({ since: tue(7, 30), until: tue(8, 30) });
    expect(during.position).toEqual(withBreakdown(tue(7, 31)).position);
    // After the repair it is exactly where it would have been an hour earlier.
    expect(withBreakdown(tue(9, 30)).progressM).toBeCloseTo(sim('t1', tue(8, 30)).progressM, 3);
  });

  it('ignores breakdowns reported when the truck is not on its route', () => {
    const events = [
      { id: 'b', kind: 'breakdown' as const, truckId: 't2', at: tue(6, 0), minutes: 60 },
    ];
    const s = simulateTruck(truck('t2'), ROUTE_SCHEDULES, ROUTES, tue(7, 50), [], events);
    expect(s).toEqual(sim('t2', tue(7, 50)));
  });
});
