import { manilaStartOfDay } from '@/lib/time';
import type {
  PointsEntry,
  PointsRules,
  PointsSummary,
  PointsTier,
  StreakDay,
} from '@/services/types';

/** What a resident has to spend: everything earned less everything spent. */
export const balanceOf = (entries: PointsEntry[]) => entries.reduce((sum, e) => sum + e.points, 0);

/** Everything ever earned. Spending does not lower it: it decides the tier. */
export const lifetimeOf = (entries: PointsEntry[]) =>
  entries.reduce((sum, e) => sum + Math.max(0, e.points), 0);

/** The tier reached with `lifetime` points, and the next one up (null at the top). */
export function tierFor(
  lifetime: number,
  tiers: PointsTier[],
): { tier: PointsTier; next: PointsTier | null; toNext: number; progress: number } {
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  const index = Math.max(
    0,
    sorted.findLastIndex((t) => lifetime >= t.from),
  );
  const tier = sorted[index];
  const next = sorted[index + 1] ?? null;
  const span = next ? next.from - tier.from : 0;
  return {
    tier,
    next,
    toNext: next ? Math.max(0, next.from - lifetime) : 0,
    // How far along from this tier to the next, 0 to 1 (full at the top tier).
    progress: next && span > 0 ? Math.min(1, Math.max(0, (lifetime - tier.from) / span)) : 1,
  };
}

/**
 * This week's collection days of the resident's barangay, each confirmed, missed or still to
 * come. A day counts as confirmed when a "pickup confirmed" entry falls on it.
 */
export function weekStreak(collectionDays: number[], entries: PointsEntry[], now: number) {
  const today = manilaStartOfDay(now);
  const confirmed = new Set(
    entries.filter((e) => e.kind === 'pickup_confirmed').map((e) => manilaStartOfDay(e.at)),
  );
  return [...new Set(collectionDays)]
    .sort((a, b) => a - b)
    .map<StreakDay>((day) => ({
      day,
      state: confirmed.has(day) ? 'confirmed' : day < today ? 'missed' : 'upcoming',
    }));
}

/** Everything the Rewards page shows, calculated from the entries. Nothing here is stored. */
export function summarize(
  entries: PointsEntry[],
  rules: PointsRules,
  collectionDays: number[],
  now: number,
): PointsSummary {
  const newestFirst = [...entries].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return {
    balance: balanceOf(entries),
    lifetime: lifetimeOf(entries),
    entries: newestFirst,
    week: weekStreak(collectionDays, entries, now),
    rules,
  };
}
