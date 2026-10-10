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
  /** What the truck already carries (0.25 or 0.5): reported as the shift's first load. */
  startLoad?: number;
}): Promise<StartGpsResult> {
  if (input.gpsSource === 'phone') {
    const ready = await preparePhoneGps();
    if (!ready.ok) return ready;
  }
  const { startLoad, ...start } = input;
  useDriver.getState().startShift(start);
  const shift = useDriver.getState().shift;
  if (!shift) return { ok: false, reason: 'failed' };
  // The same load report the crew taps during the shift, so everything downstream already knows it.
  if (startLoad) useDriver.getState().report({ kind: 'load', load: startLoad });
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
