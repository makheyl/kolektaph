import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { BarRow } from '@/features/enro/components/BarRow';
import { KpiTile } from '@/features/enro/components/KpiTile';
import { Panel } from '@/features/enro/components/Panel';
import { percent } from '@/features/enro/format';
import { useTickets } from '@/features/reports/hooks';
import { formatDate } from '@/features/resident/format';
import {
  byBarangay,
  coverageByDay,
  statsCsv,
  summarize,
  ticketsByCategory,
} from '@/features/stats/history';
import { useDailyStats } from '@/features/stats/hooks';
import { useBarangays, useSimNow, useTrucks } from '@/features/tracking/hooks';
import { saveTextFile } from '@/lib/download';
import { DAY, manilaDateKey, manilaStartOfDay } from '@/lib/time';
import { colors, spacing } from '@/theme/tokens';

const TWO_COLUMNS = 1100;
type Range = 7 | 28;

/**
 * City ENRO statistics (plan §6.3): tonnes per barangay, on-time rate, coverage per day,
 * "SMS before the truck", reports by type, and a CSV export. SAMPLE figures until real trip
 * logs and weighbridge data exist.
 */
export default function EnroStats() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;
  const now = useSimNow(60_000);
  const [range, setRange] = useState<Range>(7);
  const [exported, setExported] = useState<string | null>(null);
  const today = manilaStartOfDay(now);
  const from = today - (range - 1) * DAY;
  const { data: stats } = useDailyStats(from, today, now);
  const tickets = useTickets();
  const { data: barangays } = useBarangays();
  const { data: trucks = [] } = useTrucks();

  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const truckName = (id: string) => trucks.find((tr) => tr.id === id)?.name ?? id;
  const none = t('enro.stats.none');
  const pct = (x: number | null) => (x == null ? none : percent(x));

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.stats.title')}
        </AppText>
        <AppText color={colors.textMuted}>{t('enro.stats.subtitle')}</AppText>
        <SampleDataBadge />
      </View>
      <View style={styles.chips}>
        {([7, 28] as Range[]).map((r) => (
          <Chip
            key={r}
            label={t(`enro.stats.range${r}`)}
            selected={range === r}
            onPress={() => setRange(r)}
          />
        ))}
      </View>
    </View>
  );

  if (!stats || !barangays) {
    return (
      <Screen width="dashboard" safeTop={false}>
        {header}
        <AppText>{t('enro.stats.loading')}</AppText>
      </Screen>
    );
  }

  const summary = summarize(stats, now);
  const perBarangay = byBarangay(stats, now);
  const trend = coverageByDay(stats);
  const reports = ticketsByCategory(tickets, from, now);
  const maxTonnes = Math.max(1, ...perBarangay.map((b) => b.tonnes));
  const maxReports = Math.max(1, ...reports.map((r) => r.total));
  const received = reports.reduce((s, r) => s + r.total, 0);

  const exportCsv = async () => {
    const file = `kolektaph-stats-${manilaDateKey(from)}-to-${manilaDateKey(today)}.csv`;
    await saveTextFile(file, statsCsv(stats, now, { barangay: nameOf, truck: truckName }));
    setExported(file);
  };

  const kpis = (
    <View style={styles.kpis}>
      <KpiTile icon="weight" label={t('enro.stats.kpiTonnes')} value={String(summary.tonnes)} />
      <KpiTile
        icon="truck-delivery"
        label={t('enro.stats.kpiTrips')}
        value={String(summary.trips)}
      />
      <KpiTile icon="map-check" label={t('enro.stats.kpiServed')} value={pct(summary.servedRate)} />
      <KpiTile
        icon="clock-check-outline"
        label={t('enro.stats.kpiOnTime')}
        value={pct(summary.onTimeRate)}
      />
      <KpiTile
        icon="message-text-clock"
        label={t('enro.stats.kpiSms')}
        value={pct(summary.smsBeforeRate)}
      />
      <KpiTile
        icon="file-document-outline"
        label={t('enro.stats.kpiReports')}
        value={String(received)}
      />
    </View>
  );

  const left = (
    <>
      <Panel title={t('enro.stats.tonnesByBarangay')}>
        {perBarangay.length === 0 ? <AppText>{t('enro.stats.noData')}</AppText> : null}
        {perBarangay.map((b) => (
          <BarRow
            key={b.barangayId}
            label={nameOf(b.barangayId)}
            fraction={b.tonnes / maxTonnes}
            value={t('enro.stats.tonnesValue', { value: b.tonnes })}
          />
        ))}
      </Panel>
      <Panel title={t('enro.stats.onTimeByBarangay')}>
        {perBarangay
          .filter((b) => b.decided > 0)
          .map((b) => (
            <BarRow
              key={b.barangayId}
              label={nameOf(b.barangayId)}
              fraction={b.onTime / b.decided}
              color={b.onTime === b.decided ? colors.green : colors.amber}
              value={t('enro.stats.onTimeValue', { onTime: b.onTime, decided: b.decided })}
            />
          ))}
      </Panel>
    </>
  );

  const right = (
    <>
      <Panel title={t('enro.stats.coverageTrend')}>
        {trend.length === 0 ? <AppText>{t('enro.stats.noData')}</AppText> : null}
        {trend.map((d) => (
          <BarRow
            key={d.day}
            label={formatDate(t, d.day)}
            fraction={d.servedRate}
            color={d.servedRate >= 0.95 ? colors.green : colors.amber}
            value={percent(d.servedRate)}
          />
        ))}
        {summary.smsLeadMinutes != null ? (
          <AppText variant="label" color={colors.textMuted}>
            {t('enro.stats.kpiSms')}: {t('enro.stats.smsLead', { minutes: summary.smsLeadMinutes })}
          </AppText>
        ) : null}
      </Panel>
      <Panel title={t('enro.stats.reportsByType')}>
        {reports.length === 0 ? <AppText>{t('enro.stats.noReports')}</AppText> : null}
        {reports.map((r) => (
          <BarRow
            key={r.category}
            label={t(`reports.category.${r.category}`)}
            fraction={r.total / maxReports}
            color={colors.primary}
            value={t('enro.stats.reportsValue', { total: r.total, open: r.open })}
          />
        ))}
      </Panel>
      <Panel title={t('enro.stats.definitions')}>
        {(['defServed', 'defOnTime', 'defTonnes', 'defSms'] as const).map((k) => (
          <AppText key={k} variant="label" color={colors.textMuted}>
            {t(`enro.stats.${k}`)}
          </AppText>
        ))}
      </Panel>
    </>
  );

  return (
    <Screen width="dashboard" safeTop={false}>
      {header}
      {kpis}
      <View style={styles.exportRow}>
        <Button
          variant="secondary"
          icon="download"
          label={t('enro.stats.export')}
          onPress={() => void exportCsv()}
        />
        {exported ? (
          <AppText variant="label" color={colors.green} accessibilityLiveRegion="polite">
            {t('enro.stats.exported', { file: exported })}
          </AppText>
        ) : null}
      </View>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.col}>{left}</View>
          <View style={styles.col}>{right}</View>
        </View>
      ) : (
        <>
          {left}
          {right}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-end' },
  headerText: { flexGrow: 1, flexBasis: 320, gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0, gap: spacing.lg },
});
