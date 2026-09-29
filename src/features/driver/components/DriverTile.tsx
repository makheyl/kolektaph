import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, spacing, touch } from '@/theme/tokens';

interface DriverTileProps {
  icon?: IconName;
  label: string;
  onPress: () => void;
  /** The truck's current state: filled, with a check and "ngayon". */
  selected?: boolean;
  /** Colour when selected (with white text). Defaults to navy. */
  tone?: string;
  disabled?: boolean;
  /** Short tiles for the load row (¼ ½ ¾ PUNO). */
  compact?: boolean;
  accessibilityLabel?: string;
}

/**
 * Big square button for the driver app: sized for gloved hands in a moving truck (72 dp and
 * up), with the current state shown by fill, a check mark and a word.
 */
export function DriverTile({
  icon,
  label,
  onPress,
  selected,
  tone = colors.navy,
  disabled,
  compact,
  accessibilityLabel,
}: DriverTileProps) {
  const { t } = useTranslation();
  const fg = selected ? colors.textOnDark : colors.navy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        compact && styles.compact,
        selected
          ? { backgroundColor: tone, borderColor: tone }
          : { backgroundColor: colors.surface, borderColor: colors.navy },
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {icon ? <Icon name={icon} size={compact ? 26 : 34} color={fg} /> : null}
      <AppText variant={compact ? 'title' : 'bodyStrong'} color={fg} style={styles.label}>
        {label}
      </AppText>
      {selected ? (
        <View style={styles.now}>
          <Icon name="check-circle" size={16} color={colors.textOnDark} />
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
    borderWidth: 2,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  compact: { minHeight: touch.driver, minWidth: 64, padding: spacing.sm },
  label: { textAlign: 'center' },
  now: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
