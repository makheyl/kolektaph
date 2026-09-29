import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { DriverTile } from '@/features/driver/components/DriverTile';
import { DriverTopBar } from '@/features/driver/components/DriverTopBar';
import { UndoToast } from '@/features/driver/components/UndoToast';
import { LOAD_STEPS, loadLabel } from '@/features/driver/format';
import { driverStreets, streetProgress } from '@/features/driver/streets';
import { percent } from '@/features/enro/format';
import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import { buildRoutePreview } from '@/features/tracking/routePreview';
import {
  useBarangays,
  useCityMeta,
  useRoutes,
  useSimNow,
  useTrucks,
} from '@/features/tracking/hooks';
import { pointsBounds } from '@/lib/geo';
import { formatClock } from '@/lib/time';
import type { DriverStatus, TruckEventInput } from '@/services/types';
import { useDriver, useDriverLive } from '@/stores/driver';
import { colors, layout, radius, spacing } from '@/theme/tokens';

/**
 * Shift home: what the truck is doing now, the route, and the big buttons the crew taps
 * (load, status, incident). Works without signal: reports queue up and are sent later.
 */
export default function DriverShift() {
  const { t } = useTranslation();
  const shift = useDriver((s) => s.shift);
  const outbox = useDriver((s) => s.outbox);
  const report = useDriver((s) => s.report);
  const truck = useDriverLive((s) => s.truck);
  const now = useSimNow();
  const { data: trucks = [] } = useTrucks();
  const { data: routes = [] } = useRoutes();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const [last, setLast] = useState<{ id: string; label: string } | null>(null);
  const gpsOk = useDriverLive((s) => s.gpsOk);
  const restartGps = useDriverLive((s) => s.requestGpsRestart);

  const route = routes.find((r) => r.id === shift?.routeId);
  const streets = useMemo(() => (route ? driverStreets(route) : []), [route]);
  const routeBounds = useMemo(
    () => (route ? pointsBounds(route.segments.flatMap((s) => s.coordinates)) : null),
    [route],
  );

  if (!shift) return <Redirect href="/driver" />;
  if (shift.endedAt != null) return <Redirect href="/driver/end" />;

  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';
  const status = truck?.status ?? 'not_started';
  const look = TRUCK_STATUS_META[status];

  // The phone's own reports decide the sub-steps (e.g. arrived at the tapunan).
  const events = outbox.map((o) => o.event);
  const lastMove = events.findLast((e) => e.kind === 'status' || e.kind === 'disposal');
  const atDisposal = lastMove?.kind === 'disposal' && lastMove.action === 'arrive';
  const fullReport = outbox.findLast((o) => o.event.kind === 'status' && o.event.status === 'full');

  const tap = (input: TruckEventInput, label: string) => {
    const id = report(input, { undoable: true });
    setLast({ id, label });
  };
  const setStatus = (s: DriverStatus) => tap({ kind: 'status', status: s }, t(`truck.status.${s}`));
  const resume = () => {
    if (status === 'breakdown') report({ kind: 'incident_end' });
    else setStatus('on_route');
  };

  const progressM = truck?.progressM ?? 0;
  const passed = streets.filter((s) => streetProgress(s, progressM) === 'passed').length;
  const next = streets.find((s) => s.startM > progressM);

  const lines: string[] = [];
  if (status === 'not_started' && truck?.departAt) {
    lines.push(t('driver.shift.atDepot', { time: formatClock(truck.departAt) }));
  } else if (status === 'done') {
    lines.push(t('driver.shift.routeDone'));
  } else if (truck?.barangayId && status !== 'to_disposal') {
    lines.push(
      t('driver.shift.where', {
        street: truck.streetName ?? t('truck.unnamedRoad'),
        barangay: nameOf(truck.barangayId),
      }),
    );
    if (next) lines.push(t('driver.shift.next', { street: next.name ?? t('truck.unnamedRoad') }));
  }
  if (status === 'breakdown' && truck?.incident) {
    lines.unshift(
      t('driver.shift.incidentBody', {
        incident: t(`incident.${truck.incident.kind}`),
        time: formatClock(truck.incident.until),
      }),
    );
  }
  if (status === 'break') lines.unshift(t('driver.shift.breakBody'));
  if (status === 'to_disposal' && atDisposal) lines.unshift(t('driver.shift.disposalAt'));

  const loadSelected = (v: number) =>
    v === 1
      ? status === 'full'
      : status !== 'full' && truck?.loadReportedAt != null && Math.abs(truck.load - v) < 0.01;

  return (
    <View style={styles.fill}>
      <DriverTopBar
        truck={trucks.find((tr) => tr.id === shift.truckId)}
        shift={shift}
        now={now}
        gpsOk={gpsOk}
      />
      <Screen safeTop={false}>
        {!gpsOk ? (
          <Card style={styles.warn} accessibilityLiveRegion="assertive">
            <View style={styles.row}>
              <Icon name="crosshairs-off" size={24} color={colors.navy} />
              <AppText variant="bodyStrong">{t('driver.shift.gpsStopped')}</AppText>
            </View>
            <Button
              variant="primary"
              icon="crosshairs-gps"
              label={t('driver.shift.restartGps')}
              onPress={restartGps}
            />
          </Card>
        ) : null}

        <View
          style={[styles.banner, { backgroundColor: look.soft, borderColor: look.color }]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={[t(`truck.status.${status}`), ...lines].join('. ')}
        >
          <View style={styles.row}>
            <View style={[styles.bannerIcon, { backgroundColor: look.color }]}>
              <Icon name={look.icon} size={30} color={colors.textOnDark} />
            </View>
            <AppText variant="title" color={look.color} style={styles.flex}>
              {status === 'full' ? t('driver.shift.fullTitle') : t(`truck.status.${status}`)}
            </AppText>
          </View>
          {status === 'full' && fullReport ? (
            <AppText variant="bodyStrong">
              {fullReport.synced ? t('driver.shift.fullSent') : t('driver.shift.fullPending')}
            </AppText>
          ) : null}
          {lines.map((line) => (
            <AppText key={line}>{line}</AppText>
          ))}
        </View>

        {status === 'full' ? (
          <Button
            size="driver"
            variant="warning"
            icon="truck-delivery"
            label={t('driver.shift.goDisposal')}
            onPress={() => setStatus('to_disposal')}
          />
        ) : null}
        {status === 'to_disposal' ? (
          atDisposal ? (
            <Button
              size="driver"
              variant="success"
              icon="truck-check"
              label={t('driver.shift.disposalLeave')}
              onPress={() => report({ kind: 'disposal', action: 'leave' })}
            />
          ) : (
            <Button
              size="driver"
              variant="primary"
              icon="map-marker-check"
              label={t('driver.shift.disposalArrive')}
              onPress={() => report({ kind: 'disposal', action: 'arrive' })}
            />
          )
        ) : null}
        {status === 'breakdown' ? (
          <Button
            size="driver"
            variant="success"
            icon="check-circle"
            label={t('driver.shift.incidentResolved')}
            onPress={() => report({ kind: 'incident_end' })}
          />
        ) : null}

        <View style={styles.block}>
          <AppText variant="heading">{t('driver.shift.load')}</AppText>
          <View style={styles.tiles}>
            {LOAD_STEPS.map((v) => (
              <DriverTile
                key={v}
                compact
                label={loadLabel(t, v)}
                accessibilityLabel={t('driver.shift.loadA11y', { value: loadLabel(t, v) })}
                selected={loadSelected(v)}
                tone={v === 1 ? colors.red : colors.navy}
                onPress={() =>
                  v === 1
                    ? tap({ kind: 'status', status: 'full' }, loadLabel(t, v))
                    : tap({ kind: 'load', load: v }, `${loadLabel(t, v)} ${t('driver.shift.load')}`)
                }
              />
            ))}
          </View>
          <AppText variant="label" color={colors.textMuted}>
            {truck && truck.loadReportedAt == null && status !== 'full'
              ? t('driver.shift.loadEstimated', { value: percent(truck.load) })
              : t('driver.shift.loadHint')}
          </AppText>
        </View>

        <View style={styles.block}>
          <AppText variant="heading">{t('driver.shift.statusTitle')}</AppText>
          <View style={styles.tiles}>
            <DriverTile
              icon="truck-fast"
              label={t('driver.shift.buttons.on_route')}
              selected={status === 'on_route'}
              tone={colors.green}
              onPress={resume}
            />
            <DriverTile
              icon="truck-delivery"
              label={t('driver.shift.buttons.to_disposal')}
              selected={status === 'to_disposal'}
              tone={colors.amber}
              onPress={() => setStatus('to_disposal')}
            />
          </View>
          <View style={styles.tiles}>
            <DriverTile
              icon="coffee"
              label={t('driver.shift.buttons.break')}
              selected={status === 'break'}
              tone={colors.grey}
              onPress={() => setStatus('break')}
            />
            <DriverTile
              icon="car-wrench"
              label={t('driver.shift.buttons.incident')}
              selected={status === 'breakdown'}
              tone={colors.red}
              onPress={() => router.push('/driver/incident')}
            />
          </View>
          {truck?.trips ? (
            <AppText variant="label" color={colors.textMuted}>
              {t('driver.shift.tripsToday', { count: truck.trips })}
            </AppText>
          ) : null}
        </View>

        {route && barangays && meta ? (
          <View style={styles.block}>
            <AppText variant="heading">{t('driver.shift.map')}</AppText>
            <KMap
              barangays={barangays}
              meta={meta}
              trucks={
                truck?.position
                  ? [
                      {
                        id: shift.truckId,
                        code: trucks.find((tr) => tr.id === shift.truckId)?.code ?? '',
                        name: trucks.find((tr) => tr.id === shift.truckId)?.name ?? '',
                        status,
                        position: truck.position,
                      },
                    ]
                  : []
              }
              routePreview={truck ? buildRoutePreview(route, truck, now, 4) : null}
              selectedTruckId={shift.truckId}
              fitBounds={routeBounds ? { bounds: routeBounds, key: route.id } : null}
              style={styles.map}
              accessibilityLabel={t('driver.shift.map')}
            />
          </View>
        ) : (
          <Card>
            <AppText>{t('driver.shift.noRoute')}</AppText>
          </Card>
        )}

        <View style={styles.links}>
          {route ? (
            <ListRow
              icon="format-list-checks"
              title={t('driver.shift.streets', { done: passed, total: streets.length })}
              trailing="chevron"
              onPress={() => router.push('/driver/streets')}
            />
          ) : null}
          <ListRow
            icon="cloud-upload-outline"
            title={t('driver.shift.gpsLog')}
            trailing="chevron"
            onPress={() => router.push('/driver/gps')}
          />
          <ListRow
            icon="stop-circle-outline"
            title={t('driver.shift.endShift')}
            trailing="chevron"
            danger
            onPress={() => router.push('/driver/end')}
          />
        </View>
        {/* Room so the undo bar never covers the last row. */}
        <View style={styles.toastSpace} />
      </Screen>
      <View style={styles.toastWrap} pointerEvents="box-none">
        <View style={styles.toast} pointerEvents="box-none">
          <UndoToast last={last} onUndone={() => setLast(null)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warn: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
  banner: { borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  bannerIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: { gap: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  map: {
    height: 240,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  links: { gap: spacing.xs },
  toastSpace: { height: 72 },
  toastWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    alignItems: 'center',
  },
  toast: { width: '100%', maxWidth: layout.residentMaxWidth - 2 * spacing.lg },
});
