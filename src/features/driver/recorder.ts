/**
 * Phone GPS during a shift (Android). Two parts, so no fix is lost:
 * - a location task with a foreground service: Android shows a "naka-shift" notification the
 *   whole time, keeps the app alive with the screen off, and allows location with only the
 *   "while using the app" permission (no "allow all the time");
 * - a location watcher that hands fixes straight to the running app. The task's own delivery to
 *   JavaScript can stop while the app is running (expo-task-manager falls back to a headless
 *   runner that is not there), so the watcher is what records; task deliveries are kept too
 *   and duplicates are dropped by timestamp.
 *
 * Recording stops when the shift ends, and both paths refuse fixes outside a shift (HAKOT
 * TC-09). The task is defined at import time (root layout), so it also works if Android starts
 * the app in the background to deliver locations.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { PermissionsAndroid, Platform } from 'react-native';

import i18n from '@/i18n';
import type { GpsFix } from '@/services/types';
import { driverHydrated, useDriver } from '@/stores/driver';
import { gpsHydrated, useGps } from '@/stores/gps';
import { colors } from '@/theme/tokens';

import { syncNow } from './sync';

export const GPS_TASK = 'kolektaph-shift-gps';

export type StartGpsResult =
  { ok: true } | { ok: false; reason: 'services_off' | 'denied' | 'blocked' | 'failed' };

const INTERVAL_MS = 5_000;

const toFix = (l: Location.LocationObject): GpsFix => ({
  t: l.timestamp,
  lng: l.coords.longitude,
  lat: l.coords.latitude,
  acc: l.coords.accuracy ?? null,
});

let watcher: Location.LocationSubscription | null = null;

/** Keeps fixes only while a phone-GPS shift is running; otherwise switches recording off. */
async function record(locations: Location.LocationObject[]): Promise<void> {
  if (!locations.length) return;
  await Promise.all([driverHydrated(), gpsHydrated()]);
  const { shift } = useDriver.getState();
  if (!shift || shift.endedAt != null || shift.gpsSource !== 'phone') {
    await stopPhoneGps();
    return;
  }
  if (useGps.getState().append(locations.map(toFix)) > 0) void syncNow();
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  GPS_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations) return;
    await record(data.locations);
  },
);

/** Location switched on and permission granted ("while using the app" is enough). */
export async function preparePhoneGps(): Promise<StartGpsResult> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      // Android can show its own "turn on location" dialog.
      await Location.enableNetworkProviderAsync().catch(() => undefined);
      if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: 'services_off' };
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return { ok: false, reason: permission.canAskAgain ? 'denied' : 'blocked' };
    }
    // Android 13+: without this the "naka-shift" notice is hidden in the drawer. Recording
    // works either way, so a refusal is not an error.
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(
        () => undefined,
      );
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Starts recording (call preparePhoneGps first, and only while the app is on screen). */
export async function startPhoneGps(): Promise<StartGpsResult> {
  try {
    if (!(await Location.hasStartedLocationUpdatesAsync(GPS_TASK))) {
      await Location.startLocationUpdatesAsync(GPS_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: INTERVAL_MS,
        distanceInterval: 0,
        foregroundService: {
          notificationTitle: i18n.t('driver.gps.notificationTitle'),
          notificationBody: i18n.t('driver.gps.notificationBody'),
          notificationColor: colors.navy,
          killServiceOnDestroy: false,
        },
        activityType: Location.ActivityType.AutomotiveNavigation,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        // No Google "Location Accuracy" consent pop-ups mid-shift: the GPS works without it.
        mayShowUserSettingsDialog: false,
      });
    }
    watcher ??= await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: INTERVAL_MS,
        distanceInterval: 0,
        mayShowUserSettingsDialog: false,
      },
      (location) => void record([location]),
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Stops and starts again. "Registered" is not "recording": Android refuses to restore the
 * service while the app is in the background (e.g. after an update or a crash), and a second
 * start of a registered task does nothing.
 */
export async function restartPhoneGps(): Promise<StartGpsResult> {
  await stopPhoneGps();
  return startPhoneGps();
}

export async function stopPhoneGps(): Promise<void> {
  watcher?.remove();
  watcher = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) {
      await Location.stopLocationUpdatesAsync(GPS_TASK);
    }
  } catch {
    // Already stopped.
  }
}

/** Both parts must be on: the service (screen off, notification) and the watcher (delivery). */
export async function isPhoneGpsRunning(): Promise<boolean> {
  try {
    return watcher != null && (await Location.hasStartedLocationUpdatesAsync(GPS_TASK));
  } catch {
    return false;
  }
}
