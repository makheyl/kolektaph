import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import type { MapTruck } from '@/components/map/types';
import { AppText } from '@/components/ui/AppText';
import { BigTile } from '@/components/ui/BigTile';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { LoadBar } from '@/components/ui/LoadBar';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  useBarangays,
  useCityMeta,
  useRoutes,
  useSimNow,
  useTrucks,
  useTruckStates,
} from '@/features/tracking/hooks';
import { formatClock, manilaParts } from '@/lib/time';
import type { TruckState } from '@/services/types';
import { DEMO_PRESET_IDS, demoPresetTime } from '@/simulator/presets';
import { useBackend } from '@/stores/backend';
import { getSimTime, useDemo } from '@/stores/demo';
import { useEnro } from '@/stores/enro';
import { type Role, useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

const SPEEDS = [1, 10, 60];
const WIDE_BREAKPOINT = 900;

export default function DemoScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const { data: trucks } = useTrucks();
  const { data: routes } = useRoutes();
  const states = useTruckStates();
  const now = useSimNow();

  const { clock, jumpTo, setSpeed, goLive, events, addEvent, clearEvents } = useDemo();
  const [breakdownTruck, setBreakdownTruck] = useState('t2');
  const driverEvents = useBackend((s) => s.events.length);
  const resetBackend = useBackend((s) => s.reset);
  const resetDecisions = useEnro((s) => s.reset);
  const { language, setLanguage, largeText, setLargeText, setRole } = useSettings();

  const barangayName = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';

  const mapTrucks: MapTruck[] = states.flatMap((s) => {
    const truck = trucks?.find((tr) => tr.id === s.truckId);
    if (!truck || !s.position || s.status === 'off_duty') return [];
    return [
      { id: truck.id, code: truck.code, name: truck.name, status: s.status, position: s.position },
    ];
  });
  const todaysRoutes = routes?.filter((r) => states.some((s) => s.routeId === r.id)) ?? [];

  const openRole = (role: Role) => {
    setRole(role);
    router.push(`/${role}`);
  };

  const locationText = (s: TruckState) => {
    if (s.status === 'not_started') return t('truck.atDepot', { depot: meta?.depot.name ?? '' });
    if (!s.barangayId) return '';
    return t('truck.location', {
      street: s.streetName ?? t('truck.unnamedRoad'),
      barangay: barangayName(s.barangayId),
    });
  };

  const { weekday } = manilaParts(now);

  const controls = (
    <View style={styles.column}>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          Kolekta
          <AppText variant="display" color={colors.green}>
            PH
          </AppText>
        </AppText>
        <AppText color={colors.textMuted}>{t('app.tagline')}</AppText>
        <SampleDataBadge />
      </View>

      <View style={styles.chips}>
        <Chip label="Filipino" selected={language === 'fil'} onPress={() => setLanguage('fil')} />
        <Chip label="English" selected={language === 'en'} onPress={() => setLanguage('en')} />
        <Chip
          label={t('common.largeText')}
          selected={largeText}
          onPress={() => setLargeText(!largeText)}
        />
      </View>

      <Section title={t('roles.title')}>
        <BigTile
          icon="home-account"
          label={t('roles.resident')}
          hint={t('roles.residentHint')}
          accent={colors.green}
          onPress={() => openRole('resident')}
        />
        <BigTile
          icon="steering"
          label={t('roles.driver')}
          hint={t('roles.driverHint')}
          accent={colors.navy}
          onPress={() => openRole('driver')}
        />
        <BigTile
          icon="monitor-dashboard"
          label={t('roles.enro')}
          hint={t('roles.enroHint')}
          accent={colors.amber}
          onPress={() => openRole('enro')}
        />
        {Platform.OS === 'web' ? (
          <AppText variant="label" color={colors.textMuted}>
            {t('demo.bridgeHint')}
          </AppText>
        ) : null}
      </Section>

      <Section title={t('demo.clockTitle')}>
        <Card>
          <AppText variant="label" color={colors.textMuted}>
            {clock.mode === 'live' ? t('demo.liveMode') : `${t('demo.demoMode')} · ×${clock.speed}`}
          </AppText>
          <AppText variant="title" accessibilityLiveRegion="polite">
            {t(`weekday.${weekday}`)}, {formatClock(now)}
          </AppText>
          <AppText variant="label">{t('demo.presetsTitle')}</AppText>
          <View style={styles.presets}>
            {DEMO_PRESET_IDS.map((id) => (
              <Button
                key={id}
                variant="secondary"
                label={t(`demo.presets.${id}`)}
                onPress={() => jumpTo(demoPresetTime(id, Date.now()))}
              />
            ))}
          </View>
          <AppText variant="label">{t('demo.speed')}</AppText>
          <View style={styles.chips}>
            {SPEEDS.map((sp) => (
              <Chip
                key={sp}
                label={`×${sp}`}
                selected={clock.mode === 'demo' && clock.speed === sp}
                onPress={() => setSpeed(sp)}
              />
            ))}
          </View>
          {clock.mode === 'demo' ? (
            <Button
              variant="primary"
              icon="clock-outline"
              label={t('demo.goLive')}
              onPress={goLive}
            />
          ) : null}
        </Card>
      </Section>

      <Section title={t('demo.scenarioTitle')}>
        <Card>
          <AppText variant="label" color={colors.textMuted}>
            {t('demo.scenarioHint')}
          </AppText>
          <View style={styles.chips}>
            {(trucks ?? []).map((tr) => (
              <Chip
                key={tr.id}
                label={tr.name}
                selected={breakdownTruck === tr.id}
                onPress={() => setBreakdownTruck(tr.id)}
              />
            ))}
          </View>
          <Button
            variant="danger"
            icon="car-wrench"
            label={t('demo.breakdown', {
              truck: trucks?.find((tr) => tr.id === breakdownTruck)?.name ?? '',
            })}
            onPress={() => {
              const at = getSimTime();
              addEvent({
                id: `demo-breakdown|${breakdownTruck}|${at}`,
                kind: 'incident',
                incident: 'breakdown',
                source: 'demo',
                truckId: breakdownTruck,
                at,
                minutes: 120,
              });
            }}
          />
          {events.length + driverEvents ? (
            <>
              <AppText variant="label">
                {t('demo.activeEvents', { count: events.length + driverEvents })}
              </AppText>
              <Button
                variant="secondary"
                icon="restore"
                label={t('demo.clearEvents')}
                onPress={() => {
                  clearEvents();
                  resetBackend();
                  resetDecisions();
                }}
              />
            </>
          ) : null}
        </Card>
      </Section>
    </View>
  );

  const live = (
    <View style={styles.column}>
      <Section title={t('demo.mapTitle')}>
        {barangays && meta ? (
          <KMap
            barangays={barangays}
            meta={meta}
            trucks={mapTrucks}
            routes={todaysRoutes}
            style={[styles.map, { height: wide ? 520 : 420 }]}
            accessibilityLabel={t('map.a11yLabel', { count: mapTrucks.length })}
          />
        ) : null}
      </Section>

      <Section title={t('demo.trucksTitle')}>
        {states.map((s) => {
          const truck = trucks?.find((tr) => tr.id === s.truckId);
          return (
            <Card key={s.truckId}>
              <View style={styles.truckRow}>
                <AppText variant="heading">{truck?.name}</AppText>
                <StatusPill status={s.status} />
              </View>
              {locationText(s) ? (
                <AppText color={colors.textMuted}>{locationText(s)}</AppText>
              ) : null}
              {s.status !== 'off_duty' ? <LoadBar value={s.load} /> : null}
            </Card>
          );
        })}
      </Section>
    </View>
  );

  return (
    <Screen width="page">
      <View style={wide ? styles.wide : styles.narrow}>
        {controls}
        {live}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wide: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  narrow: { gap: spacing.xl },
  column: { flex: 1, gap: spacing.xl, minWidth: 0 },
  header: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presets: { gap: spacing.sm },
  map: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  truckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
