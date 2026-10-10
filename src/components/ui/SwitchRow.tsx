import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import type { PressState } from './interaction';
import { useNarrow } from './narrow';

interface SwitchRowProps {
  title: string;
  /** A line under the title: what turning it on does. */
  subtitle?: string;
  icon?: IconName;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * A row with an on/off switch at its right, as on the Notifications and Language pages. The
 * switch shows its state by where the knob sits and by a tick, not by colour alone.
 */
export function SwitchRow({ title, subtitle, icon, value, onChange, disabled }: SwitchRowProps) {
  const narrow = useNarrow();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed, hovered }: PressState) => [
        styles.row,
        narrow && styles.narrow,
        (pressed || hovered) && { backgroundColor: colors.mintSoft },
        disabled && styles.disabled,
      ]}
    >
      {icon && !narrow ? (
        <View style={styles.iconChip}>
          <Icon name={icon} size={24} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="label" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.track, value && styles.trackOn]} aria-hidden>
        <View style={[styles.knob, value && styles.knobOn]}>
          {value ? <Icon name="check" size={14} color={colors.primary} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // With large letters on a small phone the switch goes under the words.
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.large,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  narrow: { gap: spacing.sm, paddingHorizontal: spacing.sm },
  disabled: { opacity: 0.5 },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0, gap: 2 },
  track: {
    width: 52,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.fieldBorder,
    padding: 3,
    justifyContent: 'center',
    flexShrink: 0,
  },
  trackOn: { backgroundColor: colors.primary },
  knob: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobOn: { alignSelf: 'flex-end' },
});
