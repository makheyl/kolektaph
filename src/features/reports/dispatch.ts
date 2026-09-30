/**
 * Suggested handling for a report (HAKOT "Dispatch rules", suggested by the system, decided by
 * staff):
 * - same place and same kind within 72 hours → merge into the existing ticket;
 * - a truck on shift within 1.5 km with at least 25% room → add to its current route;
 * - regular collection there within 24 hours, and no hazard, waterway risk, dead animal or
 *   large pile → merge with the next schedule;
 * - otherwise → special pickup within the response target (nearest truck with room, or a
 *   special crew).
 */
import { collectionsForBarangay, nextCollection } from '@/features/schedule/collections';
import { metresBetween } from '@/lib/geo';
import { HOUR } from '@/lib/time';
import type {
  DispatchMode,
  Route,
  RouteSchedule,
  ScheduleException,
  Ticket,
  TruckState,
} from '@/services/types';

import { responseDue } from './categories';
import { isOpen, SAME_SPOT_M } from './priority';

export const NEARBY_TRUCK_M = 1_500;
/** At least 25% capacity left. */
export const MAX_LOAD_FOR_EXTRA = 0.75;
const DUPLICATE_WINDOW_MS = 72 * HOUR;
const NEXT_SCHEDULE_WITHIN_MS = 24 * HOUR;

export type DispatchSuggestion =
  | { action: 'merge'; into: string }
  | {
      action: 'dispatch';
      mode: DispatchMode;
      truckId: string | null;
      due: number | null;
      distanceM: number | null;
    };

export interface DispatchInput {
  ticket: Ticket;
  tickets: Ticket[];
  states: TruckState[];
  schedules: RouteSchedule[];
  routes: Route[];
  exceptions: ScheduleException[];
  now: number;
}

/** Hazards, waterway risk, dead animals and large piles need a special pickup. */
export function needsSpecialPickup(t: Ticket): boolean {
  return (
    ['HAZARD', 'WATERWAY', 'ANIMAL', 'BURNING', 'DEBRIS'].includes(t.category) ||
    t.nearWaterway ||
    t.size === 'truckload'
  );
}

function nearestTruck(states: TruckState[], ticket: Ticket, allowed: TruckState['status'][]) {
  return states
    .filter((s) => s.position && allowed.includes(s.status) && s.load <= MAX_LOAD_FOR_EXTRA)
    .map((s) => ({ s, distanceM: metresBetween(s.position!, ticket.location) }))
    .sort((a, b) => a.distanceM - b.distanceM)[0];
}

export function suggestDispatch(input: DispatchInput): DispatchSuggestion {
  const { ticket, tickets, states, now } = input;

  const duplicate = tickets
    .filter(
      (o) =>
        o.id !== ticket.id &&
        isOpen(o) &&
        o.category === ticket.category &&
        o.createdAt < ticket.createdAt &&
        ticket.createdAt - o.createdAt <= DUPLICATE_WINDOW_MS &&
        metresBetween(o.location, ticket.location) <= SAME_SPOT_M,
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (duplicate) return { action: 'merge', into: duplicate.id };

  const due = responseDue(ticket.category, ticket.createdAt);
  const close = nearestTruck(states, ticket, ['on_route']);
  if (close && close.distanceM <= NEARBY_TRUCK_M) {
    return {
      action: 'dispatch',
      mode: 'add_to_route',
      truckId: close.s.truckId,
      due,
      distanceM: Math.round(close.distanceM),
    };
  }

  if (!needsSpecialPickup(ticket) && ticket.barangayId) {
    const next = nextCollection(
      collectionsForBarangay(
        ticket.barangayId,
        input.schedules,
        input.routes,
        input.exceptions,
        now,
        3,
      ),
      now,
    );
    if (next && next.start - now <= NEXT_SCHEDULE_WITHIN_MS) {
      return {
        action: 'dispatch',
        mode: 'next_schedule',
        truckId: next.truckId,
        due: next.end,
        distanceM: null,
      };
    }
  }

  const any = nearestTruck(states, ticket, ['on_route', 'not_started', 'done']);
  return {
    action: 'dispatch',
    mode: 'special_pickup',
    truckId: any?.s.truckId ?? null,
    due,
    distanceM: any ? Math.round(any.distanceM) : null,
  };
}
