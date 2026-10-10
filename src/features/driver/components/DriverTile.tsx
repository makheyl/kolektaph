import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { useSettings } from '@/stores/settings';
import {
  colors,
  LARGE_TEXT_SCALE,
  radius,
  shadows,
  spacing,
  touch,
  typography,
} from '@/theme/tokens';

interface DriverTileProps {
  icon?: IconName;
  label: string;
  onPress: () => void;
  /** The truck's current state: filled, with a check and "ngayon". */
  selected?: boolean;
  /** Colour when selected (with white text). Defaults to the brand green. */
  tone?: string;
  disabled?: boolean;
  /** Short tiles for the load row (¼ ½ ¾ PUNO). */
  compact?: boolean;
  accessibilityLabel?: string;
}

const BORDER = 2;

/**
 * The width a short tile needs to keep its word on one line ("PUNO" in bold capitals is about
 * three quarters of the letter size per letter), so large letters wrap the row, not the word.
 */
const compactMinWidth = (label: string, scale: number) =>
  Math.max(
    64,
    Math.ceil(label.length * typography.title.fontSize * 0.75 * scale) + 2 * (spacing.sm + BORDER),
  );

/**
 * Big square button for the driver app: sized for gloved hands in a moving truck (72 dp and
 * up), with the current state shown by fill, a check mark and a word.
 */
export function DriverTile({
  icon,
  label,
  onPress,
  selected,
  tone = colors.primary,
  disabled,
  compact,
  accessibilityLabel,
}: DriverTileProps) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const largeText = useSettings((s) => s.largeText);
  const scale = fontScale * (largeText ? LARGE_TEXT_SCALE : 1);
  const fg = selected ? colors.textOnDark : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.tile,
        compact && styles.compact,
        compact && { minWidth: compactMinWidth(label, scale) },
        selected
          ? { backgroundColor: tone, borderColor: tone }
          : {
              backgroundColor: pressed || hovered ? colors.mintSoft : colors.surface,
              borderColor: colors.ink,
            },
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {icon ? <Icon name={icon} size={compact ? 26 : 34} color={fg} /> : null}
      <AppText variant={compact ? 'title' : 'bodyStrong'} color={fg} style={styles.label}>
        {label}
      </AppText>
      {selected ? (
        <View style={styles.now}>
          {/* With large letters a short tile has room for the word only. */}
          {compact && scale > 1 ? null : (
            <Icon name="check-circle" size={16} color={colors.textOnDark} />
          )}
          <AppText variant="caption" color={colors.textOnDark}>
            {t('driver.shift.current')}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 104,
    minWidth: 120,
    borderRadius: radius.lg,
    borderWidth: BORDER,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    ...shadows.card,
  },
  compact: { minHeight: touch.driver, padding: spacing.sm },
  label: { textAlign: 'center' },
  now: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
