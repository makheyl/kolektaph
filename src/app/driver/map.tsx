import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { reportedLoad } from '@/features/driver/load';
import { driverStreets, streetMarks, streetProgress } from '@/features/driver/streets';
import { percent } from '@/features/enro/format';
import { buildRoutePreview } from '@/features/tracking/routePreview';
import {
  useBarangays,
  useCityMeta,
  useRoutes,
  useSimNow,
  useTrucks,
} from '@/features/tracking/hooks';
import { pointsBounds } from '@/lib/geo';
import { goBack } from '@/lib/navigation';
import { useDriver, useDriverLive } from '@/stores/driver';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * The GPS map of the shift, as in the design: the truck and its route on the full screen, a
 * green line for where it is and what is next, and the stop card with the load. The crew sends
 * the load from the Truck Load page.
 */
export default function DriverMap() {
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

  const route = routes.find((r) => r.id === shift?.routeId);
  const streets = useMemo(() => (route ? driverStreets(route) : []), [route]);
  const routeBounds = useMemo(
    () => (route ? pointsBounds(route.segments.flatMap((s) => s.coordinates)) : null),
    [route],
  );

  if (!shift || shift.endedAt != null) return <Redirect href="/driver" />;

  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';
  const progressM = truck?.progressM ?? 0;
  const next = streets.find((s) => s.startM > progressM);
  const here = streets.find((s) => streetProgress(s, progressM) === 'current');
  const load = reportedLoad(outbox.map((o) => o.event)) ?? truck?.load ?? 0;
  const tr = trucks.find((x) => x.id === shift.truckId);
  // The street the crew is on (or the next one): the same marks as on the streets page.
  const stop = here ?? next;
  const marked =
    route && stop
      ? streetMarks(
          outbox.map((o) => o.event),
          route.id,
        ).get(stop.key)
      : null;
  const collect = () => {
    if (!route || !stop) return;
    report({
      kind: 'street',
      routeId: route.id,
      streetKey: stop.key,
      segmentIds: stop.segmentIds,
      outcome: 'collected',
      reason: null,
    });
  };

  return (
    <Screen
      header={
        <AppHeader
          title={t('driver.map.title')}
          leading={
            <IconButton
              icon="arrow-left"
              label={t('common.back')}
              onPress={() => goBack('/driver/shift')}
            />
          }
        />
      }
    >
      <View style={styles.banner} accessible accessibilityLiveRegion="polite">
        <Icon name="navigation" size={30} color={colors.textOnDark} />
        <View style={styles.bannerText}>
          <AppText variant="heading" color={colors.textOnDark}>
            {truck?.streetName ?? here?.name ?? t('truck.unnamedRoad')}
          </AppText>
          <AppText color={colors.mint}>
            {next
              ? t('driver.shift.next', { street: next.name ?? t('truck.unnamedRoad') })
              : t('driver.shift.routeDone')}
          </AppText>
        </View>
      </View>

      {route && barangays && meta ? (
        <KMap
          barangays={barangays}
          meta={meta}
          trucks={
            truck?.position
              ? [
                  {
                    id: shift.truckId,
                    code: tr?.code ?? '',
                    name: tr?.name ?? '',
                    status: truck.status,
                    position: truck.position,
                  },
                ]
              : []
          }
          routePreview={truck ? buildRoutePreview(route, truck, now, 4) : null}
          selectedTruckId={shift.truckId}
          fitBounds={routeBounds ? { bounds: routeBounds, key: route.id } : null}
          style={styles.map}
          accessibilityLabel={t('driver.map.title')}
        />
      ) : null}

      <View style={styles.stop}>
        <AppText variant="bodyStrong">
          {route ? route.barangayIds.map(nameOf).join(' → ') : t('driver.shift.noRoute')}
        </AppText>
        {stop ? (
          <>
            <AppText>
              {stop.name ?? t('truck.unnamedRoad')}
              {marked?.outcome === 'collected' ? ` · ✓ ${t('driver.map.marked')}` : ''}
            </AppText>
            <Button
              size="driver"
              variant={marked?.outcome === 'collected' ? 'success' : 'primary'}
              icon="check"
              label={t('driver.map.collected')}
              onPress={collect}
            />
            <Button
              variant="secondary"
              icon="debug-step-over"
              label={t('driver.map.skip')}
              accessibilityHint={t('driver.streets.title')}
              onPress={() => router.push('/driver/streets')}
            />
          </>
        ) : null}
        <AppText color={colors.textMuted}>{t('driver.map.load', { value: percent(load) })}</AppText>
        <Button
          variant="secondary"
          icon="gauge"
          label={t('driver.map.updateLoad')}
          onPress={() => router.push('/driver/load')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },
  map: { height: 300, borderRadius: radius.lg, overflow: 'hidden' },
  stop: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
