import { useAlerts } from '@/features/tracking/hooks';
import { useSettings } from '@/stores/settings';

/** Alerts for the resident's barangay (newest first) and how many are unread. */
export function useMyAlerts() {
  const barangayId = useSettings((s) => s.barangayId);
  const seenAt = useSettings((s) => s.alertsSeenAt);
  const all = useAlerts();
  const mine = barangayId ? all.filter((a) => a.barangayIds.includes(barangayId)) : [];
  return {
    barangayId,
    alerts: mine,
    seenAt,
    unread: mine.filter((a) => a.sentAt > seenAt).length,
  };
}
