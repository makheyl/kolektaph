import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import type { MapTruck } from '@/components/map/types';
import { AppHeader } from '@/components/ui/AppHeader';
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
import { useStaffRights } from '@/features/admin/hooks';
import {
  useBarangays,
  useCityMeta,
  useRoutes,
  useSimNow,
  useTrucks,
  useTruckStates,
} from '@/features/tracking/hooks';
import { formatClock, manilaParts } from '@/lib/time';
import { services } from '@/services';
import type { TruckState } from '@/services/types';
import { DEMO_PRESET_IDS, demoPresetTime } from '@/simulator/presets';
import { useDemo } from '@/stores/demo';
import { useKolekChat } from '@/stores/kolekChat';
import { useMyReports } from '@/stores/myReports';
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

  const clock = useDemo((s) => s.clock);
  const [breakdownTruck, setBreakdownTruck] = useState('t2');
  const clearMyReports = useMyReports((s) => s.clear);
  const clearKolek = useKolekChat((s) => s.clear);
  const queryClient = useQueryClient();
  const { language, setLanguage, largeText, setLargeText, setRole } = useSettings();
  // On a server the demo clock is one clock for every device, and only an admin may move it.
  const shared = services.demo.shared;
  const rights = useStaffRights();
  const canControl = !shared || rights.admin;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const control = async (change: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await change();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  };

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

  const reset = async () => {
    if (!(await control(() => services.demo.reset()))) return;
    // The ticket numbers start over, so this device's own list must too.
    clearMyReports();
    clearKolek();
    void queryClient.invalidateQueries({ queryKey: ['routeSchedules'] });
  };

  const controls = (
    <View style={styles.column}>
      <SampleDataBadge />

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
          accent={colors.ink}
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
        <Button
          variant="secondary"
          icon="clipboard-check-outline"
          label={t('sus.open')}
          onPress={() => router.push('/sus')}
        />
      </Section>

      {shared && !rights.admin ? (
        <Card style={styles.notice}>
          <AppText>{t('demo.sharedHint')}</AppText>
          <Button
            variant="secondary"
            icon="shield-lock-outline"
            label={t('demo.signInAdmin')}
            onPress={() => openRole('enro')}
          />
        </Card>
      ) : null}
      {failed ? (
        <AppText variant="bodyStrong" color={colors.red} accessibilityLiveRegion="polite">
          {t('demo.failed')}
        </AppText>
      ) : null}

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
                disabled={!canControl || busy}
                onPress={() =>
                  void control(() => services.demo.jumpTo(demoPresetTime(id, Date.now())))
                }
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
                onPress={() =>
                  canControl && !busy && void control(() => services.demo.setSpeed(sp))
                }
              />
            ))}
          </View>
          {clock.mode === 'demo' ? (
            <Button
              variant="primary"
              icon="clock-outline"
              label={t('demo.goLive')}
              disabled={!canControl || busy}
              onPress={() => void control(() => services.demo.goLive())}
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
            disabled={!canControl || busy}
            onPress={() => void control(() => services.demo.breakdown(breakdownTruck))}
          />
          {confirmReset ? (
            // On a server the reset empties the shared data for every device: ask once more.
            <View style={styles.confirm} accessibilityLiveRegion="polite">
              <AppText variant="bodyStrong">{t('demo.resetConfirm')}</AppText>
              <Button
                variant="danger"
                icon="restore"
                label={t('demo.resetYes')}
                disabled={busy}
                onPress={() => {
                  setConfirmReset(false);
                  void reset();
                }}
              />
              <Button
                variant="secondary"
                label={t('common.cancel')}
                onPress={() => setConfirmReset(false)}
              />
            </View>
          ) : (
            <Button
              variant="secondary"
              icon="restore"
              label={t('demo.clearEvents')}
              disabled={!canControl || busy}
              onPress={() => (shared ? setConfirmReset(true) : void reset())}
            />
          )}
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
    <Screen width="page" header={<AppHeader title={t('demo.title')} />}>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  presets: { gap: spacing.sm },
  notice: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
  confirm: { gap: spacing.sm },
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
