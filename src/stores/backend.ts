import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SAMPLE_TICKET_COUNT, sampleTickets } from '@/data/carmona/sampleTickets';
import { applyAction, canApply } from '@/features/reports/lifecycle';
import type {
  GpsFix,
  GpsSource,
  Ticket,
  TicketAction,
  TruckEvent,
  UploadBatch,
} from '@/services/types';

import { getSimTime } from './demo';

export interface ReceivedTrace {
  truckId: string;
  source: GpsSource;
  fixes: GpsFix[];
}

interface BackendState {
  /** Truck events received from driver phones. */
  events: TruckEvent[];
  /** GPS fixes received per shift. */
  traces: Record<string, ReceivedTrace>;
  /** Report tickets (Snap & Report, claims, re-collections). */
  tickets: Ticket[];
  /** Last ticket sequence number used (KPH-YYYY-NNNNNN). */
  ticketSeq: number;
  receive: (batch: UploadBatch) => void;
  /** Reserves the next ticket sequence number. */
  nextTicketSeq: () => number;
  saveTicket: (ticket: Ticket) => void;
  reset: () => void;
}

const MAX_TRACES = 12;
const MAX_EVENT_AGE_MS = 8 * 24 * 60 * 60 * 1000;

/** Crew task reports (special pickups) update the ticket; invalid or repeated ones are skipped. */
function applyTaskEvents(tickets: Ticket[], events: TruckEvent[]): Ticket[] {
  let next = tickets;
  for (const e of events) {
    if (e.kind !== 'task') continue;
    const i = next.findIndex((t) => t.id === e.ticketId);
    if (i < 0) continue;
    const action: TicketAction =
      e.action === 'start'
        ? { type: 'start' }
        : { type: 'collect', before: e.before, after: e.after ?? { kind: 'sample', id: 'clean' } };
    const ticket = next[i];
    if (ticket.history.some((h) => h.id === e.id) || !canApply(ticket, action, 'driver', e.at)) {
      continue;
    }
    next = next.map((t, j) =>
      j === i ? applyAction(t, action, { at: e.at, by: 'driver', eventId: e.id }) : t,
    );
  }
  return next;
}

/**
 * Stand-in for the backend's tables: truck events, GPS and report tickets. Only the mock
 * services read and write it. Receiving is idempotent: an event id or a GPS index already
 * stored is skipped, so a phone that retries after a lost reply never creates duplicates.
 *
 * On web it lives in localStorage and is shared by every tab (see tabSync), so a driver tab and
 * a City ENRO tab behave like two devices talking to one server.
 */
export const useBackend = create<BackendState>()(
  persist(
    (set, get) => ({
      events: [],
      traces: {},
      tickets: sampleTickets(getSimTime()),
      ticketSeq: 100 + SAMPLE_TICKET_COUNT,
      receive: (batch) => {
        const { events, traces, tickets } = get();
        const known = new Set(events.map((e) => e.id));
        const fresh = batch.events.filter((e) => !known.has(e.id));
        const newest = Math.max(0, ...events.map((e) => e.at), ...fresh.map((e) => e.at));
        const nextEvents = [...events, ...fresh].filter((e) => e.at > newest - MAX_EVENT_AGE_MS);

        let nextTraces = traces;
        if (batch.gps) {
          const { shiftId, source, fromIndex, fixes } = batch.gps;
          const current = traces[shiftId]?.fixes ?? [];
          // Only the part of the batch the server does not have yet.
          const skip = Math.max(0, current.length - fromIndex);
          const added = fromIndex <= current.length ? fixes.slice(skip) : [];
          nextTraces = {
            ...traces,
            [shiftId]: { truckId: batch.truckId, source, fixes: [...current, ...added] },
          };
          const ids = Object.keys(nextTraces);
          if (ids.length > MAX_TRACES) {
            for (const id of ids.slice(0, ids.length - MAX_TRACES)) delete nextTraces[id];
          }
        }
        if (!fresh.length && nextTraces === traces) return;
        set({ events: nextEvents, traces: nextTraces, tickets: applyTaskEvents(tickets, fresh) });
      },
      nextTicketSeq: () => {
        const seq = get().ticketSeq + 1;
        set({ ticketSeq: seq });
        return seq;
      },
      saveTicket: (ticket) => {
        const { tickets } = get();
        const exists = tickets.some((t) => t.id === ticket.id);
        set({
          tickets: exists
            ? tickets.map((t) => (t.id === ticket.id ? ticket : t))
            : [ticket, ...tickets],
        });
      },
      reset: () =>
        set({
          events: [],
          traces: {},
          tickets: sampleTickets(getSimTime()),
          ticketSeq: 100 + SAMPLE_TICKET_COUNT,
        }),
    }),
    { name: 'kolektaph.backend', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
