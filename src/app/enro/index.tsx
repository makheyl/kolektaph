import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import type { MapTruck } from '@/components/map/types';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { ALERT_META } from '@/features/alerts/alertMeta';
import { AlertsPanel } from '@/features/enro/components/AlertsPanel';
import { KpiTile } from '@/features/enro/components/KpiTile';
import { LoadPanel } from '@/features/enro/components/LoadPanel';
import { MissedPanel } from '@/features/enro/components/MissedPanel';
import { Panel } from '@/features/enro/components/Panel';
import { percent } from '@/features/enro/format';
import {
  useAlerts,
  useBarangays,
  useCityMeta,
  useOps,
  useRoutes,
  useTrucks,
} from '@/features/tracking/hooks';
import { buildRoutePreview } from '@/features/tracking/routePreview';
import { formatClock, manilaParts, manilaStartOfDay } from '@/lib/time';
import { colors, radius, spacing } from '@/theme/tokens';

const TWO_COLUMNS = 1200;

/** City ENRO Live Operations (pitch slide 14): fleet map, load, alerts, missed streets. */
export default function LiveOperations() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;

  const ops = useOps();
  const alerts = useAlerts();
  const { data: trucks = [] } = useTrucks();
  const { data: routes = [] } = useRoutes();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const [chosen, setChosen] = useState<string | null>(null);

  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;

  if (!ops || !barangays || !meta)
    return (
      <Screen width="dashboard" safeTop={false}>
        {null}
      </Screen>
    );

  const now = ops.at;
  const today = manilaStartOfDay(now);
  const working = ops.states.filter((s) => s.status !== 'off_duty' && s.position);
  const selectedId = chosen ?? working[0]?.truckId ?? null;
  const selected = working.find((s) => s.truckId === selectedId);
  const selectedRoute = routes.find((r) => r.id === selected?.routeId);
  const preview =
    selected && selectedRoute ? buildRoutePreview(selectedRoute, selected, now) : null;

  const mapTrucks: MapTruck[] = working.flatMap((s) => {
    const tr = trucks.find((x) => x.id === s.truckId);
    return tr
      ? [{ id: tr.id, code: tr.code, name: tr.name, status: s.status, position: s.position! }]
      : [];
  });
  const todaysRoutes = routes.filter((r) =>
    working.some((s) => s.routeId === r.id && s.truckId !== selectedId),
  );

  const todaysAlerts = alerts.filter((a) => a.sentAt >= today);
  const smsToday = todaysAlerts.reduce((sum, a) => sum + a.recipients * a.segments, 0);
  const onRoute = working.filter((s) => s.status === 'on_route').length;
  const { weekday } = manilaParts(now);

  const mapPanel = (
    <Panel title={t('enro.live.mapTitle')}>
      <View style={[styles.map, { height: wide ? 520 : 400 }]}>
        <KMap
          barangays={barangays}
          meta={meta}
          trucks={mapTrucks}
          routes={todaysRoutes}
          routePreview={preview}
          selectedTruckId={selectedId}
          onTruckPress={setChosen}
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('map.a11yLabel', { count: mapTrucks.length })}
        />
      </View>
    </Panel>
  );

  const recentSms = (
    <Panel
      title={t('enro.live.recentSms')}
      action={{ label: t('enro.live.seeAllSms'), onPress: () => router.navigate('/enro/sms') }}
    >
      {todaysAlerts.slice(0, 5).map((a) => (
        <View key={a.id} style={styles.smsRow}>
          <Icon name={ALERT_META[a.kind].icon} size={20} color={ALERT_META[a.kind].color} />
          <View style={styles.flex}>
            <AppText variant="label">
              {t(`alert.kind.${a.kind}`)} · {a.barangayIds.map(nameOf).join(', ')}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {formatClock(a.sentAt)} · {a.recipients}
            </AppText>
          </View>
        </View>
      ))}
    </Panel>
  );

  const week = (
    <Panel title={t('enro.live.weekTitle')}>
      <View style={styles.weekRow}>
        <View style={styles.weekItem}>
          <AppText variant="title">{ops.weekly.tonnes}</AppText>
          <AppText variant="label" color={colors.textMuted}>
            {t('enro.live.tonnes')}
          </AppText>
        </View>
        <View style={styles.weekItem}>
          <AppText variant="title">{ops.weekly.trips}</AppText>
          <AppText variant="label" color={colors.textMuted}>
            {t('enro.live.trips')}
          </AppText>
        </View>
        <View style={styles.weekItem}>
          <AppText variant="title">{percent(ops.weekly.servedRate)}</AppText>
          <AppText variant="label" color={colors.textMuted}>
            {t('enro.live.served')}
          </AppText>
        </View>
      </View>
    </Panel>
  );

  const alertsPanel = <AlertsPanel ops={ops} trucks={trucks} nameOf={nameOf} />;
  const missedPanel = <MissedPanel missed={ops.missed} trucks={trucks} nameOf={nameOf} />;
  const loadPanel = (
    <LoadPanel
      states={ops.states}
      trucks={trucks}
      nameOf={nameOf}
      selectedTruckId={selectedId}
      onSelect={setChosen}
    />
  );

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.live.title')}
        </AppText>
        <AppText color={colors.textMuted}>
          {t('enro.live.subtitle', { weekday: t(`weekday.${weekday}`), time: formatClock(now) })}
        </AppText>
        <SampleDataBadge />
      </View>

      <View style={styles.kpis}>
        <KpiTile
          icon="truck-fast"
          label={t('enro.live.kpiOnRoute')}
          value={`${onRoute}/${working.length}`}
        />
        <KpiTile
          icon="message-text"
          label={t('enro.live.kpiSmsToday')}
          value={smsToday.toLocaleString('en-PH')}
        />
        <KpiTile
          icon="map-marker-remove"
          label={t('enro.live.kpiMissed')}
          value={String(ops.missed.length)}
          alert={ops.missed.length > 0}
        />
        <KpiTile
          icon="check-decagram"
          label={t('enro.live.kpiServed')}
          value={percent(ops.weekly.servedRate)}
        />
      </View>

      {wide ? (
        <View style={styles.columns}>
          <View style={styles.mainCol}>
            {mapPanel}
            {loadPanel}
          </View>
          <View style={styles.sideCol}>
            {alertsPanel}
            {missedPanel}
            {week}
            {recentSms}
          </View>
        </View>
      ) : (
        <>
          {alertsPanel}
          {mapPanel}
          {loadPanel}
          {missedPanel}
          {week}
          {recentSms}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  mainCol: { flex: 3, gap: spacing.lg, minWidth: 0 },
  sideCol: { flex: 2, gap: spacing.lg, minWidth: 0 },
  map: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  smsRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  weekRow: { flexDirection: 'row', gap: spacing.md },
  weekItem: { flex: 1, gap: 2 },
});
