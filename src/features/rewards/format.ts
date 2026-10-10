import type { IconName } from '@/components/ui/Icon';
import type { PerkGroup, PointsEntry } from '@/services/types';

/** "1,250": points with thousands separators. */
export const formatPoints = (points: number) =>
  String(Math.round(Math.abs(points))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "+ 50" for points earned, "− 300" for points spent. */
export const signedPoints = (points: number) => `${points < 0 ? '−' : '+'} ${formatPoints(points)}`;

export const ENTRY_ICONS: Record<PointsEntry['kind'], IconName> = {
  valid_report: 'camera',
  pickup_confirmed: 'check-circle',
  segregation_check: 'recycle',
  cleanup_drive: 'account-group',
  week_complete: 'calendar-check',
  redeemed: 'gift',
  hauling_discount: 'truck',
};

export const PERK_ICONS: Record<PerkGroup, IconName> = {
  bills: 'water',
  stores: 'cart',
  city: 'bank',
};
