/**
 * Special pickups (report tickets dispatched to a truck), as the driver's phone sees them: the
 * server's tickets plus the crew's own task reports that may not be uploaded yet.
 */
import type { Ticket, TruckEvent } from '@/services/types';

export type TaskState = 'todo' | 'started' | 'done';

export function taskState(ticket: Ticket, local: TruckEvent[]): TaskState {
  const mine = local.filter((e) => e.kind === 'task' && e.ticketId === ticket.id);
  if (ticket.status === 'collected' || mine.some((e) => e.kind === 'task' && e.action === 'done')) {
    return 'done';
  }
  if (
    ticket.status === 'in_progress' ||
    mine.some((e) => e.kind === 'task' && e.action === 'start')
  ) {
    return 'started';
  }
  return 'todo';
}

/** Tickets dispatched to this truck that still need the crew (and ones done this shift). */
export function truckTasks(tickets: Ticket[], truckId: string, local: TruckEvent[]): Ticket[] {
  const doneLocally = new Set(
    local.flatMap((e) => (e.kind === 'task' && e.action === 'done' ? [e.ticketId] : [])),
  );
  return tickets
    .filter(
      (t) =>
        t.dispatch?.truckId === truckId &&
        (['scheduled', 'in_progress'].includes(t.status) || doneLocally.has(t.id)),
    )
    .sort((a, b) => (a.dispatch?.due ?? Infinity) - (b.dispatch?.due ?? Infinity));
}
