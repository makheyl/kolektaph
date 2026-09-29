import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import { colors, radius } from '@/theme/tokens';

import type { MapTruck } from './types';

interface TruckPinProps {
  truck: MapTruck;
  selected?: boolean;
  onPress?: () => void;
}

/**
 * Map marker: status icon in a coloured circle plus the truck code, the same on web and native.
 * Selection is shown by size, a yellow ring AND an inverted code tag (not colour alone).
 */
export function TruckPin({ truck, selected, onPress }: TruckPinProps) {
  const { t } = useTranslation();
  const meta = TRUCK_STATUS_META[truck.status];
  const label = t('truck.pinLabel', {
    name: truck.name,
    status: t(`truck.status.${truck.status}`),
  });
  const size = selected ? 52 : 40;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      hitSlop={8}
      style={styles.wrap}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: meta.color,
            borderColor: selected ? colors.yellow : colors.surface,
          },
        ]}
      >
        <Icon name={meta.icon} size={selected ? 28 : 22} color={colors.textOnDark} />
      </View>
      <View
        style={[
          styles.tag,
          { borderColor: meta.color, backgroundColor: selected ? colors.navy : colors.surface },
        ]}
      >
        <AppText
          variant="caption"
          color={selected ? colors.textOnDark : colors.text}
          style={styles.code}
        >
          {truck.code}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  tag: {
    marginTop: -4,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
  },
  code: { fontWeight: '700', fontSize: 12, lineHeight: 16 },
});
