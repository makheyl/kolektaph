import { manilaDateKey } from '@/lib/time';
import type {
  AlertKind,
  HaulingEvent,
  HaulingRequest,
  OutboundAlert,
  PointsEntry,
  Ticket,
  TicketEvent,
  TicketEventKind,
} from '@/services/types';

/**
 * The filters of "Mga abiso" are truck, reports and hauling. Anything else (an announcement,
 * points earned) shows under "Lahat" only.
 */
export type FeedGroup = 'truck' | 'reports' | 'hauling' | 'city' | 'rewards';

/**
 * One line of "Mga abiso": a text the barangay was sent, news about the resident's report or
 * hauling request, or points they earned.
 */
export type FeedItem =
  | { id: string; at: number; group: 'truck' | 'city'; source: 'alert'; alert: OutboundAlert }
  | {
      id: string;
      at: number;
      group: 'reports';
      source: 'ticket';
      ticket: Pick<Ticket, 'id' | 'category' | 'mergedInto' | 'rejectReason'>;
      event: TicketEvent;
    }
  | {
      id: string;
      at: number;
      group: 'hauling';
      source: 'hauling';
      requestId: string;
      event: HaulingEvent;
    }
  | { id: string; at: number; group: 'rewards'; source: 'points'; entry: PointsEntry };

const TRUCK_ALERTS: AlertKind[] = [
  'night_before',
  'vicinity',
  'vicinity_now',
  'delay_breakdown',
  'delay_full',
];

/** What the City or the crew did to a report. The resident's own taps are not news to them. */
const TICKET_NEWS: TicketEventKind[] = [
  'verified',
  'dispatched',
  'started',
  'collected',
  'education',
  'merged',
  'rejected',
];

/**
 * Everything the resident should hear about, newest first: the alerts for their barangay, each
 * step the City took on their own reports and hauling requests, and points earned since
 * `pointsSince`. Calculated from what the device already has; nothing here is stored.
 */
export function buildFeed(input: {
  alerts: OutboundAlert[];
  tickets: Ticket[];
  hauling?: HaulingRequest[];
  points?: PointsEntry[];
  /** Points earned before this moment are history, not news (they stay on the Rewards page). */
  pointsSince?: number;
}): FeedItem[] {
  const fromAlerts: FeedItem[] = input.alerts.map((alert) => ({
    id: `alert:${alert.id}`,
    at: alert.sentAt,
    group: TRUCK_ALERTS.includes(alert.kind) ? 'truck' : 'city',
    source: 'alert',
    alert,
  }));
  const fromTickets: FeedItem[] = input.tickets.flatMap((ticket) =>
    ticket.history
      .filter((event) => event.by !== 'resident' && TICKET_NEWS.includes(event.kind))
      .map((event) => ({
        id: `ticket:${ticket.id}:${event.id}`,
        at: event.at,
        group: 'reports' as const,
        source: 'ticket' as const,
        ticket: {
          id: ticket.id,
          category: ticket.category,
          mergedInto: ticket.mergedInto,
          rejectReason: ticket.rejectReason,
        },
        event,
      })),
  );
  const fromHauling: FeedItem[] = (input.hauling ?? []).flatMap((request) =>
    request.history
      .filter((event) => event.by !== 'resident')
      .map((event) => ({
        id: `hauling:${request.id}:${event.id}`,
        at: event.at,
        group: 'hauling' as const,
        source: 'hauling' as const,
        requestId: request.id,
        event,
      })),
  );
  const fromPoints: FeedItem[] = (input.points ?? [])
    .filter((entry) => entry.points > 0 && entry.at >= (input.pointsSince ?? 0))
    .map((entry) => ({
      id: `points:${entry.id}`,
      at: entry.at,
      group: 'rewards',
      source: 'points',
      entry,
    }));
  return [...fromAlerts, ...fromTickets, ...fromHauling, ...fromPoints].sort(
    (a, b) => b.at - a.at || a.id.localeCompare(b.id),
  );
}

/** "Ngayon" and "Mas nauna": the page's two headings (Manila days). */
export function splitByDay(
  items: FeedItem[],
  now: number,
): { today: FeedItem[]; earlier: FeedItem[] } {
  const todayKey = manilaDateKey(now);
  return {
    today: items.filter((i) => manilaDateKey(i.at) === todayKey),
    earlier: items.filter((i) => manilaDateKey(i.at) !== todayKey),
  };
}

export const countUnread = (items: FeedItem[], seenAt: number) =>
  items.filter((i) => i.at > seenAt).length;
