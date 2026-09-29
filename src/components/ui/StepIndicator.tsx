import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

/** "Hakbang 2 sa 3" plus progress dots, so residents know how short onboarding is. */
export function StepIndicator({ current, total }: { current: number; total: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View
        style={styles.dots}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.dot, i < current && styles.dotDone]} />
        ))}
      </View>
      <AppText variant="label" color={colors.textMuted}>
        {t('onboarding.step', { current, total })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.green },
});
