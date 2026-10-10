import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import type { PointsSummary } from '@/services/types';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

import { formatPoints } from '../format';
import { tierFor } from '../points';

interface PointsCardProps {
  summary: PointsSummary;
  /** Buttons under the number (Redeem, How it works). */
  children?: ReactNode;
}

/** The green card with the resident's Eco Points and how far the next tier is. */
export function PointsCard({ summary, children }: PointsCardProps) {
  const { t } = useTranslation();
  const { tier, next, toNext, progress } = tierFor(summary.lifetime, summary.rules.tiers);
  const tierLine = next
    ? t('rewards.toNextTier', {
        points: formatPoints(toNext),
        tier: t(`rewards.tier.${next.id}`),
      })
    : t('rewards.topTier', { tier: t(`rewards.tier.${tier.id}`) });

  return (
    <Card variant="hero">
      <View
        accessible
        accessibilityLabel={`${t('rewards.yourPoints')}: ${t('rewards.pointsCount', { count: summary.balance, points: formatPoints(summary.balance) })}. ${tierLine}`}
        style={styles.block}
      >
        <AppText variant="label" color={colors.textOnDark}>
          {t('rewards.yourPoints')}
        </AppText>
        <View style={styles.number}>
          <AppText variant="display" color={colors.textOnDark} style={styles.balance}>
            {formatPoints(summary.balance)}
          </AppText>
          <AppText variant="bodyStrong" color={colors.textOnDark}>
            {t('rewards.pts')}
          </AppText>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <View style={styles.under}>
          <AppText variant="caption" color={colors.textOnDark} style={styles.tierLine}>
            {tierLine}
          </AppText>
          <AppText variant="caption" color={colors.textOnDark} style={styles.tierName}>
            {t(`rewards.tier.${tier.id}`)}
          </AppText>
        </View>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xs },
  number: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.xs },
  balance: { fontFamily: fonts.extrabold, fontSize: 44, lineHeight: 50 },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.mint },
  under: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  tierLine: { flexShrink: 1 },
  tierName: { fontFamily: fonts.bold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
