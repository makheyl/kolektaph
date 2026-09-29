import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** The whole row is the touch target, not just the small box. */
export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Icon name="check-bold" size={20} color={colors.textOnDark} /> : null}
      </View>
      <AppText style={styles.label}>{label}</AppText>
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
    borderColor: colors.navy,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.navy },
  label: { flex: 1 },
});
