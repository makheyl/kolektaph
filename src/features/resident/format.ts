import type { TFunction } from 'i18next';

import type { CollectionOccurrence } from '@/features/schedule/collections';
import { formatClock, manilaDayDiff, manilaParts } from '@/lib/time';
import type { BarangayProperties } from '@/services/types';

/** "Martes, Okt 2" */
export function formatDate(t: TFunction, epochMs: number): string {
  const { weekday, month, day } = manilaParts(epochMs);
  return t('date.dayDate', {
    weekday: t(`weekday.${weekday}`),
    month: t(`date.month.${month}`),
    day,
  });
}

/** "Ngayon" / "Bukas" / "Martes, Okt 2" relative to `now`. */
export function formatRelativeDay(t: TFunction, epochMs: number, now: number): string {
  const diff = manilaDayDiff(now, epochMs);
  if (diff === 0) return t('date.today');
  if (diff === 1) return t('date.tomorrow');
  return formatDate(t, epochMs);
}

/** "7:00 AM – 10:00 AM" */
export const formatWindow = (o: CollectionOccurrence) =>
  `${formatClock(o.start)} – ${formatClock(o.end)}`;

/** Poblacion barangays are named "Barangay 1…8"; say so, since residents often call them that. */
export function barangayLabel(p: Pick<BarangayProperties, 'id' | 'name'>): string {
  return p.id.startsWith('brgy-') ? `${p.name} (Poblacion)` : p.name;
}
