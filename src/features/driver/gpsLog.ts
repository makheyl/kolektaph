/**
 * GPS recording rules for the driver app (HAKOT TC-09, RA 10173): location is recorded only
 * while a shift is running, never before it starts or after it ends. Poor and duplicate fixes
 * are dropped. `traceStats` summarises a recording so a field test can be checked at a glance.
 */
import { metresBetween } from '@/lib/geo';
import type { GpsFix } from '@/services/types';

/** Fixes worse than this are too rough to tell streets apart. */
export const MAX_ACCURACY_M = 100;
/** A pause longer than this between fixes counts as a gap in the recording. */
export const GAP_MS = 60_000;
/** While the truck stands still, keep one fix per this interval (a heartbeat), not every one. */
export const STILL_HEARTBEAT_MS = 30_000;
const STILL_M = 5;

export interface ShiftWindow {
  /** Device times (epoch ms) of the shift, from the phone's own clock. */
  startedAtDevice: number;
  endedAtDevice: number | null;
}

/**
 * Which new fixes to keep: inside the shift window, accurate enough, newer than the last kept
 * fix, and (while standing still) at most one per STILL_HEARTBEAT_MS.
 */
export function acceptFixes(
  shift: ShiftWindow | null,
  lastKept: GpsFix | null,
  fixes: GpsFix[],
): { accepted: GpsFix[]; rejected: number } {
  if (!shift) return { accepted: [], rejected: fixes.length };
  const accepted: GpsFix[] = [];
  let last = lastKept;
  for (const f of [...fixes].sort((a, b) => a.t - b.t)) {
    const inShift =
      f.t >= shift.startedAtDevice && (shift.endedAtDevice == null || f.t <= shift.endedAtDevice);
    const precise = f.acc == null || f.acc <= MAX_ACCURACY_M;
    const newer = !last || f.t > last.t;
    const still =
      last != null &&
      f.t - last.t < STILL_HEARTBEAT_MS &&
      metresBetween([last.lng, last.lat], [f.lng, f.lat]) < STILL_M;
    if (inShift && precise && newer && !still) {
      accepted.push(f);
      last = f;
    }
  }
  return { accepted, rejected: fixes.length - accepted.length };
}

export interface TraceStats {
  points: number;
  distanceM: number;
  durationMs: number;
  /** Pauses longer than GAP_MS: [from, to] device times. */
  gaps: [number, number][];
  longestGapMs: number;
  medianAccuracyM: number | null;
}

export function traceStats(fixes: GpsFix[]): TraceStats {
  let distanceM = 0;
  const gaps: [number, number][] = [];
  let longestGapMs = 0;
  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1];
    const b = fixes[i];
    distanceM += metresBetween([a.lng, a.lat], [b.lng, b.lat]);
    const dt = b.t - a.t;
    longestGapMs = Math.max(longestGapMs, dt);
    if (dt > GAP_MS) gaps.push([a.t, b.t]);
  }
  const acc = fixes
    .map((f) => f.acc)
    .filter((a): a is number => a != null)
    .sort((x, y) => x - y);
  return {
    points: fixes.length,
    distanceM,
    durationMs: fixes.length > 1 ? fixes[fixes.length - 1].t - fixes[0].t : 0,
    gaps,
    longestGapMs,
    medianAccuracyM: acc.length ? acc[Math.floor(acc.length / 2)] : null,
  };
}
