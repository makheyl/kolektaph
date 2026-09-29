/**
 * Uploads the phone's queue whenever the server can be reached. Called on a timer by the
 * driver layout, after every GPS batch (also in the background), and when signal returns.
 */
import { OfflineError, services } from '@/services';
import { useDriver } from '@/stores/driver';
import { useGps } from '@/stores/gps';

import { buildBatch, retryDelayMs } from './outbox';

export type SyncResult = 'idle' | 'busy' | 'waiting' | 'ok' | 'failed';

let inFlight = false;

/** One upload attempt. `force` skips the backoff wait (e.g. the "Ipadala ngayon" button). */
export async function syncNow(force = false): Promise<SyncResult> {
  if (inFlight) return 'busy';
  const driver = useDriver.getState();
  const truckId = driver.shift?.truckId ?? driver.session?.truckId;
  if (!truckId) return 'idle';
  if (!force && Date.now() < driver.sync.nextTryAt) return 'waiting';
  const batch = buildBatch(truckId, driver.outbox, useGps.getState(), Date.now());
  if (!batch) return 'idle';

  inFlight = true;
  try {
    await services.driver.upload(batch);
    useDriver.getState().markSynced(batch.events.map((e) => e.id));
    if (batch.gps) {
      useGps.getState().markSent(batch.gps.shiftId, batch.gps.fromIndex + batch.gps.fixes.length);
    }
    useDriver
      .getState()
      .setSync({ lastOkAt: Date.now(), failures: 0, nextTryAt: 0, lastError: null });
    return 'ok';
  } catch (e) {
    const failures = useDriver.getState().sync.failures + 1;
    useDriver.getState().setSync({
      failures,
      nextTryAt: Date.now() + retryDelayMs(failures),
      lastError: e instanceof OfflineError ? 'offline' : 'error',
    });
    return 'failed';
  } finally {
    inFlight = false;
  }
}

/** Items not uploaded yet (for the top bar and the end-of-shift check). */
export function usePending() {
  const events = useDriver((s) => s.outbox.filter((o) => !o.synced).length);
  const fixes = useGps((s) => Math.max(0, s.fixes.length - s.sentCount));
  return { events, fixes, total: events + fixes };
}
