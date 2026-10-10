import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import type { MapTruck } from '@/components/map/types';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadBar } from '@/components/ui/LoadBar';
import { Screen } from '@/components/ui/Screen';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { StatusPill } from '@/components/ui/StatusPill';
import { MapLegend } from '@/features/resident/components/MapLegend';
import { barangayLabel } from '@/features/resident/format';
import { truckRelationText } from '@/features/resident/truckRelation';
import { useResidentToday } from '@/features/resident/useResidentToday';
import { upcomingStreets } from '@/features/tracking/eta';
import { useBarangays, useCityMeta, useTrucks } from '@/features/tracking/hooks';
import { buildRoutePreview } from '@/features/tracking/routePreview';
import { boundsOf } from '@/lib/geo';
import { formatClock } from '@/lib/time';
import type { TruckState } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, radius, spacing } from '@/theme/tokens';

type View_ = 'map' | 'list';

/** City map with live trucks and the selected truck's route preview (pitch slides 10–11). */
export default function ResidentMap() {
  const { t } = useTranslation();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const { data: trucks } = useTrucks();
  const { barangayId, now, states, routes, today } = useResidentToday();
  const smsOn = useSettings((s) => s.sms != null);

  const [chosenTruckId, setChosenTruckId] = useState<string | null>(null);
  const [view, setView] = useState<View_>('map');
  const [fit, setFit] = useState<{ target: 'mine' | 'city'; n: number } | null>(null);

  const onDuty = states.filter((s) => s.position && s.status !== 'off_duty');
  // Default to the truck serving the resident's barangay today.
  const selectedId = chosenTruckId ?? today?.truckId ?? onDuty[0]?.truckId ?? null;
  const selected = onDuty.find((s) => s.truckId === selectedId);
  const routeOf = (s: TruckState) => routes?.find((r) => r.id === s.routeId);
  const selectedRoute = selected ? routeOf(selected) : undefined;
  const preview =
    selected && selectedRoute ? buildRoutePreview(selectedRoute, selected, now) : null;

  const mine = barangays?.features.find((f) => f.properties.id === barangayId);
  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';
  const truckName = (id: string) => trucks?.find((tr) => tr.id === id)?.name ?? id;

  const mapTrucks: MapTruck[] = onDuty.flatMap((s) => {
    const truck = trucks?.find((tr) => tr.id === s.truckId);
    return truck && s.position
      ? [
          {
            id: truck.id,
            code: truck.code,
            name: truck.name,
            status: s.status,
            position: s.position,
          },
        ]
      : [];
  });

  const fitBounds =
    fit && meta
      ? {
          key: `${fit.target}-${fit.n}`,
          bounds:
            fit.target === 'mine' && mine
              ? boundsOf(mine)
              : ([...meta.bounds[0], ...meta.bounds[1]] as [number, number, number, number]),
        }
      : null;

  const locationText = (s: TruckState) =>
    s.barangayId
      ? t('truck.location', {
          street: s.streetName ?? t('truck.unnamedRoad'),
          barangay: nameOf(s.barangayId),
        })
      : '';

  const truckSummary = (s: TruckState) => (
    <>
      <View style={styles.titleRow}>
        <AppText variant="heading" color={colors.ink}>
          {truckName(s.truckId)}
        </AppText>
        <StatusPill status={s.status} />
      </View>
      {mine ? (
        <AppText variant="bodyStrong">
          {truckRelationText(t, routeOf(s), s, barangayId, mine.properties.name, now)}
        </AppText>
      ) : null}
      {locationText(s) ? <AppText color={colors.textMuted}>{locationText(s)}</AppText> : null}
      <LoadBar value={s.load} />
    </>
  );

  /** What the map is about: whose barangay, and whether a text will come. Both lead to where each is changed. */
  const shortcuts = (
    <View style={styles.shortcuts}>
      <Button
        variant="secondary"
        size="compact"
        icon="map-marker"
        label={mine ? barangayLabel(mine.properties) : t('resident.home.pick')}
        accessibilityHint={t('resident.settings.changeBarangay')}
        onPress={() => router.push('/resident/barangay')}
      />
      {mine ? (
        <Button
          variant="secondary"
          size="compact"
          icon={smsOn ? 'message-text' : 'message-off-outline'}
          label={t(smsOn ? 'resident.map.textOn' : 'resident.map.textOff')}
          accessibilityHint={t(smsOn ? 'common.settings' : 'resident.settings.smsTurnOn')}
          onPress={() =>
            smsOn
              ? router.push('/resident/settings')
              : router.push({ pathname: '/onboarding/sms', params: { from: 'settings' } })
          }
        />
      ) : null}
    </View>
  );

  const header = <AppHeader title={t('resident.tabs.map')} />;

  if (!barangays || !meta) {
    return (
      <Screen scroll={false} header={header}>
        <SkeletonGroup style={styles.fill}>
          <Skeleton height={44} width={200} round={radius.pill} />
          <Skeleton height={320} round={radius.lg} />
          <Skeleton height={120} round={radius.lg} />
        </SkeletonGroup>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} flush header={header}>
      {/* One row that scrolls sideways when it does not fit, so the map keeps its height. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.controlsBar}
        contentContainerStyle={styles.controls}
      >
        <SegmentedTabs
          variant="pill"
          label={t('resident.tabs.map')}
          tabs={[
            { id: 'map', label: t('resident.map.mapView') },
            { id: 'list', label: t('resident.map.listView') },
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'map' && mine ? (
          <Chip
            label={t('resident.map.showMine')}
            onPress={() => setFit({ target: 'mine', n: (fit?.n ?? 0) + 1 })}
          />
        ) : null}
        {view === 'map' ? (
          <Chip
            label={t('resident.map.showCity')}
            onPress={() => setFit({ target: 'city', n: (fit?.n ?? 0) + 1 })}
          />
        ) : null}
      </ScrollView>

      {view === 'map' ? (
        <>
          <View style={styles.mapWrap}>
            <KMap
              barangays={barangays}
              meta={meta}
              trucks={mapTrucks}
              routePreview={preview}
              highlightBarangayId={barangayId}
              selectedTruckId={selectedId}
              fitBounds={fitBounds}
              onTruckPress={setChosenTruckId}
              style={StyleSheet.absoluteFill}
              accessibilityLabel={t('map.a11yLabel', { count: mapTrucks.length })}
            />
            <MapLegend />
          </View>
          {/* The mint panel under the map, as in the design: the chosen truck in words. */}
          <View style={styles.sheet}>
            {selected ? (
              truckSummary(selected)
            ) : (
              <AppText variant="bodyStrong">{t('resident.map.noTrucks')}</AppText>
            )}
            {onDuty.length > 1 ? (
              <AppText variant="caption" color={colors.textMuted}>
                {t('resident.map.tapTruck')}
              </AppText>
            ) : null}
            {shortcuts}
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {onDuty.length === 0 ? (
            <EmptyState icon="truck-outline" title={t('resident.map.noTrucks')} />
          ) : null}
          {onDuty.map((s) => (
            <Pressable
              key={s.truckId}
              accessibilityRole="button"
              accessibilityState={{ selected: s.truckId === selectedId }}
              onPress={() => setChosenTruckId(s.truckId)}
            >
              <Card style={s.truckId === selectedId ? styles.selectedCard : undefined}>
                {truckSummary(s)}
              </Card>
            </Pressable>
          ))}
          {selected && selectedRoute ? (
            <Card>
              <AppText variant="heading">{t('resident.map.upcomingStreets')}</AppText>
              {upcomingStreets(selectedRoute, selected, now, 10).map((st) => (
                <View key={st.segmentId} style={styles.streetRow}>
                  <View style={styles.streetText}>
                    <AppText variant="bodyStrong">{st.name ?? t('truck.unnamedRoad')}</AppText>
                    <AppText variant="label" color={colors.textMuted}>
                      {nameOf(st.barangayId)}
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong" color={colors.primary}>
                    {formatClock(st.arriveAt)}
                  </AppText>
                </View>
              ))}
              <AppText variant="caption" color={colors.textMuted}>
                {t('resident.map.timesAreEstimates')}
              </AppText>
            </Card>
          ) : null}
          {shortcuts}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Keeps its own height when the list below it wants the whole screen.
  controlsBar: { flexGrow: 0, flexShrink: 0 },
  controls: { alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  mapWrap: { flex: 1, minHeight: 220 },
  sheet: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.mint },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  list: { gap: spacing.md, padding: spacing.lg, paddingTop: spacing.xs },
  selectedCard: { borderColor: colors.primary, borderWidth: 2 },
  streetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  streetText: { flex: 1 },
});
