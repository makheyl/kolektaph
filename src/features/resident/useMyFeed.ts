import { buildFeed, countUnread } from '@/features/alerts/feed';
import { useMyHauling } from '@/features/hauling/hooks';
import { useMyTickets } from '@/features/reports/hooks';
import { usePoints } from '@/features/rewards/hooks';
import { useSimNow } from '@/features/tracking/hooks';
import { DAY } from '@/lib/time';

import { useMyAlerts } from './useMyAlerts';

/** Points earned in the last week count as news, like the alerts. */
const POINTS_DAYS = 7;

/**
 * "Mga abiso" for this resident: their barangay's alerts, news about their own reports and
 * hauling requests, and points earned lately.
 */
export function useMyFeed() {
  const { barangayId, alerts, seenAt } = useMyAlerts();
  const tickets = useMyTickets();
  const hauling = useMyHauling();
  const points = usePoints();
  const now = useSimNow(60_000);
  const items = buildFeed({
    alerts,
    tickets,
    hauling: hauling ?? [],
    points: points?.entries ?? [],
    pointsSince: now - POINTS_DAYS * DAY,
  });
  return { barangayId, items, seenAt, unread: countUnread(items, seenAt) };
}
