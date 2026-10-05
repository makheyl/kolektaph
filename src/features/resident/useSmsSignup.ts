import { useEffect } from 'react';

import { useIsOnline } from '@/lib/network';
import { services } from '@/services';
import { smsKey, useSettings } from '@/stores/settings';

let sending = false;

/**
 * Keeps the server's copy of this device's text sign-up in step with the device: when the
 * resident changes barangay, the sign-up moves with them, as soon as there is signal.
 * (Turning texts on or off is confirmed with the server right away, on its own screen.)
 */
export function useSmsSignupSync(): void {
  const sms = useSettings((s) => s.sms);
  const synced = useSettings((s) => s.smsSyncedKey);
  const online = useIsOnline();
  const key = smsKey(sms);

  useEffect(() => {
    if (!sms || !online || key === synced || sending) return;
    sending = true;
    services.resident
      .subscribeSms(sms.mobile, sms.barangayId)
      .then(() => useSettings.getState().markSmsSynced(key))
      // No signal after all, or the server refused: the next change or reconnect tries again.
      .catch(() => {})
      .finally(() => {
        sending = false;
      });
  }, [sms, key, synced, online]);
}
