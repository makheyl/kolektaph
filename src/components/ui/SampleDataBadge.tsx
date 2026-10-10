import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDemo } from '@/stores/demo';
import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** Marks sample numbers as such: the pitch guide says never present invented data as real. */
export function SampleDataBadge({ centered = false }: { centered?: boolean }) {
  const { t } = useTranslation();
  const demoMode = useDemo((s) => s.demoMode);
  if (!demoMode) return null;
  return (
    <View
      style={[styles.badge, centered && styles.centered]}
      accessible
      accessibilityLabel={`${t('common.sampleData')}. ${t('common.sampleDataHint')}`}
    >
      <Icon name="flask-outline" size={16} color={colors.ink} />
      <AppText variant="caption" color={colors.ink} style={styles.text}>
        {t('common.sampleData')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.yellowSoft,
    borderColor: colors.yellow,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  centered: { alignSelf: 'center' },
  text: { fontWeight: '600' },
});
