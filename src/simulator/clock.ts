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
}

export const LIVE_CLOCK: ClockConfig = { mode: 'live', anchorRealMs: 0, anchorSimMs: 0, speed: 1 };

export function simNow(clock: ClockConfig, realNow: number = Date.now()): number {
  if (clock.mode === 'live') return realNow;
  return clock.anchorSimMs + (realNow - clock.anchorRealMs) * clock.speed;
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
