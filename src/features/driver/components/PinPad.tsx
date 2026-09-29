import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { colors, radius, spacing, touch } from '@/theme/tokens';

interface PinPadProps {
  length: number;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/** Big number keys (no phone keyboard popping up and covering the screen). */
export function PinPad({ length, onDigit, onDelete, disabled }: PinPadProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={t('driver.signIn.pinDots', { count: length })}
      >
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k) =>
          k === '' ? (
            <View key="blank" style={styles.key} />
          ) : (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? t('driver.signIn.delete') : k}
              disabled={disabled}
              onPress={() => (k === 'del' ? onDelete() : onDigit(k))}
              style={({ pressed }) => [
                styles.key,
                styles.keyButton,
                pressed && { backgroundColor: colors.greySoft },
                disabled && { opacity: 0.5 },
              ]}
            >
              {k === 'del' ? (
                <Icon name="backspace-outline" size={30} color={colors.navy} />
              ) : (
                <AppText variant="title">{k}</AppText>
              )}
            </Pressable>
          ),
        )}
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
    borderColor: colors.navy,
  },
  dotFilled: { backgroundColor: colors.navy },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 3 * 96 + 2 * spacing.md,
    gap: spacing.md,
  },
  key: { width: 96, height: touch.driver, alignItems: 'center', justifyContent: 'center' },
  keyButton: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
