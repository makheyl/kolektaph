import type { IconName } from '@/components/ui/Icon';
import type { TruckStatus } from '@/services/types';
import { colors } from '@/theme/tokens';

export interface StatusMeta {
  icon: IconName;
  /** Solid colour for map pins and pill borders. */
  color: string;
  /** Soft background for pills. */
  soft: string;
}

/** Each status has its own icon AND colour AND label, so meaning never depends on colour alone. */
export const TRUCK_STATUS_META: Record<TruckStatus, StatusMeta> = {
  off_duty: { icon: 'sleep', color: colors.grey, soft: colors.greySoft },
  not_started: { icon: 'clock-outline', color: colors.navy, soft: colors.greySoft },
  on_route: { icon: 'truck-fast', color: colors.green, soft: colors.greenSoft },
  full: { icon: 'truck-alert', color: colors.red, soft: colors.redSoft },
  to_disposal: { icon: 'truck-delivery', color: colors.amber, soft: colors.amberSoft },
  break: { icon: 'coffee', color: colors.grey, soft: colors.greySoft },
  breakdown: { icon: 'car-wrench', color: colors.red, soft: colors.redSoft },
  no_signal: { icon: 'signal-off', color: colors.grey, soft: colors.greySoft },
  done: { icon: 'flag-checkered', color: colors.navy, soft: colors.greySoft },
};

/** Load bar colour: up to half = green, up to 85% = amber, above = red. */
export function loadColor(load: number): string {
  if (load >= 0.85) return colors.red;
  if (load > 0.5) return colors.amber;
  return colors.green;
}
