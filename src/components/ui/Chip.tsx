import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Spoken instead of the label when the label alone is unclear (e.g. "3" on a 1–5 scale). */
  accessibilityLabel?: string;
}

/** Selectable pill for small option sets (language, speed). Selection is shown by fill AND a check mark. */
export function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        pressed && { opacity: 0.8 },
      ]}
    >
      <AppText variant="label" color={selected ? colors.textOnDark : colors.navy}>
        {selected ? `✓ ${label}` : label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touch.min,
    // Long labels (e.g. Kolek's suggestions at 200% text) wrap inside the pill.
    maxWidth: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 2,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.navy, borderColor: colors.navy },
  unselected: { backgroundColor: colors.surface, borderColor: colors.border },
});
