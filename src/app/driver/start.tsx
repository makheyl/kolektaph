import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { useNarrow } from '@/components/ui/narrow';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { WasteBadge } from '@/components/ui/WasteBadge';
import { DriverBar } from '@/features/driver/components/DriverTopBar';
import { useIsOnline } from '@/lib/network';
import {
  greetingKey,
  loadLabel,
  PRE_TRIP_CHECKS,
  type PreTripCheck,
  START_LOADS,
} from '@/features/driver/format';
import type { StartGpsResult } from '@/features/driver/recorder';
import { beginShift } from '@/features/driver/shift';
import { driverStreets } from '@/features/driver/streets';
import { formatDate } from '@/features/resident/format';
import { routeRunsOnDay } from '@/features/schedule/collections';
import {
  useBarangays,
  useRouteSchedules,
  useRoutes,
  useScheduleExceptions,
  useSimNow,
  useTrucks,
} from '@/features/tracking/hooks';
import { atManilaTime, formatClock } from '@/lib/time';
import type { GpsSource } from '@/services/types';
import { useDemo } from '@/stores/demo';
import { useDriver } from '@/stores/driver';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const CREW = [1, 2, 3, 4];
type GpsError = Extract<StartGpsResult, { ok: false }>['reason'];

/**
 * Before the shift: the truck and today's route, what the truck already carries, the pre-trip
 * checklist, the crew, and where the location comes from. Location is explained before the
 * phone asks for it.
 */
export default function StartShift() {
  const { t } = useTranslation();
  const narrow = useNarrow();
  const session = useDriver((s) => s.session);
  const shift = useDriver((s) => s.shift);
  const signOut = useDriver((s) => s.signOut);
  const online = useIsOnline();
  const demoMode = useDemo((s) => s.demoMode);
  const now = useSimNow(10_000);
  const { data: trucks = [] } = useTrucks();
  const { data: routes = [] } = useRoutes();
  const { data: schedules = [] } = useRouteSchedules();
  const { data: exceptions = [] } = useScheduleExceptions();
  const { data: barangays } = useBarangays();
  const [crew, setCrew] = useState(3);
  const [startLoad, setStartLoad] = useState<number>(0);
  const [checked, setChecked] = useState<PreTripCheck[]>([]);
  const [gpsSource, setGpsSource] = useState<GpsSource>(Platform.OS === 'web' ? 'demo' : 'phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GpsError | null>(null);

  const truck = trucks.find((tr) => tr.id === session?.truckId);
  const schedule = schedules.find(
    (s) => s.truckId === session?.truckId && routeRunsOnDay(s, now, exceptions).runs,
  );
  const route = routes.find((r) => r.id === schedule?.routeId);
  const streets = useMemo(() => (route ? driverStreets(route).length : 0), [route]);

  if (!session) return <Redirect href="/driver/sign-in" />;
  if (shift) return <Redirect href="/driver" />;

  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const ready = checked.length === PRE_TRIP_CHECKS.length;

  const start = async () => {
    setBusy(true);
    setError(null);
    const result = await beginShift({ routeId: route?.id ?? null, crew, gpsSource, startLoad });
    setBusy(false);
    // A GPS failure after the shift started is handled on the shift screen (retry button).
    if (!result.ok && !useDriver.getState().shift) setError(result.reason);
    else router.replace('/driver/shift');
  };

  const facts: [string, string][] = [
    [t('driver.start.today'), `${formatDate(t, now)} · ${formatClock(now)}`],
    [t('driver.start.truck'), truck ? `${truck.code} · ${truck.name}` : ''],
    ...(route && schedule
      ? ([
          [
            t('driver.start.route'),
            `${route.barangayIds.map(nameOf).join(', ')} · ${t('driver.start.streets', { count: streets })}`,
          ],
          [
            t('driver.start.hours'),
            `${formatClock(atManilaTime(now, schedule.start))} – ${formatClock(atManilaTime(now, schedule.windowEnd))}`,
          ],
        ] as [string, string][])
      : []),
  ];

  return (
    <Screen
      header={
        <DriverBar
          code={truck?.code}
          title={t(`driver.start.greeting.${greetingKey(now)}`)}
          subtitle={`${truck?.name ?? ''} · ${t('driver.start.offDuty')}`}
          webTitle={t('driver.start.start')}
          right={
            <View style={styles.rightBar}>
              {/* As on the design: a pill saying whether the phone reaches the City now. */}
              <View
                style={[styles.pill, !online && styles.pillOff]}
                accessibilityRole="text"
                accessibilityLabel={online ? t('driver.start.online') : t('driver.start.offline')}
              >
                <AppText variant="label" color={online ? colors.primary : colors.ink}>
                  {online ? t('driver.start.online') : t('driver.start.offline')}
                </AppText>
              </View>
              <IconButton
                icon="home-outline"
                label={t('driver.tabs.home')}
                color={colors.textOnDark}
                onPress={() => router.replace('/driver/shift')}
              />
              <IconButton
                icon="logout"
                label={t('driver.start.signOut')}
                color={colors.textOnDark}
                onPress={() => {
                  signOut();
                  router.replace('/driver/sign-in');
                }}
              />
            </View>
          }
        />
      }
      footer={
        <>
          {ready ? null : (
            <AppText variant="label" color={colors.textMuted} accessibilityLiveRegion="polite">
              {t('driver.start.checklistNeeded', {
                done: checked.length,
                total: PRE_TRIP_CHECKS.length,
              })}
            </AppText>
          )}
          <Button
            size="driver"
            icon="play-circle"
            label={busy ? t('driver.start.starting') : t('driver.start.start')}
            disabled={!ready}
            loading={busy}
            onPress={() => void start()}
          />
        </>
      }
    >
      <SampleDataBadge />

      <Card variant="mint">
        {facts.map(([label, value]) => (
          <View key={label} style={styles.fact}>
            <AppText variant="label" color={colors.primary} style={styles.factLabel}>
              {label}
            </AppText>
            <AppText variant="bodyStrong" style={styles.factValue}>
              {value}
            </AppText>
          </View>
        ))}
        {route && schedule ? (
          <WasteBadge type={schedule.wasteType} />
        ) : (
          <AppText>{t('driver.start.noRoute')}</AppText>
        )}
      </Card>

      <Section title={t('driver.start.startLoad')}>
        <View style={styles.row}>
          {START_LOADS.map((v) => (
            <Chip
              key={v}
              label={v === 0 ? t('driver.start.loadEmpty') : loadLabel(t, v)}
              accessibilityLabel={
                v === 0
                  ? t('driver.start.loadEmpty')
                  : t('driver.shift.loadA11y', { value: loadLabel(t, v) })
              }
              selected={startLoad === v}
              onPress={() => setStartLoad(v)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('driver.start.checklist')}>
        <Card>
          {PRE_TRIP_CHECKS.map((item) => (
            <Checkbox
              key={item}
              large
              label={t(`driver.start.check.${item}`)}
              checked={checked.includes(item)}
              onChange={(on) =>
                setChecked(on ? [...checked, item] : checked.filter((c) => c !== item))
              }
            />
          ))}
        </Card>
        {demoMode && !ready ? (
          <Button
            variant="ghost"
            icon="check-all"
            label={t('driver.start.checkAll')}
            onPress={() => setChecked([...PRE_TRIP_CHECKS])}
          />
        ) : null}
      </Section>

      <Section title={t('driver.start.crew')}>
        <View style={styles.row}>
          {CREW.map((n) => (
            <Chip key={n} label={String(n)} selected={crew === n} onPress={() => setCrew(n)} />
          ))}
        </View>
      </Section>

      <Section title={t('driver.start.gpsSource')}>
        <ListRow
          variant="card"
          icon="cellphone-marker"
          title={t('driver.start.gpsPhone')}
          subtitle={t('driver.start.gpsPhoneHint')}
          selected={gpsSource === 'phone'}
          trailing={gpsSource === 'phone' ? 'check' : 'none'}
          onPress={() => setGpsSource('phone')}
        />
        <ListRow
          variant="card"
          icon="test-tube"
          title={t('driver.start.gpsDemo')}
          subtitle={t('driver.start.gpsDemoHint')}
          selected={gpsSource === 'demo'}
          trailing={gpsSource === 'demo' ? 'check' : 'none'}
          onPress={() => setGpsSource('demo')}
        />
      </Section>

      <Card variant="flat" style={styles.privacy}>
        <View style={styles.row}>
          {narrow ? null : <Icon name="shield-lock-outline" size={24} color={colors.ink} />}
          <AppText variant="heading" style={styles.flex}>
            {t('driver.start.privacyTitle')}
          </AppText>
        </View>
        <AppText>{t('driver.start.privacyBody')}</AppText>
        {gpsSource === 'phone' ? (
          <AppText variant="bodyStrong">{t('driver.start.permissionHint')}</AppText>
        ) : null}
      </Card>

      {error ? (
        <Notice tone="danger" live="assertive">
          <AppText variant="bodyStrong" color={colors.red}>
            {t(`driver.start.errors.${error}`)}
          </AppText>
          {error === 'blocked' || error === 'services_off' ? (
            <Button
              variant="secondary"
              icon="cog-outline"
              label={t('driver.start.openSettings')}
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
          <Button
            variant="secondary"
            icon="test-tube"
            label={t('driver.start.useDemo')}
            onPress={() => {
              setGpsSource('demo');
              setError(null);
            }}
          />
        </Notice>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rightBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
  },
  pillOff: { backgroundColor: colors.yellowSoft },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  // The name of a fact and its value share a line, and stack when the value is long.
  fact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: spacing.md,
  },
  factLabel: { fontFamily: fonts.bold },
  factValue: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
  privacy: { backgroundColor: colors.greySoft },
});
