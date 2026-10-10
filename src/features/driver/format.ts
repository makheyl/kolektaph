import type { TFunction } from 'i18next';

import { HOUR, manilaParts, MINUTE } from '@/lib/time';

/** "1:05" (hours:minutes) for the shift timer. */
export function formatShiftDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MINUTE));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "12 segundo na" / "3 minuto na". */
export function formatAgo(t: TFunction, ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 90
    ? t('driver.gps.secondsAgo', { count: seconds })
    : t('driver.gps.minutesAgo', { count: Math.round(seconds / 60) });
}

/** "1 oras 5 min" style, via the common minutes label for short spans. */
export function formatSpan(t: TFunction, ms: number): string {
  if (ms < HOUR) return t('common.minutes', { count: Math.round(ms / MINUTE) });
  return formatShiftDuration(ms);
}

/** Which greeting fits the time of day in Carmona: before noon, before 6 PM, or later. */
export function greetingKey(now: number): 'morning' | 'afternoon' | 'evening' {
  const { hour } = manilaParts(now);
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

/** What a truck can already carry when a shift starts: nothing, a quarter or half a load. */
export const START_LOADS = [0, 0.25, 0.5] as const;

/**
 * The pre-trip checklist, in the order a crew walks round the truck. A confirmation on the
 * phone before the shift starts; it is not sent anywhere.
 */
export const PRE_TRIP_CHECKS = [
  'vehicle',
  'fuel',
  'tires',
  'brakes',
  'lights',
  'location',
  'route',
  'equipment',
] as const;
export type PreTripCheck = (typeof PRE_TRIP_CHECKS)[number];

/** Load report label: ¼ ½ ¾ PUNO. */
export const LOAD_STEPS = [0.25, 0.5, 0.75, 1] as const;
export const loadLabel = (t: TFunction, load: number) => t(`driver.shift.loadValue.${load}`);
