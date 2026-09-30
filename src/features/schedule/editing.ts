/**
 * Editing the regular schedule (City ENRO Schedules page). A change starts on a given day and
 * the old record ends the day before, so past days keep the schedule they had (alerts and stats
 * replay correctly). Pure and unit-tested.
 */
import { DAY, manilaDateKey, parseDateKey, parseHHmm } from '@/lib/time';
import type { RouteSchedule, ScheduleChange, Weekday } from '@/services/types';

import { scheduleValidOn } from './collections';

const dayBefore = (key: string) => manilaDateKey(parseDateKey(key) - DAY);
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** The record for a route in force on a Manila date ("YYYY-MM-DD"). */
export function scheduleOn(
  schedules: RouteSchedule[],
  routeId: string,
  dateKey: string,
): RouteSchedule | undefined {
  return schedules.find((s) => s.routeId === routeId && scheduleValidOn(s, dateKey));
}

export type ScheduleChangeError = 'no_days' | 'bad_time' | 'end_before_start' | 'too_soon';

/** Problems that block saving. A change can start tomorrow at the earliest. */
export function validateScheduleChange(change: ScheduleChange, now: number): ScheduleChangeError[] {
  const errors: ScheduleChangeError[] = [];
  if (!change.days.length) errors.push('no_days');
  if (!HHMM.test(change.start) || !HHMM.test(change.windowEnd)) errors.push('bad_time');
  else if (parseHHmm(change.windowEnd) <= parseHHmm(change.start)) errors.push('end_before_start');
  if (change.from <= manilaDateKey(now)) errors.push('too_soon');
  return errors;
}

/** Ends the route's current record the day before `change.from` and adds the new one. */
export function applyScheduleChange(
  schedules: RouteSchedule[],
  change: ScheduleChange,
): RouteSchedule[] {
  const out: RouteSchedule[] = [];
  let base: RouteSchedule | undefined;
  for (const s of schedules) {
    if (s.routeId !== change.routeId) {
      out.push(s);
      continue;
    }
    // Records that would only start on or after the change day are replaced by it.
    if (s.validFrom && s.validFrom >= change.from) {
      base ??= s;
      continue;
    }
    if (!s.validUntil || s.validUntil >= change.from) {
      base = s;
      out.push({ ...s, validUntil: dayBefore(change.from) });
    } else {
      out.push(s);
    }
  }
  const next: RouteSchedule = {
    routeId: change.routeId,
    truckId: change.truckId,
    days: [...change.days].sort() as Weekday[],
    start: change.start,
    windowEnd: change.windowEnd,
    wasteType: change.wasteType,
    expectedLoad: base?.expectedLoad ?? 0.8,
    // The late departure was tuned to the old window; keep it only if the start stays the same.
    ...(base?.departAt && base.start === change.start ? { departAt: base.departAt } : {}),
    validFrom: change.from,
  };
  return [...out, next];
}

/** Other routes the same truck would have to run at the same time (from `change.from` on). */
export function scheduleConflicts(
  schedules: RouteSchedule[],
  change: ScheduleChange,
): { routeId: string; days: Weekday[] }[] {
  const start = parseHHmm(change.start);
  const end = parseHHmm(change.windowEnd);
  return schedules.flatMap((s) => {
    if (s.routeId === change.routeId || s.truckId !== change.truckId) return [];
    if (s.validUntil && s.validUntil < change.from) return [];
    const days = s.days.filter((d) => change.days.includes(d));
    const overlaps = parseHHmm(s.start) < end && start < parseHHmm(s.windowEnd);
    return days.length && overlaps ? [{ routeId: s.routeId, days }] : [];
  });
}
