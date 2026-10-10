import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { colors, radius, shadows, spacing, touch } from '@/theme/tokens';

interface PinPadProps {
  length: number;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
  /** False when the screen shows the PIN in its own field above the keys. */
  dots?: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

/** Big number keys (no phone keyboard popping up and covering the screen). */
export function PinPad({ length, onDigit, onDelete, disabled, dots = true }: PinPadProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      {dots ? (
        <View
          style={styles.dots}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('driver.signIn.pinDots', { count: length })}
          accessibilityValue={{ min: 0, max: 4, now: length }}
        >
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, i < length && styles.dotFilled]} />
          ))}
        </View>
      ) : null}
      <View style={styles.grid}>
        {ROWS.map((row) => (
          <View key={row.join('')} style={styles.row}>
            {row.map((k) =>
              k === '' ? (
                <View key="blank" style={styles.key} />
              ) : (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={k === 'del' ? t('driver.signIn.delete') : k}
                  disabled={disabled}
                  onPress={() => (k === 'del' ? onDelete() : onDigit(k))}
                  style={({ pressed, hovered }: PressState) => [
                    styles.key,
                    styles.keyButton,
                    (pressed || hovered) && {
                      backgroundColor: pressed ? colors.mint : colors.mintSoft,
                    },
                    disabled && { opacity: 0.5 },
                  ]}
                >
                  {k === 'del' ? (
                    <Icon name="backspace-outline" size={30} color={colors.ink} />
                  ) : (
                    <AppText variant="title" color={colors.ink}>
                      {k}
                    </AppText>
                  )}
                </Pressable>
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: spacing.lg },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Three keys across, 96 dp each on a phone; they share the width when the screen is narrower.
  grid: { width: '100%', maxWidth: 3 * 96 + 2 * spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  key: { flex: 1, height: touch.driver, alignItems: 'center', justifyContent: 'center' },
  keyButton: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
});
