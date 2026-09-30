/**
 * Report categories, base scores and response targets from HAKOT Appendix B.1. The LGU sets
 * the final targets; these are the suggested starting points.
 */
import type { IconName } from '@/components/ui/Icon';
import { atManilaTime, DAY, HOUR, manilaParts, manilaStartOfDay } from '@/lib/time';
import type { ReportCategory, SamplePhotoId } from '@/services/types';

export type ResponseTarget =
  | { kind: 'hours'; hours: number }
  | { kind: 'next_working_day' }
  | { kind: 'booked' }
  | { kind: 'same_day' };

export interface CategoryMeta {
  /** Base priority (B.1). */
  base: number;
  target: ResponseTarget;
  icon: IconName;
  /** Not a pickup: open burning is an enforcement visit (and 911 if there is a fire risk). */
  pickup: boolean;
  sample: SamplePhotoId;
}

export const CATEGORY_META: Record<ReportCategory, CategoryMeta> = {
  MISSED: {
    base: 40,
    target: { kind: 'next_working_day' },
    icon: 'map-marker-remove',
    pickup: true,
    sample: 'street',
  },
  OVERFLOW: {
    base: 30,
    target: { kind: 'hours', hours: 48 },
    icon: 'trash-can-outline',
    pickup: true,
    sample: 'overflow',
  },
  DUMPING: {
    base: 35,
    target: { kind: 'hours', hours: 48 },
    icon: 'delete-variant',
    pickup: true,
    sample: 'dumping',
  },
  WATERWAY: {
    base: 45,
    target: { kind: 'hours', hours: 24 },
    icon: 'waves',
    pickup: true,
    sample: 'waterway',
  },
  EVENT: {
    base: 25,
    target: { kind: 'hours', hours: 48 },
    icon: 'party-popper',
    pickup: true,
    sample: 'event',
  },
  BULKY: {
    base: 10,
    target: { kind: 'booked' },
    icon: 'sofa-outline',
    pickup: true,
    sample: 'bulky',
  },
  DEBRIS: {
    base: 30,
    target: { kind: 'hours', hours: 48 },
    icon: 'home-flood',
    pickup: true,
    sample: 'debris',
  },
  HAZARD: {
    base: 50,
    target: { kind: 'hours', hours: 24 },
    icon: 'biohazard',
    pickup: true,
    sample: 'hazard',
  },
  ANIMAL: {
    base: 45,
    target: { kind: 'hours', hours: 24 },
    icon: 'paw-off',
    pickup: true,
    sample: 'animal',
  },
  BURNING: {
    base: 50,
    target: { kind: 'same_day' },
    icon: 'fire',
    pickup: false,
    sample: 'dumping',
  },
};

/** The six tiles on the first step of the report wizard. */
export const RESIDENT_CATEGORIES: ReportCategory[] = [
  'OVERFLOW',
  'DUMPING',
  'WATERWAY',
  'EVENT',
  'BULKY',
  'ANIMAL',
];

/** Behind the red "Emergency" tile. */
export const EMERGENCY_CATEGORIES: ReportCategory[] = ['HAZARD', 'DEBRIS', 'BURNING'];

export const isEmergency = (c: ReportCategory) => EMERGENCY_CATEGORIES.includes(c);

/** Next Monday–Friday after `from`, at 5:00 PM Manila. */
export function nextWorkingDay(from: number): number {
  let day = manilaStartOfDay(from) + DAY;
  while ([0, 6].includes(manilaParts(day).weekday)) day += DAY;
  return atManilaTime(day, '17:00');
}

/** When the ticket should be dealt with (null for booked bulky waste). */
export function responseDue(category: ReportCategory, createdAt: number): number | null {
  const target = CATEGORY_META[category].target;
  switch (target.kind) {
    case 'hours':
      return createdAt + target.hours * HOUR;
    case 'next_working_day':
      return nextWorkingDay(createdAt);
    case 'same_day':
      return atManilaTime(createdAt, '23:59');
    case 'booked':
      return null;
  }
}
