import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import type { PressState } from './interaction';
import { useNarrow } from './narrow';

/**
 * One filled "primary" per screen (the thing to do next). "secondary" is the outlined
 * alternative, "tonal" a quiet mint action inside a card, "ghost" a text-only way out
 * ("Mamaya na"). "success" is the same green as primary: it names the step that finishes a task.
 * "dark" is the filled button for coloured cards, where green would not stand out (on yellow).
 */
type Variant =
  'primary' | 'success' | 'secondary' | 'tonal' | 'ghost' | 'dark' | 'warning' | 'danger';

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.textOnDark, border: colors.primary },
  success: { bg: colors.primary, fg: colors.textOnDark, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  tonal: { bg: colors.mint, fg: colors.ink, border: colors.mint },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  dark: { bg: colors.ink, fg: colors.textOnDark, border: colors.ink },
  warning: { bg: colors.yellow, fg: colors.ink, border: colors.yellow },
  danger: { bg: colors.red, fg: colors.textOnDark, border: colors.red },
};

const SIZES = {
  compact: { minHeight: touch.min, icon: 20, text: 'label' },
  regular: { minHeight: touch.large, icon: 22, text: 'bodyStrong' },
  driver: { minHeight: touch.driver, icon: 30, text: 'heading' },
} as const;

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  /** Work in progress: shows a spinner and ignores taps. */
  loading?: boolean;
  /** "compact" = inside cards and rows; "driver" = 72dp for gloved hands in a moving truck. */
  size?: keyof typeof SIZES;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  size = 'regular',
  accessibilityHint,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const off = !!disabled || !!loading;
  // On a very narrow screen the words need the icon's room, or they break mid-word.
  const narrow = useNarrow();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.base,
        narrow && styles.narrow,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          minHeight: s.minHeight,
          opacity: disabled ? 0.45 : pressed ? 0.8 : hovered ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={v.fg} size="small" />
        ) : icon && !narrow ? (
          <Icon name={icon} color={v.fg} size={s.icon} />
        ) : null}
        <AppText variant={s.text} color={v.fg} style={styles.label}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    maxWidth: '100%',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  narrow: { paddingHorizontal: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  // Long labels wrap inside the button at 200% text instead of running off it.
  label: { flexShrink: 1, minWidth: 0, textAlign: 'center' },
});
