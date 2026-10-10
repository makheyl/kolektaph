import type { Ticket, TicketStatus } from '@/services/types';

/** How "Aking mga report" groups the statuses: being looked at, a pickup is set, or finished. */
export type StatusGroup = 'review' | 'scheduled' | 'done' | 'other';

const GROUPS: Record<TicketStatus, StatusGroup> = {
  submitted: 'review',
  verified: 'review',
  scheduled: 'scheduled',
  in_progress: 'scheduled',
  collected: 'done',
  closed: 'done',
  // Merged and rejected reports show under "Lahat" only.
  merged: 'other',
  rejected: 'other',
};

export const statusGroup = (status: TicketStatus): StatusGroup => GROUPS[status];

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * True when every word typed is found in the ticket's number, its place (barangay, landmark) or
 * the name of its category. "113" finds KPH-2026-000113; "milagrosa" finds every report there.
 */
export function matchesSearch(
  ticket: Pick<Ticket, 'id' | 'landmark'>,
  query: string,
  place: { barangayName: string; categoryName: string },
): boolean {
  const words = plain(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = plain([ticket.id, ticket.landmark, place.barangayName, place.categoryName].join(' '));
  // A ticket number is searched without its dashes too ("000113", "2026000113").
  const digits = ticket.id.replace(/\D+/g, '');
  return words.every((w) => hay.includes(w) || (/^\d+$/.test(w) && digits.includes(w)));
}
