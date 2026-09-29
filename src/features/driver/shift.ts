/**
 * Starting and ending a shift: the reports, the GPS recording and the upload, in the right
 * order. Permission is asked before the shift starts, so a refusal never leaves a half-started
 * shift on the server.
 */
import type { GpsSource } from '@/services/types';
import { useDriver } from '@/stores/driver';
import { useGps } from '@/stores/gps';

import { preparePhoneGps, type StartGpsResult, startPhoneGps, stopPhoneGps } from './recorder';
import { syncNow } from './sync';

export async function beginShift(input: {
  routeId: string | null;
  crew: number;
  gpsSource: GpsSource;
}): Promise<StartGpsResult> {
  if (input.gpsSource === 'phone') {
    const ready = await preparePhoneGps();
    if (!ready.ok) return ready;
  }
  useDriver.getState().startShift(input);
  const shift = useDriver.getState().shift;
  if (!shift) return { ok: false, reason: 'failed' };
  useGps.getState().begin(shift.shiftId, input.gpsSource);
  void syncNow(true);
  // The shift runs even if the GPS service fails to start; the shift screen offers a retry.
  return input.gpsSource === 'phone' ? startPhoneGps() : { ok: true };
}

/** Ends the shift: GPS stops first, then no fix is kept after this moment (TC-09). */
export async function finishShift(): Promise<void> {
  await stopPhoneGps();
  useDriver.getState().endShift();
  void syncNow(true);
}
