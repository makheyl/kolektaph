import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useIsOnline, watchNetwork } from '@/lib/network';
import { services } from '@/services';
import { useDemo } from '@/stores/demo';
import { localEvents, useDriver, useDriverLive } from '@/stores/driver';
import { useGps } from '@/stores/gps';

import { isPhoneGpsRunning, restartPhoneGps } from './recorder';
import { syncNow } from './sync';

const SYNC_EVERY_MS = 2_000;
const DEMO_GPS_EVERY_MS = 5_000;

/** The phone's clock (not the demo clock), re-rendering every `intervalMs`. */
export function useDeviceNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(readDeviceClock);
  useEffect(() => {
    const timer = setInterval(() => setNow(readDeviceClock()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function readDeviceClock() {
  return Date.now();
}

/**
 * Everything the driver app keeps running while it is open: the upload loop, the truck as
 * this phone sees it, and (in demo mode) GPS fixes taken from the simulated truck.
 * Mounted once, in the driver layout.
 */
export function useDriverRuntime(): void {
  const truckId = useDriver((s) => s.shift?.truckId ?? s.session?.truckId ?? null);
  // Re-subscribe on every new report so the screen reacts at once, not on the next tick.
  const reports = useDriver((s) => s.outbox.length);
  const clock = useDemo((s) => s.clock);
  const online = useIsOnline();
  const demoGps = useDriver(
    (s) => s.shift != null && s.shift.endedAt == null && s.shift.gpsSource === 'demo',
  );
  const phoneGps = useDriver(
    (s) => s.shift != null && s.shift.endedAt == null && s.shift.gpsSource === 'phone',
  );
  usePhoneGpsWatchdog(phoneGps);

  useEffect(() => watchNetwork(), []);

  useEffect(() => {
    if (!truckId) {
      useDriverLive.setState({ truck: null });
      return;
    }
    return services.driver.subscribeOwnTruck(truckId, localEvents, (truck) =>
      useDriverLive.setState({ truck }),
    );
  }, [truckId, reports, clock]);

  useEffect(() => {
    const timer = setInterval(() => void syncNow(), SYNC_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  // Signal is back: send right away instead of waiting for the backoff.
  useEffect(() => {
    if (online) void syncNow(true);
  }, [online]);

  useEffect(() => {
    if (!demoGps) return;
    const record = () => {
      const position = useDriverLive.getState().truck?.position;
      if (!position) return;
      useGps
        .getState()
        .append([{ t: readDeviceClock(), lng: position[0], lat: position[1], acc: 8 }]);
    };
    record();
    const timer = setInterval(record, DEMO_GPS_EVERY_MS);
    return () => clearInterval(timer);
  }, [demoGps]);
}

/** No fix for this long while recording: treat the recording as stopped and restart it. */
const GPS_STALE_MS = 30_000;

/**
 * Watchdog for phone GPS: every 10 s, checks that fixes are really arriving (Android can stop
 * the service, e.g. after an update or a crash) and restarts recording while the app is open.
 * Publishes the result as useDriverLive.gpsOk.
 */
function usePhoneGpsWatchdog(active: boolean): void {
  const restarts = useDriverLive((s) => s.gpsRestarts);
  useEffect(() => {
    if (!active) {
      useDriverLive.setState({ gpsOk: true });
      return;
    }
    let cancelled = false;
    let lastRestart = 0;
    const check = async (force: boolean) => {
      // Android only lets a location service start while the app is on screen: never stop it
      // from the background, or it could not be started again.
      if (AppState.currentState !== 'active') return;
      const now = readDeviceClock();
      const shift = useDriver.getState().shift;
      const lastFix = useGps.getState().lastDeliveredAt ?? shift?.startedAtDevice ?? now;
      const stale = now - Math.max(lastFix, lastRestart) > GPS_STALE_MS;
      if (force || stale || !(await isPhoneGpsRunning())) {
        lastRestart = now;
        const result = await restartPhoneGps();
        if (!cancelled) useDriverLive.setState({ gpsOk: result.ok });
        return;
      }
      if (!cancelled) useDriverLive.setState({ gpsOk: now - lastFix <= 2 * GPS_STALE_MS });
    };
    void check(restarts > 0);
    const timer = setInterval(() => void check(false), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, restarts]);
}
