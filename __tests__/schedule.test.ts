import { ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS, TRUCKS } from '@/data/carmona';
import {
  collectionsForBarangay,
  isRunning,
  nextCollection,
  nextCollectionAfterToday,
  routeRunsOnDay,
  todaysCollection,
} from '@/features/schedule/collections';
import { DAY, manilaEpoch, manilaParts } from '@/lib/time';
import type { RouteSchedule } from '@/services/types';

const sched = (routeId: string) =>
  ROUTE_SCHEDULES.find((s) => s.routeId === routeId) as RouteSchedule;
const day = (y: number, m: number, d: number) => manilaEpoch(y, m, d, 12);

describe('routeRunsOnDay', () => {
  it('runs on regular weekdays only', () => {
    expect(
      routeRunsOnDay(sched('r-poblacion-milagrosa'), day(2026, 9, 29), SCHEDULE_EXCEPTIONS),
    ).toEqual({
      runs: true,
      kind: 'regular',
    });
    expect(
      routeRunsOnDay(sched('r-poblacion-milagrosa'), day(2026, 9, 30), SCHEDULE_EXCEPTIONS).runs,
    ).toBe(false);
  });

  it('moves Christmas Day (Fri) collection to Saturday', () => {
    const fri = routeRunsOnDay(
      sched('r-poblacion-milagrosa'),
      day(2026, 12, 25),
      SCHEDULE_EXCEPTIONS,
    );
    const sat = routeRunsOnDay(
      sched('r-poblacion-milagrosa'),
      day(2026, 12, 26),
      SCHEDULE_EXCEPTIONS,
    );
    expect(fri).toMatchObject({ runs: false, kind: 'moved_out' });
    expect(sat).toMatchObject({ runs: true, kind: 'moved_in' });
  });

  it('only affects the routes named in the exception', () => {
    // Bonifacio Day moves Mon routes; Tue/Fri routes are untouched.
    expect(routeRunsOnDay(sched('r-bancal'), day(2026, 11, 30), SCHEDULE_EXCEPTIONS).runs).toBe(
      false,
    );
    expect(routeRunsOnDay(sched('r-bancal'), day(2026, 12, 2), SCHEDULE_EXCEPTIONS).runs).toBe(
      true,
    );
    expect(routeRunsOnDay(sched('r-lantic'), day(2026, 12, 1), SCHEDULE_EXCEPTIONS).runs).toBe(
      true,
    );
  });

  it('supports cancellations', () => {
    const cancel = [
      {
        date: '2026-09-29',
        routeIds: 'all' as const,
        action: 'cancel' as const,
        reason: { fil: 'Bagyo', en: 'Typhoon' },
      },
    ];
    expect(routeRunsOnDay(sched('r-poblacion-milagrosa'), day(2026, 9, 29), cancel)).toMatchObject({
      runs: false,
      kind: 'cancelled',
    });
  });
});

describe('collectionsForBarangay', () => {
  const tueMorning = manilaEpoch(2026, 9, 29, 6, 0);
  const milagrosa = collectionsForBarangay(
    'milagrosa',
    ROUTE_SCHEDULES,
    ROUTES,
    SCHEDULE_EXCEPTIONS,
    tueMorning,
    14,
  );

  it('lists twice-a-week collections in time order', () => {
    expect(milagrosa).toHaveLength(4);
    expect(milagrosa.map((o) => manilaParts(o.start).weekday)).toEqual([2, 5, 2, 5]);
    expect(milagrosa.every((o, i) => i === 0 || o.start > milagrosa[i - 1].start)).toBe(true);
  });

  it('finds today, next, and next after today', () => {
    expect(todaysCollection(milagrosa, tueMorning)?.start).toBe(manilaEpoch(2026, 9, 29, 7, 0));
    expect(nextCollection(milagrosa, tueMorning)?.start).toBe(manilaEpoch(2026, 9, 29, 7, 0));
    expect(nextCollectionAfterToday(milagrosa, tueMorning)?.start).toBe(
      manilaEpoch(2026, 10, 2, 7, 0),
    );
    const afterWindow = manilaEpoch(2026, 9, 29, 10, 30);
    expect(nextCollection(milagrosa, afterWindow)?.start).toBe(manilaEpoch(2026, 10, 2, 7, 0));
  });

  it('shows holiday changes on both the original and the replacement day', () => {
    const dec = collectionsForBarangay(
      'milagrosa',
      ROUTE_SCHEDULES,
      ROUTES,
      SCHEDULE_EXCEPTIONS,
      day(2026, 12, 21),
      7,
    );
    const christmas = dec.find((o) => manilaParts(o.day).day === 25);
    const saturday = dec.find((o) => manilaParts(o.day).day === 26);
    expect(christmas && isRunning(christmas)).toBe(false);
    expect(saturday && isRunning(saturday)).toBe(true);
  });
});

describe('sample schedule sanity (including holiday moves)', () => {
  it('never gives a truck two routes on the same day over the next 120 days', () => {
    const start = day(2026, 9, 28);
    for (let d = 0; d < 120; d++) {
      const at = start + d * DAY;
      for (const truck of TRUCKS) {
        const running = ROUTE_SCHEDULES.filter(
          (s) => s.truckId === truck.id && routeRunsOnDay(s, at, SCHEDULE_EXCEPTIONS).runs,
        );
        expect({ truck: truck.id, day: d, count: running.length > 1 ? running.length : 0 }).toEqual(
          {
            truck: truck.id,
            day: d,
            count: 0,
          },
        );
      }
    }
  });
});
