import { BARANGAYS, CITY_META, ROUTE_SCHEDULES, ROUTES, TRUCKS } from '@/data/carmona';

const ids = BARANGAYS.features.map((f) => f.properties.id);

describe('Carmona data integrity', () => {
  it('has all 14 barangays with unique ids', () => {
    expect(ids).toHaveLength(14);
    expect(new Set(ids).size).toBe(14);
    for (const name of ['Bancal', 'Cabilang Baybay', 'Lantic', 'Mabuhay', 'Maduya', 'Milagrosa']) {
      expect(BARANGAYS.features.some((f) => f.properties.name === name)).toBe(true);
    }
  });

  it('matches the PSA 2024 city population used in the pitch (112,140)', () => {
    const total = BARANGAYS.features.reduce((sum, f) => sum + (f.properties.population ?? 0), 0);
    expect(total).toBe(112_140);
  });

  it('references only existing trucks and routes in the schedule', () => {
    for (const s of ROUTE_SCHEDULES) {
      expect(TRUCKS.some((t) => t.id === s.truckId)).toBe(true);
      expect(ROUTES.some((r) => r.id === s.routeId)).toBe(true);
    }
  });

  it('never gives one truck two routes on the same day', () => {
    for (const truck of TRUCKS) {
      const days = ROUTE_SCHEDULES.filter((s) => s.truckId === truck.id).flatMap((s) => s.days);
      expect(new Set(days).size).toBe(days.length);
    }
  });

  it('collects every barangay exactly twice a week (sample schedule)', () => {
    for (const id of ids) {
      const days = ROUTE_SCHEDULES.filter((s) =>
        ROUTES.find((r) => r.id === s.routeId)?.barangayIds.includes(id),
      ).flatMap((s) => s.days);
      expect({ id, count: days.length }).toEqual({ id, count: 2 });
    }
  });

  it('only collects inside each route’s own barangays', () => {
    for (const route of ROUTES) {
      const collect = route.segments.filter((s) => s.collect);
      expect(collect.length).toBeGreaterThan(0);
      for (const seg of collect) expect(route.barangayIds).toContain(seg.barangayId);
    }
  });

  it('keeps every route coordinate near the city bounds', () => {
    const [[w, s], [e, n]] = CITY_META.bounds;
    const margin = 0.01; // ≈1 km: transit roads may clip the edge of the city
    for (const route of ROUTES) {
      for (const seg of route.segments) {
        for (const [x, y] of seg.coordinates) {
          expect(x).toBeGreaterThan(w - margin);
          expect(x).toBeLessThan(e + margin);
          expect(y).toBeGreaterThan(s - margin);
          expect(y).toBeLessThan(n + margin);
        }
      }
    }
  });
});
