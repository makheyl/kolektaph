import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, spacing } from '@/theme/tokens';

interface KpiTileProps {
  icon: IconName;
  label: string;
  value: string;
  /** Highlights the tile when the number needs attention (e.g. missed streets > 0). */
  alert?: boolean;
}

/** Big number with a short label (pitch design notes: "big numbers"). */
export function KpiTile({ icon, label, value, alert }: KpiTileProps) {
  return (
    <View
      style={[styles.tile, alert && styles.alert]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Icon name={icon} size={24} color={alert ? colors.red : colors.primary} />
      <AppText variant="display" color={alert ? colors.red : colors.text}>
        {value}
      </AppText>
      <AppText variant="label" color={colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: 180,
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alert: { borderColor: colors.red, borderWidth: 2, backgroundColor: colors.redSoft },
});
