/**
 * Demo clock. In "live" mode simulated time is real time, so every device shows the same
 * trucks at the same moment without a server. In "demo" mode time is anchored to a chosen
 * moment (e.g. Tuesday 7:25 AM) and can run faster than real time for pitch demos.
 */
export type ClockMode = 'live' | 'demo';

export interface ClockConfig {
  mode: ClockMode;
  anchorRealMs: number;
  anchorSimMs: number;
  speed: number;
  /**
   * How far the server's clock is ahead of this device's (ms), when the app follows a server.
   * Live time is then the server's time, so every device agrees even if a phone's clock is off.
   */
  offsetMs?: number;
}

export const LIVE_CLOCK: ClockConfig = { mode: 'live', anchorRealMs: 0, anchorSimMs: 0, speed: 1 };

export function simNow(clock: ClockConfig, realNow: number = Date.now()): number {
  if (clock.mode === 'live') return realNow + (clock.offsetMs ?? 0);
  return clock.anchorSimMs + (realNow - clock.anchorRealMs) * clock.speed;
}

/** The server's clock as it reads on this device. */
export interface ServerClock {
  /** Demo time anchors in the server's own time (null = live). */
  anchorRealMs: number | null;
  anchorSimMs: number | null;
  speed: number;
}

/**
 * The clock a device runs to follow the server's: live time shifted by the offset between the
 * two clocks, or the server's demo anchors moved onto this device's clock.
 */
export function followServer(server: ServerClock, offsetMs: number): ClockConfig {
  if (server.anchorRealMs == null || server.anchorSimMs == null) {
    return { ...LIVE_CLOCK, offsetMs };
  }
  return {
    mode: 'demo',
    anchorRealMs: server.anchorRealMs - offsetMs,
    anchorSimMs: server.anchorSimMs,
    speed: server.speed,
  };
}

export function jumpTo(
  clock: ClockConfig,
  simMs: number,
  realNow: number = Date.now(),
): ClockConfig {
  return { mode: 'demo', anchorRealMs: realNow, anchorSimMs: simMs, speed: clock.speed };
}

/** Changes speed without making simulated time jump. */
export function withSpeed(
  clock: ClockConfig,
  speed: number,
  realNow: number = Date.now(),
): ClockConfig {
  return { mode: 'demo', anchorRealMs: realNow, anchorSimMs: simNow(clock, realNow), speed };
}
