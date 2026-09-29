import { ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS, TRUCKS } from '@/data/carmona';
import { barangayVisit, travelMs, upcomingStreets } from '@/features/tracking/eta';
import { buildRoutePreview } from '@/features/tracking/routePreview';
import { metresBetween } from '@/lib/geo';
import { manilaEpoch } from '@/lib/time';
import type { Route, Truck } from '@/services/types';
import { simulateTruck } from '@/simulator/truckSimulator';

const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);
const truck = (id: string) => TRUCKS.find((t) => t.id === id) as Truck;
const route = (id: string) => ROUTES.find((r) => r.id === id) as Route;
const sim = (id: string, at: number) =>
  simulateTruck(truck(id), ROUTE_SCHEDULES, ROUTES, at, SCHEDULE_EXCEPTIONS);

describe('ETA estimation', () => {
  it('is zero for no distance and grows with distance', () => {
    const r = route('r-poblacion-milagrosa');
    expect(travelMs(r, 1000, 1000)).toBe(0);
    expect(travelMs(r, 0, 2000)).toBeGreaterThan(travelMs(r, 0, 1000));
  });

  it('predicts when the truck enters a barangay (agrees with what later happens)', () => {
    // Truck 4 serves Poblacion first, then Maduya. Predict Maduya's arrival from 7:10…
    const at = tue(7, 10);
    const r = route('r-poblacion-maduya');
    const visit = barangayVisit(r, sim('t4', at), 'maduya', at);
    expect(visit?.state).toBe('upcoming');
    const predicted = visit && visit.state === 'upcoming' ? visit.arriveAt! : 0;
    // …then check the simulator's service log once it has happened.
    const later = sim('t4', predicted + 60_000);
    expect(later.visits.maduya.startedAt).not.toBeNull();
    expect(Math.abs(later.visits.maduya.startedAt! - predicted)).toBeLessThan(2_000);
  });

  it('reports in-progress and passed states with times', () => {
    const r = route('r-poblacion-milagrosa');
    expect(barangayVisit(r, sim('t2', tue(7, 50)), 'milagrosa', tue(7, 50))?.state).toBe(
      'in_progress',
    );
    const passed = barangayVisit(r, sim('t2', tue(10, 0)), 'milagrosa', tue(10, 0));
    expect(passed?.state).toBe('passed');
    expect(passed && passed.state === 'passed' && passed.passedAt).toBeLessThan(tue(10, 0));
  });

  it('gives no ETA while the truck is stopped full', () => {
    const at = tue(11, 0);
    const visit = barangayVisit(route('r-mabuhay'), sim('t3', at), 'mabuhay', at);
    expect(visit).toEqual({ state: 'in_progress', finishAt: null });
  });

  it('returns null for barangays the route does not collect', () => {
    expect(
      barangayVisit(route('r-poblacion-milagrosa'), sim('t2', tue(7, 30)), 'lantic', tue(7, 30)),
    ).toBeNull();
  });

  it('lists upcoming streets once each, in arrival order', () => {
    const at = tue(7, 20);
    const streets = upcomingStreets(route('r-poblacion-milagrosa'), sim('t2', at), at, 8);
    expect(streets.length).toBeGreaterThan(0);
    expect(streets.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < streets.length; i++) {
      expect(streets[i].arriveAt).toBeGreaterThanOrEqual(streets[i - 1].arriveAt);
    }
    const keys = streets.map((s) => `${s.name}|${s.barangayId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('route preview', () => {
  const lengthOf = (fc: { features: { geometry: { coordinates: number[][] } }[] }) =>
    fc.features.reduce((sum, f) => {
      const c = f.geometry.coordinates as [number, number][];
      let m = 0;
      for (let i = 1; i < c.length; i++) m += metresBetween(c[i - 1], c[i]);
      return sum + m;
    }, 0);

  it('splits the route at the truck into collected + upcoming parts', () => {
    const at = tue(7, 30);
    const s = sim('t2', at);
    const r = route('r-poblacion-milagrosa');
    const p = buildRoutePreview(r, s, at);
    const done = lengthOf(p.done);
    const next = lengthOf(p.next);
    expect(done).toBeGreaterThan(0);
    expect(next).toBeGreaterThan(0);
    // The two parts cover the whole route (within rounding of the stored lengths).
    expect(Math.abs(done + next - r.lengthM) / r.lengthM).toBeLessThan(0.02);
    expect(Math.abs(done - s.progressM) / r.lengthM).toBeLessThan(0.02);
    expect(p.timeLabels.features.length).toBeGreaterThan(0);
  });

  it('shows no time labels when the truck is full (no honest estimate)', () => {
    const at = tue(11, 0);
    expect(
      buildRoutePreview(route('r-mabuhay'), sim('t3', at), at).timeLabels.features,
    ).toHaveLength(0);
  });
});
