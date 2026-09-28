import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface BigTileProps {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  accent?: string;
}

/** Large icon + label tile for main choices (roles, home quick actions). */
export function BigTile({ icon, label, hint, onPress, accent = colors.navy }: BigTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: accent }]}>
        <Icon name={icon} size={32} color={colors.textOnDark} />
      </View>
      <View style={styles.text}>
        <AppText variant="heading">{label}</AppText>
        {hint ? (
          <AppText variant="label" color={colors.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 88,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
