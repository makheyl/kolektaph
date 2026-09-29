import { ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS, TRUCKS } from '@/data/carmona';
import { homeStatus } from '@/features/resident/homeStatus';
import {
  collectionsForBarangay,
  nextCollectionAfterToday,
  todaysCollection,
} from '@/features/schedule/collections';
import { manilaEpoch } from '@/lib/time';
import { simulateFleet } from '@/simulator/truckSimulator';

const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);

/** Builds the Home status exactly as the app does, for a barangay at a moment. */
function statusFor(barangayId: string | null, now: number, { dropTruck = false } = {}) {
  const occ = barangayId
    ? collectionsForBarangay(barangayId, ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS, now, 14)
    : [];
  const today = todaysCollection(occ, now);
  const states = simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, now, SCHEDULE_EXCEPTIONS);
  return homeStatus({
    barangayId,
    now,
    today,
    nextAfterToday: nextCollectionAfterToday(occ, now),
    truck: dropTruck ? undefined : states.find((s) => s.truckId === today?.truckId),
    route: ROUTES.find((r) => r.id === today?.routeId),
  });
}

describe('Home status: "Kailan darating ang truck?"', () => {
  it('asks for a barangay when none is set', () => {
    expect(statusFor(null, tue(7, 30)).kind).toBe('no_barangay');
  });

  it('says there is no collection today, and when the next one is', () => {
    const wed = manilaEpoch(2026, 9, 30, 9, 0);
    const s = statusFor('milagrosa', wed);
    expect(s.kind).toBe('no_collection_today');
    expect(s.kind === 'no_collection_today' && s.next?.start).toBe(manilaEpoch(2026, 10, 2, 7, 0));
  });

  it('before the truck leaves: says when it departs (Truck 2 leaves at 7:17)', () => {
    const s = statusFor('milagrosa', tue(6, 30));
    expect(s).toMatchObject({ kind: 'before_start', departAt: tue(7, 17) });
  });

  it('Aling Rosa, 7:26 AM: "Ilabas na ang basura!" with the truck ~15 min away', () => {
    const s = statusFor('milagrosa', tue(7, 26));
    expect(s.kind).toBe('bring_out');
    expect(s.kind === 'bring_out' && s.minutes).toBeLessThanOrEqual(15);
    expect(s.kind === 'bring_out' && s.minutes).toBeGreaterThanOrEqual(12);
  });

  it('approaching, then "bring it out" within 15 minutes (Maduya is served after Poblacion)', () => {
    const early = statusFor('maduya', tue(7, 5));
    expect(early.kind).toBe('approaching');
    if (early.kind !== 'approaching') return;
    expect(early.minutes).toBeGreaterThan(15);
    const bringOutAt = early.arriveAt - 10 * 60_000;
    const soon = statusFor('maduya', bringOutAt);
    expect(soon.kind).toBe('bring_out');
    expect(soon.kind === 'bring_out' && soon.minutes).toBeLessThanOrEqual(15);
  });

  it('while collecting: in your barangay, with the street and finish time', () => {
    const s = statusFor('milagrosa', tue(7, 50));
    expect(s.kind).toBe('in_barangay');
    expect(s.kind === 'in_barangay' && s.finishAt).toBeGreaterThan(tue(7, 50));
  });

  it('after the truck finishes: passed, with the time and the next collection', () => {
    const s = statusFor('milagrosa', tue(10, 0));
    expect(s.kind).toBe('passed');
    if (s.kind !== 'passed') return;
    expect(s.passedAt).toBeLessThan(tue(10, 0));
    expect(s.next?.start).toBe(manilaEpoch(2026, 10, 2, 7, 0));
  });

  it('warns residents not to bring garbage out when the truck is full (Mabuhay)', () => {
    expect(statusFor('mabuhay', tue(11, 0)).kind).toBe('full');
  });

  it('is honest when there is no data from the truck', () => {
    expect(statusFor('milagrosa', tue(7, 50), { dropTruck: true }).kind).toBe('no_signal');
  });
});
