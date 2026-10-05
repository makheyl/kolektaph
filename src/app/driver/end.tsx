import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { formatShiftDuration } from '@/features/driver/format';
import { finishShift } from '@/features/driver/shift';
import { driverStreets, streetMarks, streetProgress } from '@/features/driver/streets';
import { syncNow, usePending } from '@/features/driver/sync';
import { useRoutes, useSimNow } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { services } from '@/services';
import { useDriver, useDriverLive } from '@/stores/driver';
import { useGps } from '@/stores/gps';
import { colors, spacing } from '@/theme/tokens';

/** Shift summary; ending the shift stops the GPS. Afterwards, waits until everything is sent. */
export default function EndShift() {
  const { t } = useTranslation();
  const shift = useDriver((s) => s.shift);
  const outbox = useDriver((s) => s.outbox);
  const clearShift = useDriver((s) => s.clearShift);
  const signOut = useDriver((s) => s.signOut);
  const truck = useDriverLive((s) => s.truck);
  const fixes = useGps((s) => s.fixes.length);
  const clearGps = useGps((s) => s.clear);
  const pending = usePending();
  const now = useSimNow();
  const { data: routes = [] } = useRoutes();
  const [busy, setBusy] = useState(false);

  const route = routes.find((r) => r.id === shift?.routeId);
  const streets = useMemo(() => (route ? driverStreets(route) : []), [route]);

  if (!shift) return <Redirect href="/driver" />;
  const ended = shift.endedAt != null;
  const events = outbox.map((o) => o.event);
  const marks = route ? streetMarks(events, route.id) : new Map();
  const skipped = [...marks.values()].filter((m) => m.outcome === 'skipped').length;
  const passed = streets.filter(
    (s) => streetProgress(s, truck?.progressM ?? 0) === 'passed',
  ).length;

  const rows: [string, string][] = [
    [t('driver.end.duration'), formatShiftDuration((shift.endedAt ?? now) - shift.startedAt)],
    [t('driver.end.streetsPassed'), `${passed}/${streets.length}`],
    [t('driver.end.streetsSkipped'), String(skipped)],
    [t('driver.end.trips'), String(truck?.trips ?? 0)],
    [t('driver.end.incidents'), String(events.filter((e) => e.kind === 'incident').length)],
    [t('driver.end.gpsPoints'), String(fixes)],
  ];

  const leave = (then: () => void) => {
    clearShift();
    clearGps();
    then();
  };

  return (
    <Screen>
      <AppHeader
        title={ended ? t('driver.end.doneTitle') : t('driver.end.title')}
        leading={
          ended ? undefined : (
            <IconButton
              icon="arrow-left"
              label={t('common.back')}
              onPress={() => goBack('/driver/shift')}
            />
          )
        }
      />

      {ended ? (
        <Card style={styles.done}>
          <Icon name="check-circle" size={40} color={colors.green} />
          <AppText variant="heading">{t('driver.end.doneBody')}</AppText>
        </Card>
      ) : null}

      <Card>
        <AppText variant="heading">{t('driver.end.summary')}</AppText>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <AppText style={styles.flex}>{label}</AppText>
            <AppText variant="bodyStrong">{value}</AppText>
          </View>
        ))}
      </Card>

      {pending.total ? (
        <Card style={styles.warn} accessibilityLiveRegion="polite">
          <View style={styles.inline}>
            <Icon name="cloud-upload-outline" size={24} color={colors.navy} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {ended
                ? t('driver.end.waitSync', { count: pending.total })
                : t('driver.end.pendingWarning', { count: pending.total })}
            </AppText>
          </View>
          <Button
            variant="secondary"
            icon="send"
            label={t('driver.gps.sendNow')}
            onPress={() => void syncNow(true)}
          />
        </Card>
      ) : ended ? (
        <Card style={styles.done}>
          <View style={styles.inline}>
            <Icon name="cloud-check-outline" size={24} color={colors.green} />
            <AppText variant="bodyStrong">{t('driver.end.allSynced')}</AppText>
          </View>
        </Card>
      ) : null}

      {!ended ? (
        <>
          <AppText color={colors.textMuted}>{t('driver.end.gpsStops')}</AppText>
          <Button
            size="driver"
            variant="danger"
            icon="stop-circle-outline"
            label={t('driver.end.confirm')}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              await finishShift();
              setBusy(false);
            }}
          />
        </>
      ) : (
        <>
          <Button
            size="driver"
            variant="success"
            icon="play-circle"
            label={t('driver.end.newShift')}
            disabled={pending.total > 0}
            onPress={() => leave(() => router.replace('/driver/start'))}
          />
          <Button
            variant="secondary"
            icon="logout"
            label={t('driver.end.signOut')}
            disabled={pending.total > 0}
            onPress={() =>
              leave(() => {
                // Tell the server too (it never blocks leaving; see DriverService.signOut).
                void services.driver.signOut();
                signOut();
                router.replace('/driver/sign-in');
              })
            }
          />
          {pending.total ? (
            <AppText variant="label" color={colors.textMuted}>
              {t('driver.end.signOutWait')}
            </AppText>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  warn: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
  done: { backgroundColor: colors.greenSoft, borderColor: colors.green, alignItems: 'flex-start' },
});
