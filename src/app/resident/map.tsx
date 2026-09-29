import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import type { MapTruck } from '@/components/map/types';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { LoadBar } from '@/components/ui/LoadBar';
import { Screen } from '@/components/ui/Screen';
import { StatusPill } from '@/components/ui/StatusPill';
import { MapLegend } from '@/features/resident/components/MapLegend';
import { truckRelationText } from '@/features/resident/truckRelation';
import { useResidentToday } from '@/features/resident/useResidentToday';
import { upcomingStreets } from '@/features/tracking/eta';
import { useBarangays, useCityMeta, useTrucks } from '@/features/tracking/hooks';
import { buildRoutePreview } from '@/features/tracking/routePreview';
import { boundsOf } from '@/lib/geo';
import { formatClock } from '@/lib/time';
import type { TruckState } from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

type View_ = 'map' | 'list';

/** City map with live trucks and the selected truck's route preview (pitch slides 10–11). */
export default function ResidentMap() {
  const { t } = useTranslation();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const { data: trucks } = useTrucks();
  const { barangayId, now, states, routes, today } = useResidentToday();

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
        <AppText variant="heading">{truckName(s.truckId)}</AppText>
        <StatusPill status={s.status} />
      </View>
      {locationText(s) ? <AppText color={colors.textMuted}>{locationText(s)}</AppText> : null}
      {mine ? (
        <AppText variant="bodyStrong">
          {truckRelationText(t, routeOf(s), s, barangayId, mine.properties.name, now)}
        </AppText>
      ) : null}
      <LoadBar value={s.load} />
    </>
  );

  return (
    <Screen scroll={false}>
      <AppHeader title={t('resident.tabs.map')} />
      <View style={styles.controls}>
        <Chip
          label={t('resident.map.mapView')}
          selected={view === 'map'}
          onPress={() => setView('map')}
        />
        <Chip
          label={t('resident.map.listView')}
          selected={view === 'list'}
          onPress={() => setView('list')}
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
      </View>

      {view === 'map' ? (
        <>
          <View style={styles.mapWrap}>
            {barangays && meta ? (
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
            ) : null}
            <MapLegend />
          </View>
          <Card>
            {selected ? (
              truckSummary(selected)
            ) : (
              <AppText color={colors.textMuted}>{t('resident.map.noTrucks')}</AppText>
            )}
            {onDuty.length > 1 ? (
              <AppText variant="caption" color={colors.textMuted}>
                {t('resident.map.tapTruck')}
              </AppText>
            ) : null}
          </Card>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {onDuty.length === 0 ? (
            <Card>
              <AppText color={colors.textMuted}>{t('resident.map.noTrucks')}</AppText>
            </Card>
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
                  <AppText variant="bodyStrong">{formatClock(st.arriveAt)}</AppText>
                </View>
              ))}
              <AppText variant="caption" color={colors.textMuted}>
                {t('resident.map.timesAreEstimates')}
              </AppText>
            </Card>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mapWrap: {
    flex: 1,
    minHeight: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  selectedCard: { borderColor: colors.navy, borderWidth: 2 },
  streetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.greySoft,
  },
  streetText: { flex: 1 },
});
