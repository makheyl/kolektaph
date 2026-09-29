/**
 * Decides what the resident Home screen says about today's collection: the one question
 * residents ask is "Kailan darating ang truck?". Pure, so every branch is unit-tested.
 */
import type { CollectionOccurrence } from '@/features/schedule/collections';
import { barangayVisit, VICINITY_MINUTES } from '@/features/tracking/eta';
import { MINUTE } from '@/lib/time';
import type { Route, TruckState } from '@/services/types';

export type HomeStatus =
  | { kind: 'no_barangay' }
  | { kind: 'no_collection_today'; next: CollectionOccurrence | null }
  | { kind: 'before_start'; today: CollectionOccurrence; departAt: number }
  | {
      kind: 'approaching';
      today: CollectionOccurrence;
      arriveAt: number;
      minutes: number;
      truckBarangayId: string | null;
    }
  | { kind: 'bring_out'; today: CollectionOccurrence; arriveAt: number; minutes: number }
  | {
      kind: 'in_barangay';
      today: CollectionOccurrence;
      streetName: string | null;
      finishAt: number | null;
    }
  | {
      kind: 'passed';
      today: CollectionOccurrence;
      passedAt: number;
      next: CollectionOccurrence | null;
    }
  | { kind: 'full'; today: CollectionOccurrence }
  | { kind: 'no_signal'; today: CollectionOccurrence };

export interface HomeStatusInput {
  barangayId: string | null;
  now: number;
  /** Today's running collection for the barangay (see todaysCollection). */
  today: CollectionOccurrence | null;
  /** The next running collection after today (for "passed" / "none today"). */
  nextAfterToday: CollectionOccurrence | null;
  truck: TruckState | undefined;
  route: Route | undefined;
}

export function homeStatus({
  barangayId,
  now,
  today,
  nextAfterToday,
  truck,
  route,
}: HomeStatusInput): HomeStatus {
  if (!barangayId) return { kind: 'no_barangay' };
  if (!today) return { kind: 'no_collection_today', next: nextAfterToday };

  // The truck assigned to today's collection must be reporting on that route.
  if (!truck || !route || truck.routeId !== today.routeId || truck.status === 'no_signal') {
    return now < today.start
      ? { kind: 'before_start', today, departAt: today.start }
      : { kind: 'no_signal', today };
  }

  const visit = barangayVisit(route, truck, barangayId, now);
  if (!visit) return { kind: 'no_signal', today };

  if (visit.state === 'passed') {
    return { kind: 'passed', today, passedAt: visit.passedAt, next: nextAfterToday };
  }
  if (truck.status === 'full') return { kind: 'full', today };
  if (truck.status === 'not_started') return { kind: 'before_start', today, departAt: today.start };

  if (visit.state === 'in_progress') {
    return {
      kind: 'in_barangay',
      today,
      streetName: truck.barangayId === barangayId ? truck.streetName : null,
      finishAt: visit.finishAt,
    };
  }

  if (visit.arriveAt == null) return { kind: 'no_signal', today };
  const minutes = Math.max(0, Math.ceil((visit.arriveAt - now) / MINUTE));
  return minutes <= VICINITY_MINUTES
    ? { kind: 'bring_out', today, arriveAt: visit.arriveAt, minutes }
    : {
        kind: 'approaching',
        today,
        arriveAt: visit.arriveAt,
        minutes,
        truckBarangayId: truck.barangayId,
      };
}
