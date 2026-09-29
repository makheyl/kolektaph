import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { WasteBadge } from '@/components/ui/WasteBadge';
import type { CollectionOccurrence } from '@/features/schedule/collections';
import { useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

import { formatRelativeDay, formatWindow } from '../format';

/** Next collection day, time window, waste type and the segregation reminder. */
export function NextCollectionCard({
  next,
  now,
}: {
  next: CollectionOccurrence | null;
  now: number;
}) {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('resident.home.actions.schedule')}
      onPress={() => router.push('/resident/schedule')}
    >
      <Card>
        <View style={styles.header}>
          <AppText variant="label" color={colors.textMuted}>
            {t('resident.home.nextTitle')}
          </AppText>
          <Icon name="chevron-right" size={24} color={colors.textMuted} />
        </View>
        {next ? (
          <>
            <AppText variant="title">{formatRelativeDay(t, next.start, now)}</AppText>
            <AppText variant="heading">{formatWindow(next)}</AppText>
            {next.kind === 'moved_in' && next.exception ? (
              <AppText variant="label" color={colors.amber}>
                {t('resident.home.movedNote', { reason: next.exception.reason[language] })}
              </AppText>
            ) : null}
            <WasteBadge type={next.wasteType} />
            {next.wasteType === 'mixed' ? (
              <AppText variant="label" color={colors.textMuted}>
                {t('waste.mixedHint')}
              </AppText>
            ) : null}
          </>
        ) : (
          <AppText color={colors.textMuted}>{t('resident.home.noSchedule')}</AppText>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
