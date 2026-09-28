import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import { colors, radius } from '@/theme/tokens';

import type { MapTruck } from './types';

/** Map marker: status icon in a coloured circle plus the truck code, the same on web and native. */
export function TruckPin({ truck, onPress }: { truck: MapTruck; onPress?: () => void }) {
  const { t } = useTranslation();
  const meta = TRUCK_STATUS_META[truck.status];
  const label = t('truck.pinLabel', {
    name: truck.name,
    status: t(`truck.status.${truck.status}`),
  });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={styles.wrap}
    >
      <View style={[styles.circle, { backgroundColor: meta.color }]}>
        <Icon name={meta.icon} size={22} color={colors.textOnDark} />
      </View>
      <View style={[styles.tag, { borderColor: meta.color }]}>
        <AppText variant="caption" style={styles.code}>
          {truck.code}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  tag: {
    marginTop: -4,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
  },
  code: { fontWeight: '700', fontSize: 12, lineHeight: 16 },
});
