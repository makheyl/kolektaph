import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useNarrow } from '@/components/ui/narrow';
import { IconButton } from '@/components/ui/IconButton';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Skeleton, SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { byBarangay, summarize } from '@/features/stats/history';
import { useDailyStats } from '@/features/stats/hooks';
import { useBarangays, useMissedStreets, useSimNow } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { DAY, manilaParts, manilaStartOfDay } from '@/lib/time';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type Period = 'week' | 'month';
const DAYS: Record<Period, number> = { week: 7, month: 30 };
/** The ranking shows the barangays served most on time; the rest are a tap away in the City's reports. */
const TOP = 5;

const percent = (rate: number | null) => (rate == null ? '—' : `${Math.round(rate * 100)}%`);

/** A ring filled to `rate` (0 to 1). Decoration: the number beside it says the same. */
function Ring({ rate }: { rate: number }) {
  // Small enough to sit beside the number in a half-width card on a phone.
  const size = 48;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const around = 2 * Math.PI * r;
  return (
    <View aria-hidden>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.mint}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${around * Math.min(1, Math.max(0, rate))} ${around}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
}

/**
 * City Impact: how collection went across Carmona, from the same figures as the City ENRO
 * statistics (the truck log and the GPS check). Tonnes are estimates and say so.
 */
export default function CityImpact() {
  const { t } = useTranslation();
  const narrow = useNarrow();
  const now = useSimNow(60_000);
  const [period, setPeriod] = useState<Period>('week');
  const today = manilaStartOfDay(now);
  const from = today - (DAYS[period] - 1) * DAY;
  const { data: stats } = useDailyStats(from, today, now);
  const { data: missed } = useMissedStreets(today);
  const { data: barangays } = useBarangays();
  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;

  const header = (
    <AppHeader
      title={t('impact.title')}
      leading={
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => goBack('/resident')}
        />
      }
    />
  );
  const switcher = (
    <SegmentedTabs
      variant="pill"
      fill
      label={t('impact.period')}
      tabs={[
        { id: 'week', label: t('impact.week') },
        { id: 'month', label: t('impact.month') },
      ]}
      value={period}
      onChange={setPeriod}
    />
  );

  if (!stats) {
    return (
      <Screen header={header}>
        {switcher}
        <SkeletonGroup>
          <Skeleton height={112} round={radius.lg} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const total = summarize(stats, now);
  // Tonnes per weekday (Monday first), so a week and a month read the same way.
  const perWeekday = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    tonnes: stats.runs
      .filter((r) => manilaParts(r.day).weekday === weekday)
      .reduce((sum, r) => sum + r.tonnes, 0),
  }));
  const most = Math.max(1, ...perWeekday.map((d) => d.tonnes));
  const todayWeekday = manilaParts(now).weekday;
  const ranking = byBarangay(stats, now)
    .filter((b) => b.decided > 0)
    .map((b) => ({ ...b, rate: b.onTime / b.decided }))
    .sort((a, b) => b.rate - a.rate || a.barangayId.localeCompare(b.barangayId))
    .slice(0, TOP);

  return (
    <Screen header={header}>
      {switcher}
      <SampleDataBadge />

      <Card variant="hero" style={styles.hero}>
        <View style={styles.heroText}>
          <AppText variant="label" color={colors.textOnDark}>
            {t('impact.collected')}
          </AppText>
          <AppText variant="display" color={colors.textOnDark}>
            {t('impact.tonnes', { tonnes: total.tonnes })}
          </AppText>
          <AppText variant="caption" color={colors.textOnDark}>
            {t('impact.estimate', { trips: total.trips })}
          </AppText>
        </View>
        <View aria-hidden>
          <Icon name="truck" size={56} color={colors.mint} />
        </View>
      </Card>

      <View style={styles.pair}>
        <Card style={styles.half}>
          <AppText variant="bodyStrong">{t('impact.served')}</AppText>
          <View style={styles.rate}>
            <AppText variant="display" color={colors.primary}>
              {percent(total.servedRate)}
            </AppText>
            <Ring rate={total.servedRate ?? 0} />
          </View>
          <AppText variant="caption" color={colors.textMuted}>
            {t('impact.servedHint')}
          </AppText>
        </Card>
        <Card style={styles.half}>
          <AppText variant="bodyStrong">{t('impact.missed')}</AppText>
          <AppText variant="display" color={colors.primary}>
            {missed ? missed.length : '—'}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t('impact.missedHint')}
          </AppText>
        </Card>
      </View>

      <Card>
        <AppText variant="bodyStrong" accessibilityRole="header">
          {t('impact.perDay')}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {t('impact.perDayHint')}
        </AppText>
        <View style={styles.bars}>
          {perWeekday.map((d) => (
            <View
              key={d.weekday}
              style={styles.barColumn}
              accessible
              accessibilityLabel={`${t(`weekday.${d.weekday}`)}: ${t('impact.tonnes', { tonnes: Math.round(d.tonnes * 10) / 10 })}`}
            >
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.max(4, Math.round((d.tonnes / most) * 100))}%` },
                    d.weekday === todayWeekday && styles.barToday,
                  ]}
                />
              </View>
              <AppText variant="caption" color={colors.primary} style={styles.barLabel}>
                {t(`weekday.${d.weekday}`).slice(0, 3)}
              </AppText>
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          <View style={[styles.swatch, styles.barToday]} />
          <AppText variant="caption" color={colors.textMuted}>
            {t('impact.todayLegend')}
          </AppText>
        </View>
      </Card>

      <Card>
        <AppText variant="bodyStrong" accessibilityRole="header">
          {t('impact.ranking')}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {t('impact.rankingHint')}
        </AppText>
        {ranking.length === 0 ? (
          <EmptyState icon="chart-bar" title={t('impact.noData')} />
        ) : (
          ranking.map((b, i) => (
            <View
              key={b.barangayId}
              style={[styles.rank, i > 0 && styles.rankLine]}
              accessible
              accessibilityLabel={`${i + 1}. ${nameOf(b.barangayId)}: ${t('impact.onTime', { rate: percent(b.rate) })}`}
            >
              {narrow ? null : (
                <View style={styles.rankTag}>
                  <AppText variant="label" color={colors.textOnDark} style={styles.rankNumber}>
                    {i + 1}
                  </AppText>
                </View>
              )}
              <View style={styles.rankText}>
                {/* On a very narrow screen the place is written before the name. */}
                <AppText variant="label">
                  {narrow ? `${i + 1}. ` : ''}
                  {nameOf(b.barangayId)}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {t('impact.onTime', { rate: percent(b.rate) })}
                </AppText>
                <View style={styles.rankTrack}>
                  <View style={[styles.rankFill, { width: `${Math.round(b.rate * 100)}%` }]} />
                </View>
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  heroText: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: 2 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  half: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0, gap: spacing.xs },
  rate: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, height: 140 },
  barColumn: { flex: 1, minWidth: 0, height: '100%', alignItems: 'center', gap: spacing.xs },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm, backgroundColor: colors.mint },
  barToday: { backgroundColor: colors.primary },
  barLabel: { fontFamily: fonts.semibold },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  rank: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  rankLine: { borderTopWidth: 1, borderTopColor: colors.border },
  rankTag: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: { fontFamily: fonts.bold },
  rankText: { flex: 1, minWidth: 0, gap: 2 },
  rankTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.greySoft,
    overflow: 'hidden',
  },
  rankFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
});
