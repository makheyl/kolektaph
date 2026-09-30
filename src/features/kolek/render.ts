/**
 * Turns answer lines into text. Facts stay structured until here (times, days, names), so the
 * same line reads right in Filipino and English and every number comes from data.
 */
import type { TFunction } from 'i18next';

import { formatRelativeDay } from '@/features/resident/format';
import { formatClock } from '@/lib/time';
import type { KolekLine, KolekValue } from '@/services/types';

export interface RenderContext {
  t: TFunction;
  now: number;
  language: 'fil' | 'en';
  /** Barangay id → display name ('' when unknown). */
  nameOf: (id: string) => string;
}

export function renderValue(value: KolekValue, ctx: RenderContext): string {
  switch (value.kind) {
    case 'text':
      return value.value;
    case 'number':
      return String(value.value);
    case 'percent':
      return `${Math.round(value.value * 100)}%`;
    case 'time':
      return formatClock(value.at);
    case 'day':
      return formatRelativeDay(ctx.t, value.at, ctx.now);
    case 'window':
      return `${formatClock(value.start)} – ${formatClock(value.end)}`;
    case 'minutes':
      return ctx.t('common.minutes', { count: value.value });
    case 'barangay':
      return (value.id && ctx.nameOf(value.id)) || ctx.t('truck.unnamedRoad');
    case 'weekdays':
      return value.days.map((d) => ctx.t(`weekday.${d}`)).join(', ');
    case 'i18n':
      return ctx.t(value.key);
    case 'localized':
      return value[ctx.language];
  }
}

export function renderLine(line: KolekLine, ctx: RenderContext): string {
  const params = Object.fromEntries(
    Object.entries(line.values ?? {}).map(([k, v]) => [k, renderValue(v, ctx)]),
  );
  return ctx.t(line.key, params);
}
