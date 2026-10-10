import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import type { PressState } from './interaction';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Spoken instead of the label when the label alone is unclear (e.g. "3" on a 1–5 scale). */
  accessibilityLabel?: string;
  /** "neutral" = a quiet grey pill for suggestions that are not a choice (Kolek's questions). */
  tone?: 'default' | 'neutral';
}

/** Selectable pill for small option sets (language, speed). Selection is shown by fill AND a check mark. */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  tone = 'default',
}: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.chip,
        selected ? styles.selected : tone === 'neutral' ? styles.neutral : styles.unselected,
        { opacity: pressed ? 0.8 : hovered ? 0.9 : 1 },
      ]}
    >
      <AppText variant="label" color={selected ? colors.textOnDark : colors.ink}>
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
    borderWidth: 1.5,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Mint with a soft edge, as in the design; the words inside are what make it findable.
  unselected: { backgroundColor: colors.mint, borderColor: colors.mintEdge },
  neutral: { backgroundColor: colors.greySoft, borderColor: colors.greySoft },
});
