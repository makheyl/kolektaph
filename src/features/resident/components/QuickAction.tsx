import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

interface QuickActionProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** A number on the circle's corner, e.g. how many reports. */
  badge?: string | null;
  /** What the number means, read out with the label ("3 report"). */
  badgeLabel?: string | null;
  /** Set by the grid: every shortcut in a row is this wide. */
  width?: number;
  /** Shown but not usable now (a shift shortcut before the shift starts). */
  disabled?: boolean;
}

/** A Home shortcut: a mint circle with an icon and its name underneath. */
export function QuickAction({
  icon,
  label,
  onPress,
  badge,
  badgeLabel,
  width,
  disabled,
}: QuickActionProps) {
  const spoken = badgeLabel ?? badge;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken ? `${label}. ${spoken}` : label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tile, width ? { width } : styles.loose, disabled && styles.disabled]}
    >
      {({ pressed, hovered }: PressState) => (
        <>
          <View style={[styles.circle, (pressed || hovered) && styles.circleActive]}>
            <Icon name={icon} size={32} color={colors.primary} />
            {badge ? (
              <View style={styles.badge}>
                <AppText variant="caption" color={colors.ink} style={styles.badgeText}>
                  {badge}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="caption" color={colors.primary} style={styles.label}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 2,
    paddingVertical: spacing.xs,
  },
  loose: { flexGrow: 1, flexBasis: 76 },
  disabled: { opacity: 0.45 },
  circle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: { backgroundColor: colors.mintEdge },
  // Kept inside its tile: a long name wraps there instead of running over the next one.
  label: { textAlign: 'center', fontFamily: fonts.bold, maxWidth: '100%' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 22,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.yellow,
  },
  badgeText: { fontFamily: fonts.semibold },
});
