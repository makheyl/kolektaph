import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { ENTRY_ICONS, formatPoints } from '@/features/rewards/format';
import { usePoints } from '@/features/rewards/hooks';
import { goBack } from '@/lib/navigation';
import type { PointsEarnKind } from '@/services/types';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const WAYS: PointsEarnKind[] = [
  'valid_report',
  'pickup_confirmed',
  'segregation_check',
  'cleanup_drive',
  'week_complete',
];

/** How Eco Points work: each way to earn, what they can be spent on, and the tiers. */
export default function HowPointsWork() {
  const { t } = useTranslation();
  const summary = usePoints();

  const header = (
    <AppHeader
      title={t('rewards.howItWorks')}
      leading={
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => goBack('/resident/rewards')}
        />
      }
    />
  );

  if (!summary) {
    return (
      <Screen header={header}>
        <SkeletonGroup>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </SkeletonGroup>
      </Screen>
    );
  }
  const { rules } = summary;

  return (
    <Screen header={header}>
      <SampleDataBadge />
      <AppText>{t('rewards.how.intro')}</AppText>

      <Card>
        <AppText variant="heading" color={colors.primary} accessibilityRole="header">
          {t('rewards.waysToEarn')}
        </AppText>
        {WAYS.map((kind) => (
          <View key={kind} style={styles.row}>
            <View style={styles.icon} aria-hidden>
              <Icon name={ENTRY_ICONS[kind]} size={22} color={colors.primary} />
            </View>
            <View style={styles.text}>
              <AppText variant="bodyStrong">
                {t(`rewards.earn.${kind}`)} ·{' '}
                {t('rewards.plusPoints', { points: formatPoints(rules.earn[kind]) })}
              </AppText>
              <AppText variant="label" color={colors.textMuted}>
                {t(`rewards.how.${kind}`)}
              </AppText>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <AppText variant="heading" color={colors.primary} accessibilityRole="header">
          {t('rewards.how.spendTitle')}
        </AppText>
        <AppText>{t('rewards.how.spendPerks')}</AppText>
        <AppText>
          {t('rewards.how.spendHauling', { pesos: formatPoints(rules.pesosPer100) })}
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading" color={colors.primary} accessibilityRole="header">
          {t('rewards.how.tiersTitle')}
        </AppText>
        <AppText>{t('rewards.how.tiers')}</AppText>
        {rules.tiers.map((tier) => (
          <View key={tier.id} style={styles.tier}>
            <AppText variant="bodyStrong" style={styles.tierName}>
              {t(`rewards.tier.${tier.id}`)}
            </AppText>
            <AppText variant="label" color={colors.textMuted}>
              {t('rewards.how.tierFrom', { points: formatPoints(tier.from) })}
            </AppText>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: 2 },
  tier: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tierName: { fontFamily: fonts.bold },
});
