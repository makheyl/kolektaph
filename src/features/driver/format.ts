import type { TFunction } from 'i18next';

import { HOUR, MINUTE } from '@/lib/time';

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

/** Load report label: ¼ ½ ¾ PUNO. */
export const LOAD_STEPS = [0.25, 0.5, 0.75, 1] as const;
export const loadLabel = (t: TFunction, load: number) => t(`driver.shift.loadValue.${load}`);
