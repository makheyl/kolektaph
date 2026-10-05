import { useEffect, useState } from 'react';

import { useIsOnline } from '@/lib/network';
import { OfflineError, ServerError, services } from '@/services';
import type { Ticket } from '@/services/types';
import { useDemo } from '@/stores/demo';
import { useMyReports } from '@/stores/myReports';

/** Every ticket (staff view), newest first; empty until the first update. */
export function useTickets(): Ticket[] {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  // A demo time jump can close tickets (48-hour window): re-subscribe on clock changes.
  const clock = useDemo((s) => s.clock);
  useEffect(() => services.reports.subscribeTickets(setTickets), [clock]);
  return tickets;
}

/** The resident's own tickets (by the numbers kept on this device). */
export function useMyTickets(): Ticket[] {
  const tickets = useTickets();
  const ids = useMyReports((s) => s.ticketIds);
  return tickets.filter((t) => ids.includes(t.id));
}

let sending = false;

/** Sends reports saved without signal, oldest first. Returns how many were sent. */
export async function sendPendingReports(): Promise<number> {
  if (sending) return 0;
  sending = true;
  let sent = 0;
  try {
    for (const p of useMyReports.getState().pending) {
      if (p.refused) continue;
      try {
        const ticket = await services.reports.submit(p.report);
        useMyReports.getState().dequeue(p.localId);
        useMyReports.getState().addTicket(ticket.id);
        sent += 1;
      } catch (e) {
        if (e instanceof OfflineError) break;
        if (!(e instanceof ServerError)) throw e;
        // "Too many for now" may pass later; any other refusal will not, so stop retrying it.
        if (e.status === 429 || e.status >= 500) break;
        useMyReports.getState().markRefused(p.localId, e.code);
      }
    }
  } finally {
    sending = false;
  }
  return sent;
}

/** Retries saved reports whenever the phone is back online. */
export function usePendingReportsSync(): void {
  const online = useIsOnline();
  const pending = useMyReports((s) => s.pending.filter((p) => !p.refused).length);
  useEffect(() => {
    if (online && pending > 0) void sendPendingReports();
  }, [online, pending]);
}
