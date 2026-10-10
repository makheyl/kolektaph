import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** A taller row and a bigger box, for the driver app (gloves, a moving truck). */
  large?: boolean;
}

/** The whole row is the touch target, not just the small box. */
export function Checkbox({ checked, onChange, label, large }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={[styles.row, large && styles.rowLarge]}
    >
      <View style={[styles.box, large && styles.boxLarge, checked && styles.boxChecked]}>
        {checked ? (
          <Icon name="check-bold" size={large ? 24 : 20} color={colors.textOnDark} />
        ) : null}
      </View>
      <AppText variant={large ? 'bodyStrong' : 'body'} style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: touch.min,
    paddingVertical: spacing.xs,
  },
  box: {
    width: 28,
    height: 28,
    marginTop: 2,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLarge: { minHeight: touch.large, alignItems: 'center' },
  boxLarge: { width: 34, height: 34, marginTop: 0 },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { flex: 1 },
});
