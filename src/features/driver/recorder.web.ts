/**
 * Phone GPS on the web (a phone browser): browser geolocation while the page is open. There
 * is no background recording on the web; the Android app is the real driver tool.
 */
import * as Location from 'expo-location';

import type { GpsFix } from '@/services/types';
import { useDriver } from '@/stores/driver';
import { useGps } from '@/stores/gps';

import { syncNow } from './sync';

export const GPS_TASK = 'kolektaph-shift-gps';

export type StartGpsResult =
  { ok: true } | { ok: false; reason: 'services_off' | 'denied' | 'blocked' | 'failed' };

let subscription: Location.LocationSubscription | null = null;

const toFix = (l: Location.LocationObject): GpsFix => ({
  t: l.timestamp,
  lng: l.coords.longitude,
  lat: l.coords.latitude,
  acc: l.coords.accuracy ?? null,
});

export async function preparePhoneGps(): Promise<StartGpsResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return { ok: false, reason: permission.canAskAgain ? 'denied' : 'blocked' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function startPhoneGps(): Promise<StartGpsResult> {
  try {
    if (subscription) return { ok: true };
    subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 0 },
      (location) => {
        const { shift } = useDriver.getState();
        if (!shift || shift.endedAt != null) {
          void stopPhoneGps();
          return;
        }
        if (useGps.getState().append([toFix(location)]) > 0) void syncNow();
      },
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function restartPhoneGps(): Promise<StartGpsResult> {
  await stopPhoneGps();
  return startPhoneGps();
}

export async function stopPhoneGps(): Promise<void> {
  subscription?.remove();
  subscription = null;
}

export async function isPhoneGpsRunning(): Promise<boolean> {
  return subscription != null;
}
