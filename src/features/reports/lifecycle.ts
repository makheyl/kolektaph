/**
 * Ticket lifecycle (HAKOT Figure 4, without the AI screening step):
 *
 *   submitted → verified → scheduled → in_progress → collected → closed
 *                 ↘ merged (duplicate) · rejected (reason) · closed (education notice)
 *   collected → scheduled again when the reporter reopens within 48 hours (SNAP-08).
 *
 * Every change is time-stamped and attributed. Pure: the backend (mock today) calls this.
 */
import { HOUR } from '@/lib/time';
import type {
  NewReport,
  Ticket,
  TicketAction,
  TicketActor,
  TicketEvent,
  TicketEventKind,
  TicketStatus,
} from '@/services/types';

export const REOPEN_WINDOW_MS = 48 * HOUR;

export class TicketActionError extends Error {
  constructor(
    public action: TicketAction['type'],
    public status: TicketStatus,
  ) {
    super(`cannot ${action} a ${status} ticket`);
    this.name = 'TicketActionError';
  }
}

/** "KPH-2026-000123" */
export const ticketNumber = (year: number, seq: number) =>
  `KPH-${year}-${String(seq).padStart(6, '0')}`;

/** When the ticket was last marked collected (null if never). */
export function collectedAt(t: Ticket): number | null {
  return t.history.findLast((h) => h.kind === 'collected')?.at ?? null;
}

/** Who may do what, and from which statuses. */
const RULES: Record<TicketAction['type'], { from: TicketStatus[]; by: TicketActor[] }> = {
  // The system verifies a claim when GPS confirms the miss (HAKOT §10.2).
  verify: { from: ['submitted'], by: ['enro', 'system'] },
  dispatch: { from: ['submitted', 'verified'], by: ['enro'] },
  start: { from: ['scheduled'], by: ['driver', 'enro'] },
  collect: { from: ['scheduled', 'in_progress'], by: ['driver', 'enro'] },
  education: { from: ['submitted', 'verified'], by: ['enro'] },
  reject: { from: ['submitted', 'verified'], by: ['enro'] },
  merge: { from: ['submitted', 'verified'], by: ['enro'] },
  reopen: { from: ['collected'], by: ['resident'] },
  rate: { from: ['collected', 'closed'], by: ['resident'] },
  auto_close: { from: ['collected'], by: ['system'] },
};

export function canApply(t: Ticket, action: TicketAction, by: TicketActor, now: number): boolean {
  const rule = RULES[action.type];
  if (!rule.from.includes(t.status) || !rule.by.includes(by)) return false;
  const collected = collectedAt(t);
  switch (action.type) {
    case 'reopen':
      return collected != null && now - collected <= REOPEN_WINDOW_MS;
    case 'auto_close':
      return collected != null && now - collected > REOPEN_WINDOW_MS;
    case 'rate':
      return t.rating == null && action.stars >= 1 && action.stars <= 5;
    case 'reject':
      return action.reason.trim().length > 0;
    case 'merge':
      return action.into !== t.id;
    default:
      return true;
  }
}

/** Applies an action, or throws TicketActionError if it is not allowed now. */
export function applyAction(
  t: Ticket,
  action: TicketAction,
  meta: { at: number; by: TicketActor; eventId: string },
): Ticket {
  if (!canApply(t, action, meta.by, meta.at)) throw new TicketActionError(action.type, t.status);
  const entry = (
    kind: TicketEventKind,
    status: TicketStatus,
    note: string | null = null,
  ): TicketEvent => ({ id: meta.eventId, kind, status, at: meta.at, by: meta.by, note });
  const log = (kind: TicketEventKind, status: TicketStatus, note: string | null = null) => ({
    status,
    history: [...t.history, entry(kind, status, note)],
  });

  switch (action.type) {
    case 'verify':
      return { ...t, ...log('verified', 'verified') };
    case 'dispatch': {
      // Dispatching an unverified ticket verifies it on the way (one staff decision).
      const verified = t.status === 'submitted' ? applyAction(t, { type: 'verify' }, meta) : t;
      const dispatched = {
        ...entry('dispatched', 'scheduled', action.mode),
        id: `${meta.eventId}|dispatch`,
      };
      return {
        ...verified,
        status: 'scheduled',
        dispatch: { mode: action.mode, truckId: action.truckId, due: action.due },
        history: [...verified.history, dispatched],
      };
    }
    case 'start':
      return { ...t, ...log('started', 'in_progress') };
    case 'collect':
      return {
        ...t,
        ...log('collected', 'collected'),
        proof: { before: action.before, after: action.after, by: meta.by },
      };
    case 'education':
      return { ...t, ...log('education', 'closed', action.note) };
    case 'reject':
      return { ...t, ...log('rejected', 'rejected', action.reason), rejectReason: action.reason };
    case 'merge':
      return { ...t, ...log('merged', 'merged', action.into), mergedInto: action.into };
    case 'reopen':
      // Back to Scheduled with the same dispatch; the crew's proof stays in the history.
      return { ...t, ...log('reopened', 'scheduled', action.note || null) };
    case 'rate':
      // Rating a collected ticket closes it; a ticket that closed on its own can still be rated.
      return { ...t, ...log('rated', 'closed', String(action.stars)), rating: action.stars };
    case 'auto_close':
      return { ...t, ...log('closed', 'closed') };
  }
}

/** Collected tickets close on their own once the 48-hour reopen window has passed. */
export function withAutoClose(t: Ticket, now: number): Ticket {
  const auto: TicketAction = { type: 'auto_close' };
  const collected = collectedAt(t);
  if (collected == null || !canApply(t, auto, 'system', now)) return t;
  return applyAction(t, auto, {
    at: collected + REOPEN_WINDOW_MS + 1,
    by: 'system',
    eventId: `${t.id}|auto_close|${collected}`,
  });
}

/** A new ticket as submitted by a resident (or created for a claim / re-collection). */
export function newTicket(
  id: string,
  report: NewReport,
  meta: { at: number; barangayId: string | null; source?: Ticket['source'] },
): Ticket {
  return {
    ...report,
    id,
    barangayId: meta.barangayId,
    source: meta.source ?? 'resident',
    createdAt: meta.at,
    status: 'submitted',
    history: [
      {
        id: `${id}|submitted`,
        kind: 'submitted',
        status: 'submitted',
        at: meta.at,
        by: meta.source === 'enro' ? 'enro' : 'resident',
        note: null,
      },
    ],
    dispatch: null,
    proof: null,
    mergedInto: null,
    rejectReason: null,
    rating: null,
    missed: null,
    sample: false,
  };
}
