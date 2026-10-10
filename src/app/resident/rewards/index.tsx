import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { useNarrow } from '@/components/ui/narrow';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { Skeleton, SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { useAccount } from '@/features/account/hooks';
import { formatDate } from '@/features/resident/format';
import { PointsCard } from '@/features/rewards/components/PointsCard';
import { ENTRY_ICONS, formatPoints, signedPoints } from '@/features/rewards/format';
import { usePerks, usePoints, useVouchers } from '@/features/rewards/hooks';
import { goBack } from '@/lib/navigation';
import { services } from '@/services';
import type { PointsEarnKind } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/** The ways to earn shown as tiles (the weekly bonus is explained with the streak). */
const WAYS: PointsEarnKind[] = [
  'valid_report',
  'segregation_check',
  'cleanup_drive',
  'pickup_confirmed',
];
const RECENT = 3;

/** Rewards: the resident's Eco Points, this week's streak, how to earn and what happened. */
export default function RewardsScreen() {
  const account = useAccount();
  const { t } = useTranslation();
  const narrow = useNarrow();
  const language = useSettings((s) => s.language);
  const summary = usePoints();
  const vouchers = useVouchers();
  const perks = usePerks();
  const [showAll, setShowAll] = useState(false);

  const header = (
    <AppHeader
      title={t('rewards.title')}
      leading={
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => goBack('/resident')}
        />
      }
    />
  );

  if (!summary) {
    return (
      <Screen header={header}>
        <SkeletonGroup>
          <Skeleton height={176} round={radius.lg} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const entries = showAll ? summary.entries : summary.entries.slice(0, RECENT);

  return (
    <Screen header={header}>
      <SampleDataBadge />

      {/* Points held by a guest live on this device only: an account keeps them if it is lost. */}
      {services.features.accounts && account.status === 'guest' && summary.balance > 0 ? (
        <Card>
          <AppText variant="heading" color={colors.primary}>
            {t('rewards.savePoints.title')}
          </AppText>
          <AppText>{t('rewards.savePoints.body')}</AppText>
          <Button
            variant="secondary"
            icon="account-plus"
            label={t('rewards.savePoints.button')}
            onPress={() => router.push('/account/register')}
          />
        </Card>
      ) : null}

      <PointsCard summary={summary}>
        <View style={styles.action}>
          <Button
            variant="secondary"
            label={t('rewards.redeem')}
            onPress={() => router.push('/resident/rewards/redeem')}
          />
        </View>
        <View style={styles.action}>
          <Button
            variant="tonal"
            label={t('rewards.howItWorks')}
            onPress={() => router.push('/resident/rewards/how')}
          />
        </View>
      </PointsCard>

      <View style={styles.section}>
        <AppText variant="heading" color={colors.primary} accessibilityRole="header">
          {t('rewards.week')}
        </AppText>
        <Card>
          {summary.week.length ? (
            <View style={styles.days}>
              {summary.week.map((d) => (
                <View
                  key={d.day}
                  style={styles.day}
                  accessible
                  accessibilityLabel={`${formatDate(t, d.day)}: ${t(`rewards.day.${d.state}`)}`}
                >
                  <View style={[styles.circle, d.state === 'confirmed' && styles.circleDone]}>
                    {d.state === 'confirmed' ? (
                      <Icon name="check" size={24} color={colors.textOnDark} />
                    ) : d.state === 'missed' ? (
                      <Icon name="minus" size={22} color={colors.grey} />
                    ) : null}
                  </View>
                  <AppText variant="caption" color={colors.primary} style={styles.dayText}>
                    {formatDate(t, d.day)}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
          <AppText variant="label" color={colors.textMuted}>
            {summary.week.length
              ? t('rewards.weekHint', {
                  points: formatPoints(summary.rules.earn.week_complete),
                })
              : t('rewards.weekNoDays')}
          </AppText>
        </Card>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" color={colors.primary} accessibilityRole="header">
          {t('rewards.waysToEarn')}
        </AppText>
        <View style={styles.ways}>
          {WAYS.map((kind) => (
            <View
              key={kind}
              style={styles.way}
              accessible
              accessibilityLabel={`${t(`rewards.earn.${kind}`)}: ${t('rewards.plusPoints', { points: formatPoints(summary.rules.earn[kind]) })}`}
            >
              <Icon name={ENTRY_ICONS[kind]} size={24} color={colors.primary} />
              <AppText variant="bodyStrong" color={colors.primary}>
                {t(`rewards.earn.${kind}`)}
              </AppText>
              <AppText variant="label">
                {t('rewards.plusPoints', { points: formatPoints(summary.rules.earn[kind]) })}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <AppText variant="heading" color={colors.primary} accessibilityRole="header">
            {t('rewards.recent')}
          </AppText>
          {summary.entries.length > RECENT ? (
            <Button
              variant="ghost"
              size="compact"
              label={t(showAll ? 'rewards.seeLess' : 'rewards.seeAll')}
              onPress={() => setShowAll(!showAll)}
            />
          ) : null}
        </View>
        {entries.length ? (
          <Card style={styles.list}>
            {entries.map((e, i) => (
              <View
                key={e.id}
                style={[styles.entry, i > 0 && styles.entryLine]}
                accessible
                accessibilityLabel={`${t(`rewards.entry.${e.kind}`)}, ${formatDate(t, e.at)}: ${signedPoints(e.points)}`}
              >
                {narrow ? null : (
                  <Icon name={ENTRY_ICONS[e.kind]} size={22} color={colors.primary} />
                )}
                <View style={styles.entryText}>
                  <AppText variant="label">{t(`rewards.entry.${e.kind}`)}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    {formatDate(t, e.at)}
                  </AppText>
                </View>
                <AppText
                  variant="bodyStrong"
                  color={e.points < 0 ? colors.text : colors.primary}
                  style={styles.points}
                >
                  {signedPoints(e.points)}
                </AppText>
              </View>
            ))}
          </Card>
        ) : (
          <AppText color={colors.textMuted}>{t('rewards.noActivity')}</AppText>
        )}
      </View>

      {vouchers.length ? (
        <View style={styles.section}>
          <AppText variant="heading" color={colors.primary} accessibilityRole="header">
            {t('rewards.myVouchers')}
          </AppText>
          {vouchers.map((v) => (
            <ListRow
              key={v.id}
              variant="card"
              icon="ticket-confirmation-outline"
              title={perks?.find((p) => p.id === v.perkId)?.title[language] ?? v.code}
              subtitle={`${v.code} · ${t(`rewards.voucher.status.${v.status}`)}`}
              onPress={() =>
                router.push({ pathname: '/resident/rewards/voucher/[id]', params: { id: v.id } })
              }
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Each button is as wide as its words need; the second drops to its own row when they are long.
  action: { flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: '100%' },
  section: { gap: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  day: { alignItems: 'center', gap: spacing.xs, minWidth: 64 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { fontFamily: fonts.semibold, textAlign: 'center' },
  ways: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  way: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 140,
    minWidth: 0,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.mintEdge,
    backgroundColor: colors.surface,
  },
  list: { gap: 0, paddingVertical: spacing.xs },
  // What happened and its points share a line; the points go under it when they do not fit.
  entry: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.md,
    paddingVertical: spacing.sm,
  },
  entryLine: { borderTopWidth: 1, borderTopColor: colors.border },
  entryText: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
  points: { fontFamily: fonts.bold, marginLeft: 'auto' },
});
