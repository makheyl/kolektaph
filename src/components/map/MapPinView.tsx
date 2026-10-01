import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme/tokens';

import type { MapPin } from './types';

/** A report location on the map: an icon in a coloured circle over a pointer. */
export function MapPinView({ pin }: { pin: MapPin }) {
  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={pin.label}>
      <View style={[styles.circle, { backgroundColor: pin.color }]}>
        <Icon name={pin.icon} size={20} color={colors.textOnDark} />
      </View>
      <View style={[styles.point, { borderTopColor: pin.color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  point: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
});
