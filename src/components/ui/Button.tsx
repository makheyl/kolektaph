import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'success' | 'warning' | 'danger' | 'secondary';

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.navy, fg: colors.textOnDark, border: colors.navy },
  success: { bg: colors.green, fg: colors.textOnDark, border: colors.green },
  warning: { bg: colors.yellow, fg: colors.navy, border: colors.yellow },
  danger: { bg: colors.red, fg: colors.textOnDark, border: colors.red },
  secondary: { bg: colors.surface, fg: colors.navy, border: colors.navy },
};

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  /** "driver" = 72dp for gloved hands in a moving truck. */
  size?: 'regular' | 'driver';
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  size = 'regular',
  accessibilityHint,
}: ButtonProps) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          minHeight: size === 'driver' ? touch.driver : touch.large,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {icon ? <Icon name={icon} color={v.fg} size={size === 'driver' ? 30 : 22} /> : null}
        <AppText variant={size === 'driver' ? 'heading' : 'bodyStrong'} color={v.fg}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
