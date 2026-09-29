import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { LoadBar } from '@/components/ui/LoadBar';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatAgo } from '@/features/driver/format';
import { traceStats } from '@/features/driver/gpsLog';
import { Panel } from '@/features/enro/components/Panel';
import { describeEvent, eventIcon } from '@/features/enro/events';
import { formatDistance } from '@/features/enro/format';
import { useDeviceNow } from '@/features/driver/hooks';
import { buildRoutePreview } from '@/features/tracking/routePreview';
import {
  useBarangays,
  useCityMeta,
  useOps,
  useRoutes,
  useTrace,
  useTrucks,
} from '@/features/tracking/hooks';
import { type Bounds, pointsBounds } from '@/lib/geo';
import { formatClock, manilaParts } from '@/lib/time';
import type { LngLat } from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

const TWO_COLUMNS = 1100;

const overlaps = (a: Bounds, b: Bounds) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/**
 * Trucks (plan §6.3): every truck today with its driver shift, load, trips and GPS, and one
 * truck's day in detail: the route, the GPS received from the phone, and the crew's reports.
 */
export default function EnroTrucks() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;
  const ops = useOps();
  const { data: trucks = [] } = useTrucks();
  const { data: routes = [] } = useRoutes();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const deviceNow = useDeviceNow(5_000);
  const [chosen, setChosen] = useState<string | null>(null);

  const selectedId = chosen ?? ops?.shifts[ops.shifts.length - 1]?.truckId ?? trucks[0]?.id ?? null;
  const shift = ops?.shifts.findLast((s) => s.truckId === selectedId) ?? null;
  const { data: fixes = [] } = useTrace(shift?.shiftId ?? null);
  const trace = useMemo(() => fixes.map((f): LngLat => [f.lng, f.lat]), [fixes]);
  const stats = useMemo(() => traceStats(fixes), [fixes]);

  if (!ops || !barangays || !meta) {
    return (
      <Screen width="dashboard" safeTop={false}>
        {null}
      </Screen>
    );
  }

  const nameOf = (id: string) =>
    barangays.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const state = ops.states.find((s) => s.truckId === selectedId);
  const route = routes.find((r) => r.id === (state?.routeId ?? shift?.routeId));
  const events = ops.events.filter((e) => e.truckId === selectedId);
  const [[w, s], [e, n]] = meta.bounds;
  const traceBounds = pointsBounds(trace);
  const traceElsewhere = traceBounds != null && !overlaps(traceBounds, [w, s, e, n]);
  const routeBounds = route ? pointsBounds(route.segments.flatMap((sg) => sg.coordinates)) : null;
  const fit = traceElsewhere ? traceBounds : routeBounds;
  const { weekday } = manilaParts(ops.at);

  const list = (
    <Panel title={t('enro.trucks.title')}>
      {ops.states.map((st) => {
        const truck = trucks.find((tr) => tr.id === st.truckId);
        const sh = ops.shifts.findLast((x) => x.truckId === st.truckId);
        const selected = st.truckId === selectedId;
        const r = routes.find((x) => x.id === st.routeId);
        return (
          <Pressable
            key={st.truckId}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => setChosen(st.truckId)}
            style={[styles.truck, selected && styles.selected]}
          >
            <View style={styles.head}>
              <AppText variant="bodyStrong" style={styles.flex}>
                {truck?.name}
              </AppText>
              <StatusPill status={st.status} />
            </View>
            <AppText variant="label" color={colors.textMuted}>
              {t('enro.trucks.route')}:{' '}
              {r ? r.barangayIds.map(nameOf).join(', ') : t('enro.trucks.noRoute')}
            </AppText>
            {st.status !== 'off_duty' ? (
              <>
                <LoadBar value={st.load} />
                {st.loadReportedAt != null ? (
                  <AppText variant="caption" color={colors.textMuted}>
                    {t('enro.live.loadReported', { time: formatClock(st.loadReportedAt) })}
                  </AppText>
                ) : null}
              </>
            ) : null}
            <View style={styles.inline}>
              <Icon
                name={sh ? 'account-hard-hat' : 'robot-outline'}
                size={18}
                color={colors.textMuted}
              />
              <AppText variant="label" color={colors.textMuted} style={styles.flex}>
                {sh
                  ? sh.endedAt != null
                    ? t('enro.trucks.shiftEnded', { time: formatClock(sh.endedAt) })
                    : t('enro.trucks.driverOnShift', {
                        time: formatClock(sh.startedAt),
                        crew: sh.crew,
                      })
                  : t('enro.trucks.noDriver')}
              </AppText>
            </View>
            {sh ? (
              <AppText variant="label" color={colors.textMuted}>
                {t('enro.trucks.gps', { count: sh.gps.points })}
                {sh.gps.lastFixAt != null
                  ? ` · ${t('enro.trucks.gpsLast', { ago: formatAgo(t, deviceNow - sh.gps.lastFixAt) })}`
                  : ''}
                {st.trips ? ` · ${t('enro.trucks.trips', { count: st.trips })}` : ''}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </Panel>
  );

  const detail = (
    <>
      <Panel title={trucks.find((tr) => tr.id === selectedId)?.name ?? ''}>
        <View style={[styles.map, { height: wide ? 420 : 320 }]}>
          <KMap
            barangays={barangays}
            meta={meta}
            trucks={
              state?.position
                ? [
                    {
                      id: state.truckId,
                      code: trucks.find((tr) => tr.id === state.truckId)?.code ?? '',
                      name: trucks.find((tr) => tr.id === state.truckId)?.name ?? '',
                      status: state.status,
                      position: state.position,
                    },
                  ]
                : []
            }
            routePreview={state && route ? buildRoutePreview(route, state, ops.at, 4) : null}
            trace={trace}
            selectedTruckId={selectedId}
            fitBounds={fit ? { bounds: fit, key: `${selectedId}|${traceElsewhere}` } : null}
            style={StyleSheet.absoluteFill}
            accessibilityLabel={t('map.a11yLabel', { count: state?.position ? 1 : 0 })}
          />
        </View>
        <AppText variant="bodyStrong">{t('enro.trucks.traceTitle')}</AppText>
        <AppText color={colors.textMuted}>
          {fixes.length
            ? t('enro.trucks.traceSummary', {
                count: fixes.length,
                distance: formatDistance(t, stats.distanceM),
                ago: formatAgo(t, deviceNow - fixes[fixes.length - 1].t),
              })
            : t('enro.trucks.traceNone')}
        </AppText>
        {traceElsewhere ? (
          <AppText variant="label" color={colors.amber}>
            {t('enro.trucks.traceElsewhere')}
          </AppText>
        ) : null}
      </Panel>

      <Panel title={t('enro.trucks.timelineTitle')}>
        {events.length === 0 ? (
          <AppText color={colors.textMuted}>{t('enro.trucks.noEvents')}</AppText>
        ) : (
          [...events].reverse().map((ev) => (
            <View key={ev.id} style={styles.event}>
              <AppText variant="label" style={styles.time}>
                {formatClock(ev.at)}
              </AppText>
              <Icon name={eventIcon(ev)} size={20} color={colors.navy} />
              <AppText style={styles.flex}>{describeEvent(t, ev, route, nameOf)}</AppText>
              {ev.source === 'demo' ? (
                <View style={styles.demo}>
                  <AppText variant="caption">{t('enro.trucks.demoSource')}</AppText>
                </View>
              ) : null}
            </View>
          ))
        )}
      </Panel>
    </>
  );

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.trucks.title')}
        </AppText>
        <AppText color={colors.textMuted}>
          {t('enro.trucks.subtitle', {
            weekday: t(`weekday.${weekday}`),
            time: formatClock(ops.at),
          })}
        </AppText>
        <SampleDataBadge />
      </View>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.listCol}>{list}</View>
          <View style={styles.detailCol}>{detail}</View>
        </View>
      ) : (
        <>
          {list}
          {detail}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  listCol: { flex: 2, gap: spacing.lg, minWidth: 0 },
  detailCol: { flex: 3, gap: spacing.lg, minWidth: 0 },
  truck: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.navy, backgroundColor: colors.greySoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  map: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  time: { minWidth: 72 },
  demo: {
    borderWidth: 1,
    borderColor: colors.grey,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
});
