/**
 * Priority score, rules version (HAKOT Appendix B.2):
 *
 *   score = base(category) + size + waterway + sensitive site + repeat site + age, max 100
 *   High ≥ 70 · Medium 40–69 · Low < 40
 *
 * The weights are starting values to tune with City ENRO staff during the pilot.
 */
import { metresBetween } from '@/lib/geo';
import { DAY, HOUR } from '@/lib/time';
import type { ReportSize, Ticket } from '@/services/types';

import { CATEGORY_META } from './categories';

export const SIZE_BONUS: Record<ReportSize, number> = { bags: 0, pile: 10, truckload: 20 };
export const WATERWAY_BONUS = 20;
export const SENSITIVE_BONUS = 10;
export const REPEAT_BONUS = 10;
/** Reports this close together count as the same spot. */
export const SAME_SPOT_M = 50;
const REPEAT_WINDOW_MS = 30 * DAY;
const REPEAT_MIN_REPORTS = 3;
const AGE_STEP_MS = 12 * HOUR;
const AGE_POINTS = 2;
const AGE_MAX = 10;

export type PriorityLevel = 'high' | 'medium' | 'low';

export interface Priority {
  score: number;
  level: PriorityLevel;
  parts: {
    base: number;
    size: number;
    waterway: number;
    sensitive: number;
    repeat: number;
    age: number;
  };
}

const OPEN = new Set<Ticket['status']>(['submitted', 'verified', 'scheduled', 'in_progress']);
export const isOpen = (t: Ticket) => OPEN.has(t.status);

export const levelOf = (score: number): PriorityLevel =>
  score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

/** When the ticket stopped waiting (collected, closed, rejected or merged), if it did. */
function endedAt(t: Ticket): number | null {
  if (isOpen(t)) return null;
  const end = t.history.find((h) =>
    ['collected', 'closed', 'rejected', 'merged'].includes(h.status),
  );
  return end?.at ?? t.createdAt;
}

export function priority(ticket: Ticket, all: Ticket[], now: number): Priority {
  const base = CATEGORY_META[ticket.category].base;
  const size = SIZE_BONUS[ticket.size];
  const waterway = ticket.nearWaterway && ticket.category !== 'WATERWAY' ? WATERWAY_BONUS : 0;
  const sensitive = ticket.nearSensitive ? SENSITIVE_BONUS : 0;

  // 3+ reports at the same spot within 30 days (this one included).
  const nearby = all.filter(
    (o) =>
      o.id !== ticket.id &&
      o.status !== 'merged' &&
      Math.abs(o.createdAt - ticket.createdAt) <= REPEAT_WINDOW_MS &&
      metresBetween(o.location, ticket.location) <= SAME_SPOT_M,
  ).length;
  const repeat = nearby + 1 >= REPEAT_MIN_REPORTS ? REPEAT_BONUS : 0;

  const waited = (endedAt(ticket) ?? now) - ticket.createdAt;
  const age = Math.min(AGE_MAX, Math.floor(Math.max(0, waited) / AGE_STEP_MS) * AGE_POINTS);

  const score = Math.min(100, base + size + waterway + sensitive + repeat + age);
  return { score, level: levelOf(score), parts: { base, size, waterway, sensitive, repeat, age } };
}
