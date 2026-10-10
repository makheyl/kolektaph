import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandMark, DriverWordmark } from '@/components/brand/Brand';
import { KMap } from '@/components/map/KMap';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { DriverTile } from '@/features/driver/components/DriverTile';
import { useShiftStatus } from '@/features/driver/components/DriverTopBar';
import { formatShiftDuration } from '@/features/driver/format';
import { UndoToast } from '@/features/driver/components/UndoToast';
import { reportedLoad } from '@/features/driver/load';
import { driverStreets, streetProgress } from '@/features/driver/streets';
import { truckTasks } from '@/features/driver/tasks';
import { useTickets } from '@/features/reports/hooks';
import { ShortcutGrid } from '@/features/resident/components/ShortcutGrid';
import { routeRunsOnDay } from '@/features/schedule/collections';
import { percent } from '@/features/enro/format';
import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import { buildRoutePreview } from '@/features/tracking/routePreview';
import {
  useBarangays,
  useCityMeta,
  useRouteSchedules,
  useRoutes,
  useScheduleExceptions,
  useSimNow,
  useTrucks,
} from '@/features/tracking/hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pointsBounds } from '@/lib/geo';
import { useIsOnline } from '@/lib/network';
import { useWebTitle } from '@/lib/webTitle';
import { atManilaTime, formatClock } from '@/lib/time';
import type { DriverStatus, TruckEventInput } from '@/services/types';
import { type ActiveShift, useDriver, useDriverLive } from '@/stores/driver';
import { colors, layout, radius, shadows, spacing, touch } from '@/theme/tokens';

/** How far the route card reaches up over the map, as on the design. */
const MAP_OVERLAP = 56;

/**
 * The driver's Home, as in the design: the logo and a greeting, today's route on a map with a
 * card over it (Start Shift before the shift; the map and the load during it), and the round
 * shortcuts. During a shift the truck's status and the status buttons follow. Works without
 * signal: reports queue up.
 */
export default function DriverShift() {
  const { t } = useTranslation();
  const session = useDriver((s) => s.session);
  const shift = useDriver((s) => s.shift);
  const signOut = useDriver((s) => s.signOut);
  const outbox = useDriver((s) => s.outbox);
  const report = useDriver((s) => s.report);
  const truck = useDriverLive((s) => s.truck);
  const now = useSimNow();
  const online = useIsOnline();
  const { data: trucks = [] } = useTrucks();
  const { data: routes = [] } = useRoutes();
  const { data: schedules = [] } = useRouteSchedules();
  const { data: exceptions = [] } = useScheduleExceptions();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const [last, setLast] = useState<{ id: string; label: string } | null>(null);
  const tickets = useTickets();
  const gpsOk = useDriverLive((s) => s.gpsOk);
  const restartGps = useDriverLive((s) => s.requestGpsRestart);

  const truckId = shift?.truckId ?? session?.truckId ?? null;
  // Before the shift: the route this truck runs today. During it: the route the shift started on.
  const schedule = schedules.find(
    (sc) => sc.truckId === truckId && routeRunsOnDay(sc, now, exceptions).runs,
  );
  const route = routes.find((r) => r.id === (shift ? shift.routeId : schedule?.routeId));
  const streets = useMemo(() => (route ? driverStreets(route) : []), [route]);
  const routeBounds = useMemo(
    () => (route ? pointsBounds(route.segments.flatMap((sg) => sg.coordinates)) : null),
    [route],
  );

  if (!truckId) return <Redirect href="/driver/sign-in" />;
  if (shift && shift.endedAt != null) return <Redirect href="/driver/end" />;

  const onShift = shift != null;
  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';
  const status = truck?.status ?? 'not_started';
  const look = TRUCK_STATUS_META[status];

  // The phone's own reports decide the sub-steps (e.g. arrived at the tapunan).
  const events = outbox.map((o) => o.event);
  const tasks = truckTasks(tickets, truckId, events);
  const lastMove = events.findLast((e) => e.kind === 'status' || e.kind === 'disposal');
  const atDisposal = lastMove?.kind === 'disposal' && lastMove.action === 'arrive';
  const fullReport = outbox.findLast((o) => o.event.kind === 'status' && o.event.status === 'full');
  // The crew's own last word on the load; the route's estimate until they make one.
  const ownLoad = reportedLoad(events);
  const loadFraction = Math.min(1, Math.max(0, ownLoad ?? truck?.load ?? 0));

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

  const tr = trucks.find((x) => x.id === truckId);
  // A long route is named by its first and last barangay, so the card's title stays short.
  const stops = route ? route.barangayIds.map(nameOf) : [];
  const routeName =
    stops.length > 2 ? `${stops[0]} → ${stops[stops.length - 1]}` : stops.join(' → ');

  // The line under the route's name: what the truck is doing, or today's hours before the shift.
  const cardLine = onShift
    ? `${t('driver.shift.onShift', { duration: formatShiftDuration(now - shift.startedAt) })}${lines[0] ? ` · ${lines[0]}` : ''}`
    : schedule
      ? `${t('driver.home.noShift')} · ${formatClock(atManilaTime(now, schedule.start))} – ${formatClock(atManilaTime(now, schedule.windowEnd))}`
      : t('driver.home.noRouteToday');

  return (
    <View style={styles.fill}>
      <Screen
        header={
          <HomeBar
            name={tr?.name ?? ''}
            online={online}
            onlineLabel={t(online ? 'driver.start.online' : 'driver.start.offline')}
            greeting={t('driver.home.greeting', { name: tr?.name ?? '' })}
          />
        }
      >
        {onShift ? <ShiftChips shift={shift} gpsOk={gpsOk} /> : null}
        {onShift && !gpsOk ? (
          <Notice tone="warning" icon="crosshairs-off" live="assertive">
            <AppText variant="bodyStrong">{t('driver.shift.gpsStopped')}</AppText>
            <Button
              variant="primary"
              icon="crosshairs-gps"
              label={t('driver.shift.restartGps')}
              onPress={restartGps}
            />
          </Notice>
        ) : null}

        {/* The map, with the route card laid over its lower edge. */}
        <View>
          {barangays && meta ? (
            <KMap
              barangays={barangays}
              meta={meta}
              trucks={
                truck?.position
                  ? [
                      {
                        id: truckId,
                        code: tr?.code ?? '',
                        name: tr?.name ?? '',
                        status,
                        position: truck.position,
                      },
                    ]
                  : []
              }
              routes={route && !onShift ? [route] : undefined}
              routePreview={
                route && truck && onShift ? buildRoutePreview(route, truck, now, 4) : null
              }
              selectedTruckId={truckId}
              fitBounds={route && routeBounds ? { bounds: routeBounds, key: route.id } : null}
              style={styles.map}
              accessibilityLabel={t('driver.shift.map')}
            />
          ) : (
            <View style={styles.map} />
          )}
          <View style={styles.routeCard}>
            <AppText variant="heading">
              {[routeName, tr?.name].filter(Boolean).join(' · ') || t('driver.shift.noRoute')}
            </AppText>
            <View style={styles.dotRow}>
              <View style={[styles.dot, { backgroundColor: onShift ? look.color : colors.grey }]} />
              <AppText color={colors.textMuted} style={styles.flex}>
                {cardLine}
              </AppText>
            </View>
            <View style={styles.actions}>
              <View style={styles.action}>
                {onShift ? (
                  <Button
                    icon="map-outline"
                    label={t('driver.shift.openMap')}
                    onPress={() => router.push('/driver/map')}
                  />
                ) : (
                  <Button
                    icon="play-circle"
                    label={t('driver.home.start')}
                    onPress={() => router.push('/driver/start')}
                  />
                )}
              </View>
              <View style={styles.action}>
                {onShift ? (
                  <Button
                    variant="secondary"
                    icon="gauge"
                    label={t('driver.shift.openLoad')}
                    onPress={() => router.push('/driver/load')}
                  />
                ) : (
                  <Button
                    variant="secondary"
                    label={t('driver.home.cancel')}
                    accessibilityHint={t('driver.more.signOut')}
                    onPress={() => {
                      signOut();
                      router.replace('/driver/sign-in');
                    }}
                  />
                )}
              </View>
            </View>
          </View>
        </View>

        {/* The round shortcuts of the design. The shift ones wait for the shift to start. */}
        <ShortcutGrid
          items={[
            onShift
              ? {
                  key: 'end',
                  icon: 'stop-circle-outline',
                  label: t('driver.home.tileEnd'),
                  onPress: () => router.push('/driver/end'),
                }
              : {
                  key: 'start',
                  icon: 'routes',
                  label: t('driver.home.tileStart'),
                  onPress: () => router.push('/driver/start'),
                },
            {
              key: 'map',
              icon: 'map-marker-path',
              label: t('driver.home.tileMap'),
              disabled: !onShift,
              onPress: () => router.push('/driver/map'),
            },
            {
              key: 'load',
              icon: 'truck-outline',
              label: t('driver.home.tileLoad'),
              badge: onShift ? percent(loadFraction) : null,
              disabled: !onShift,
              onPress: () => router.push('/driver/load'),
            },
            {
              key: 'tasks',
              icon: 'trash-can-outline',
              label: t('driver.home.tileTasks'),
              badge: tasks.length ? String(tasks.length) : null,
              badgeLabel: tasks.length ? t('driver.tasks.count', { count: tasks.length }) : null,
              disabled: !onShift,
              onPress: () => router.push('/driver/tasks'),
            },
            {
              key: 'streets',
              icon: 'map-marker-distance',
              label: t('driver.home.tileStreets'),
              badge: onShift && route ? `${passed}/${streets.length}` : null,
              badgeLabel:
                onShift && route
                  ? t('driver.shift.streets', { done: passed, total: streets.length })
                  : null,
              disabled: !onShift,
              onPress: () => router.push('/driver/streets'),
            },
            {
              key: 'more',
              icon: 'dots-horizontal',
              label: t('driver.home.tileMore'),
              onPress: () => router.push('/driver/more'),
            },
          ]}
        />
        {onShift ? null : (
          <AppText variant="label" color={colors.textMuted} style={styles.center}>
            {t('driver.home.startFirst')}
          </AppText>
        )}

        {onShift ? (
          <>
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
                <AppText variant="title" color={look.color} style={styles.bannerTitle}>
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
              <AppText variant="heading" accessibilityRole="header">
                {t('driver.shift.statusTitle')}
              </AppText>
              <View style={styles.tiles}>
                <DriverTile
                  icon="truck-fast"
                  label={t('driver.shift.buttons.on_route')}
                  selected={status === 'on_route'}
                  tone={colors.primary}
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
          </>
        ) : null}

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

/** The mint bar of the driver's Home: the logo, "KolektaPH Driver", a greeting, and the signal. */
function HomeBar({
  name,
  greeting,
  online,
  onlineLabel,
}: {
  name: string;
  greeting: string;
  online: boolean;
  onlineLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  useWebTitle(t('driver.tabs.home'));
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}>
      <BrandMark height={40} />
      <View style={styles.flex}>
        <DriverWordmark />
        {name ? (
          <AppText variant="caption" color={colors.textMuted}>
            {greeting}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.pill, !online && styles.pillOff]}>
        <AppText variant="label" color={online ? colors.textOnDark : colors.ink}>
          {onlineLabel}
        </AppText>
      </View>
    </View>
  );
}

/** During a shift: the phone's GPS and uploads in words. Opens the GPS log. */
function ShiftChips({ shift, gpsOk }: { shift: ActiveShift; gpsOk: boolean }) {
  const { t } = useTranslation();
  const { gps, upload } = useShiftStatus(shift, gpsOk);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${gps.label}. ${upload.label}. ${t('driver.shift.gpsLog')}`}
      onPress={() => router.push('/driver/gps')}
      style={styles.chips}
    >
      {[gps, upload].map((c) => (
        <View key={c.icon} style={[styles.chip, c.warn && styles.chipWarn]}>
          <Icon name={c.icon} size={20} color={colors.ink} />
          <AppText variant="label" color={colors.ink} style={styles.chipText}>
            {c.label}
          </AppText>
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.page },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  bannerTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 120 },
  banner: { borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  bannerIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.mint,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  pillOff: { backgroundColor: colors.yellow },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mintEdge,
  },
  chipWarn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  chipText: { flexShrink: 1 },
  map: {
    height: 240,
    width: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.greySoft,
  },
  routeCard: {
    marginTop: -MAP_OVERLAP,
    marginHorizontal: spacing.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.raised,
  },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 130, minWidth: 0 },
  block: { gap: spacing.sm },
  // Side by side on a phone; one under the other when the screen is narrow or the letters large.
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
