/**
 * Uploads the phone's queue whenever the server can be reached. Called on a timer by the
 * driver layout, after every GPS batch (also in the background), and when signal returns.
 */
import { OfflineError, services, SignInError } from '@/services';
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
  // Without a truck sign-in nothing can be sent: wait for the PIN.
  if (!truckId || !driver.session) return 'idle';
  if (!force && Date.now() < driver.sync.nextTryAt) return 'waiting';
  const batch = buildBatch(truckId, driver.outbox, useGps.getState(), Date.now());
  if (!batch) return 'idle';

  inFlight = true;
  try {
    const result = await services.driver.upload(batch);
    useDriver.getState().markSynced(result.accepted);
    // What the server refuses for good is dropped: sending it again would never work.
    useDriver.getState().dropRefused(result.rejected);
    if (batch.gps && result.gps) {
      // The server says how much of the trace it holds; after a gap that is less than was sent.
      useGps.getState().setSent(batch.gps.shiftId, result.gps.nextIndex);
      if (result.gps.blocked) useGps.getState().block(batch.gps.shiftId, result.gps.blocked);
    }
    useDriver
      .getState()
      .setSync({ lastOkAt: Date.now(), failures: 0, nextTryAt: 0, lastError: null });
    return 'ok';
  } catch (e) {
    if (e instanceof SignInError) {
      // The truck sign-in ended. The shift and the queue stay; the crew enters the PIN again.
      useDriver.getState().signOut();
      useDriver.getState().setSync({ failures: 0, nextTryAt: 0, lastError: 'signin' });
      return 'failed';
    }
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
  const fixes = useGps((s) => (s.blocked ? 0 : Math.max(0, s.fixes.length - s.sentCount)));
  return { events, fixes, total: events + fixes };
}
