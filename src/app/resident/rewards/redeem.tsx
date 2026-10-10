import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { Skeleton, SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { PointsCard } from '@/features/rewards/components/PointsCard';
import { formatPoints, PERK_ICONS } from '@/features/rewards/format';
import { usePerks, usePoints } from '@/features/rewards/hooks';
import { goBack } from '@/lib/navigation';
import { OfflineError, services } from '@/services';
import type { Perk, PerkGroup } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type Filter = 'all' | PerkGroup;
const FILTERS: Filter[] = ['all', 'bills', 'stores', 'city'];

/** The Redemption Center: what Eco Points can be exchanged for. */
export default function RedemptionCenter() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const summary = usePoints();
  const perks = usePerks();
  const [filter, setFilter] = useState<Filter>('all');
  /** The perk waiting for "yes": exchanging points cannot be undone, so it is asked first. */
  const [asking, setAsking] = useState<Perk | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'offline' | 'points' | 'other' | null>(null);

  const header = (
    <AppHeader
      title={t('rewards.redeemTitle')}
      leading={
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => goBack('/resident/rewards')}
        />
      }
    />
  );

  if (!summary || !perks) {
    return (
      <Screen header={header}>
        <SkeletonGroup>
          <Skeleton height={140} round={radius.lg} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const shown = perks.filter((p) => filter === 'all' || p.group === filter);

  const redeem = async (perk: Perk) => {
    setBusy(true);
    setFailed(null);
    try {
      const voucher = await services.rewards.redeem(perk.id);
      setAsking(null);
      router.push({ pathname: '/resident/rewards/voucher/[id]', params: { id: voucher.id } });
    } catch (e) {
      setFailed(
        e instanceof OfflineError
          ? 'offline'
          : e instanceof Error && e.message === 'not_enough_points'
            ? 'points'
            : 'other',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={header}>
      <SampleDataBadge />
      <PointsCard summary={summary} />

      <View style={styles.filters} accessibilityLabel={t('rewards.perks')}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={t(`rewards.group.${f}`)}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      <AppText variant="heading" accessibilityRole="header">
        {t('rewards.perks')}
      </AppText>

      {shown.length === 0 ? <EmptyState icon="gift-outline" title={t('rewards.noPerks')} /> : null}

      {shown.map((perk) => {
        const short = perk.cost - summary.balance;
        return (
          <View key={perk.id} style={styles.perk}>
            <View style={styles.perkIcon} aria-hidden>
              <Icon name={PERK_ICONS[perk.group]} size={30} color={colors.primary} />
            </View>
            <View style={styles.perkText}>
              <AppText variant="bodyStrong" color={colors.primary}>
                {perk.title[language]}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {perk.partner}
                {perk.sample ? ` · ${t('rewards.samplePerk')}` : ''}
              </AppText>
              <AppText variant="label" style={styles.cost}>
                {t('rewards.cost', { points: formatPoints(perk.cost) })}
              </AppText>
            </View>
            <View style={styles.perkAction}>
              {asking?.id === perk.id ? null : short > 0 ? (
                <View style={styles.short}>
                  <AppText variant="label" color={colors.textMuted} style={styles.shortText}>
                    {t('rewards.needMore', { points: formatPoints(short) })}
                  </AppText>
                </View>
              ) : (
                <Button
                  size="compact"
                  label={t('rewards.redeem')}
                  accessibilityHint={perk.title[language]}
                  onPress={() => {
                    setFailed(null);
                    setAsking(perk);
                  }}
                />
              )}
            </View>
            {asking?.id === perk.id ? (
              // Inline confirmation: works the same on web, where native alert dialogs don't.
              <View style={styles.ask}>
                <Notice tone="info" icon="gift-outline" live="polite">
                  <AppText variant="bodyStrong">
                    {t('rewards.confirmTitle', { points: formatPoints(perk.cost) })}
                  </AppText>
                  <AppText variant="label" color={colors.textMuted}>
                    {t('rewards.confirmBody')}
                  </AppText>
                  <Button
                    icon="check"
                    label={t('rewards.confirmYes')}
                    loading={busy}
                    onPress={() => void redeem(perk)}
                  />
                  <Button
                    variant="secondary"
                    label={t('common.cancel')}
                    onPress={() => setAsking(null)}
                  />
                  {failed ? (
                    <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
                      {t(`rewards.failed.${failed}`)}
                    </AppText>
                  ) : null}
                </Notice>
              </View>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  perk: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.mintEdge,
    backgroundColor: colors.mintSoft,
  },
  perkIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0, gap: 2 },
  cost: { fontFamily: fonts.bold },
  perkAction: { flexShrink: 0, maxWidth: '100%' },
  short: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.greySoft,
  },
  shortText: { fontFamily: fonts.semibold },
  ask: { flexBasis: '100%' },
});
