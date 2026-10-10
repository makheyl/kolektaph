import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { useNarrow } from '@/components/ui/narrow';
import { WasteBadge } from '@/components/ui/WasteBadge';
import type { CollectionOccurrence } from '@/features/schedule/collections';
import { useSettings } from '@/stores/settings';
import { colors, radius, spacing } from '@/theme/tokens';

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
  const narrow = useNarrow();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('resident.home.actions.schedule')}
      onPress={() => router.push('/resident/schedule')}
      style={({ pressed, hovered }: PressState) => ({
        opacity: pressed ? 0.8 : hovered ? 0.92 : 1,
      })}
    >
      <Card>
        <View style={styles.header}>
          {narrow ? null : (
            <View style={styles.icon}>
              <Icon name="calendar-month" size={24} color={colors.ink} />
            </View>
          )}
          <AppText variant="label" color={colors.textMuted} style={styles.flex}>
            {t('resident.home.nextTitle')}
          </AppText>
          <Icon name="chevron-right" size={24} color={colors.textMuted} />
        </View>
        {next ? (
          <>
            <View>
              <AppText variant="title">{formatRelativeDay(t, next.start, now)}</AppText>
              <AppText variant="heading" color={colors.primary}>
                {formatWindow(next)}
              </AppText>
            </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
});
