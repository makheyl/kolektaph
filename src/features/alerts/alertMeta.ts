import type { IconName } from '@/components/ui/Icon';
import type { AlertKind } from '@/services/types';
import { colors } from '@/theme/tokens';

/** Icon + colour per alert kind (always shown with its text label). */
export const ALERT_META: Record<AlertKind, { icon: IconName; color: string; soft: string }> = {
  night_before: { icon: 'calendar-clock', color: colors.navy, soft: colors.greySoft },
  vicinity: { icon: 'bell-ring', color: colors.amber, soft: colors.yellowSoft },
  vicinity_now: { icon: 'truck-check', color: colors.green, soft: colors.greenSoft },
  delay_breakdown: { icon: 'car-wrench', color: colors.red, soft: colors.redSoft },
  delay_full: { icon: 'truck-alert', color: colors.red, soft: colors.redSoft },
  announcement: { icon: 'bullhorn', color: colors.navy, soft: colors.greySoft },
};
