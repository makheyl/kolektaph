import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import type { TruckStatus } from '@/services/types';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

export function StatusPill({ status }: { status: TruckStatus }) {
  const { t } = useTranslation();
  const meta = TRUCK_STATUS_META[status];
  return (
    <View style={[styles.pill, { backgroundColor: meta.soft, borderColor: meta.color }]}>
      <Icon name={meta.icon} size={18} color={meta.color} />
      <AppText variant="label" color={meta.color}>
        {t(`truck.status.${status}`)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
});
