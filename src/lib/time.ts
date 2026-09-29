/**
 * Asia/Manila time helpers. The Philippines has used a fixed UTC+8 offset with no
 * daylight saving time since 1978, so a constant offset is exact and avoids relying on
 * Intl time zone support in every JavaScript engine.
 */
import type { Weekday } from '@/services/types';

export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface ManilaParts {
  year: number;
  /** 1..12 */
  month: number;
  day: number;
  weekday: Weekday;
  hour: number;
  minute: number;
}

export function manilaParts(epochMs: number): ManilaParts {
  const d = new Date(epochMs + MANILA_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay() as Weekday,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Epoch ms for a Manila wall-clock time. `month` is 1..12. */
export function manilaEpoch(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - MANILA_OFFSET_MS;
}

/** Epoch ms of Manila midnight for the day containing `epochMs`. */
export function manilaStartOfDay(epochMs: number): number {
  const p = manilaParts(epochMs);
  return manilaEpoch(p.year, p.month, p.day);
}

/** Parses "HH:mm" into minutes after midnight. */
export function parseHHmm(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid time "${value}", expected HH:mm`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Epoch ms of a Manila "HH:mm" on the same Manila day as `dayEpochMs`. */
export function atManilaTime(dayEpochMs: number, hhmm: string): number {
  return manilaStartOfDay(dayEpochMs) + parseHHmm(hhmm) * MINUTE;
}

/** "7:40 AM" — 12-hour clock as used on Philippine schedules and SMS. */
export function formatClock(epochMs: number): string {
  const { hour, minute } = manilaParts(epochMs);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "YYYY-MM-DD" of the Manila calendar day containing `epochMs`. */
export function manilaDateKey(epochMs: number): string {
  const { year, month, day } = manilaParts(epochMs);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Epoch ms of Manila midnight for a "YYYY-MM-DD" key. */
export function parseDateKey(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid date key "${key}", expected YYYY-MM-DD`);
  return manilaEpoch(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Whole Manila calendar days from `fromMs`'s day to `toMs`'s day (0 = same day, 1 = tomorrow). */
export function manilaDayDiff(fromMs: number, toMs: number): number {
  return Math.round((manilaStartOfDay(toMs) - manilaStartOfDay(fromMs)) / DAY);
}

/** Next Manila date (today included) whose weekday is `weekday`, at `hhmm`. */
export function nextWeekdayAt(fromEpochMs: number, weekday: Weekday, hhmm: string): number {
  const today = manilaParts(fromEpochMs).weekday;
  const addDays = (weekday - today + 7) % 7;
  return atManilaTime(manilaStartOfDay(fromEpochMs) + addDays * DAY, hhmm);
}
