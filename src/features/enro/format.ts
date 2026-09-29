import type { TFunction } from 'i18next';

/** "850 m" / "1.2 km" */
export function formatDistance(t: TFunction, metres: number): string {
  return metres < 1000
    ? t('enro.live.metres', { value: Math.round(metres) })
    : t('enro.live.km', { value: (metres / 1000).toFixed(1) });
}

export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
