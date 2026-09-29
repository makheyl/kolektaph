import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { WasteBadge } from '@/components/ui/WasteBadge';
import type { StartGpsResult } from '@/features/driver/recorder';
import { beginShift } from '@/features/driver/shift';
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
import { useDriver } from '@/stores/driver';
import { colors, spacing } from '@/theme/tokens';

const CREW = [1, 2, 3, 4];
type GpsError = Extract<StartGpsResult, { ok: false }>['reason'];

/** Confirm truck, today's route and crew; explain location before the phone asks for it. */
export default function StartShift() {
  const { t } = useTranslation();
  const session = useDriver((s) => s.session);
  const shift = useDriver((s) => s.shift);
  const signOut = useDriver((s) => s.signOut);
  const now = useSimNow(10_000);
  const { data: trucks = [] } = useTrucks();
  const { data: routes = [] } = useRoutes();
  const { data: schedules = [] } = useRouteSchedules();
  const { data: exceptions = [] } = useScheduleExceptions();
  const { data: barangays } = useBarangays();
  const [crew, setCrew] = useState(3);
  const [gpsSource, setGpsSource] = useState<GpsSource>(Platform.OS === 'web' ? 'demo' : 'phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GpsError | null>(null);

  if (!session) return <Redirect href="/driver/sign-in" />;
  if (shift) return <Redirect href="/driver" />;

  const truck = trucks.find((tr) => tr.id === session.truckId);
  const schedule = schedules.find(
    (s) => s.truckId === session.truckId && routeRunsOnDay(s, now, exceptions).runs,
  );
  const route = routes.find((r) => r.id === schedule?.routeId);
  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;

  const start = async () => {
    setBusy(true);
    setError(null);
    const result = await beginShift({ routeId: route?.id ?? null, crew, gpsSource });
    setBusy(false);
    // A GPS failure after the shift started is handled on the shift screen (retry button).
    if (!result.ok && !useDriver.getState().shift) setError(result.reason);
    else router.replace('/driver/shift');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('driver.start.title')}
        </AppText>
        <SampleDataBadge />
      </View>

      <Card>
        <AppText variant="label" color={colors.textMuted}>
          {t('driver.start.truck')}
        </AppText>
        <AppText variant="heading">
          {truck?.code} · {truck?.name}
        </AppText>
        <AppText variant="label" color={colors.textMuted}>
          {t('driver.start.route')}
        </AppText>
        {route && schedule ? (
          <>
            <AppText variant="bodyStrong">{route.barangayIds.map(nameOf).join(', ')}</AppText>
            <AppText>
              {formatClock(atManilaTime(now, schedule.start))} –{' '}
              {formatClock(atManilaTime(now, schedule.windowEnd))}
            </AppText>
            <WasteBadge type={schedule.wasteType} />
          </>
        ) : (
          <AppText>{t('driver.start.noRoute')}</AppText>
        )}
      </Card>

      <Section title={t('driver.start.crew')}>
        <View style={styles.row}>
          {CREW.map((n) => (
            <Chip key={n} label={String(n)} selected={crew === n} onPress={() => setCrew(n)} />
          ))}
        </View>
      </Section>

      <Section title={t('driver.start.gpsSource')}>
        <ListRow
          icon="cellphone-marker"
          title={t('driver.start.gpsPhone')}
          subtitle={t('driver.start.gpsPhoneHint')}
          selected={gpsSource === 'phone'}
          trailing={gpsSource === 'phone' ? 'check' : 'none'}
          onPress={() => setGpsSource('phone')}
        />
        <ListRow
          icon="test-tube"
          title={t('driver.start.gpsDemo')}
          subtitle={t('driver.start.gpsDemoHint')}
          selected={gpsSource === 'demo'}
          trailing={gpsSource === 'demo' ? 'check' : 'none'}
          onPress={() => setGpsSource('demo')}
        />
      </Section>

      <Card style={styles.privacy}>
        <View style={styles.row}>
          <Icon name="shield-lock-outline" size={24} color={colors.navy} />
          <AppText variant="heading">{t('driver.start.privacyTitle')}</AppText>
        </View>
        <AppText>{t('driver.start.privacyBody')}</AppText>
        {gpsSource === 'phone' ? (
          <AppText variant="bodyStrong">{t('driver.start.permissionHint')}</AppText>
        ) : null}
      </Card>

      {error ? (
        <Card style={styles.error} accessibilityLiveRegion="assertive">
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
        </Card>
      ) : null}

      <Button
        size="driver"
        variant="success"
        icon="play-circle"
        label={busy ? t('driver.start.starting') : t('driver.start.start')}
        disabled={busy}
        onPress={() => void start()}
      />
      <Button
        variant="secondary"
        icon="logout"
        label={t('driver.start.signOut')}
        onPress={() => {
          signOut();
          router.replace('/driver/sign-in');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  privacy: { backgroundColor: colors.greySoft },
  error: { backgroundColor: colors.redSoft, borderColor: colors.red },
});
