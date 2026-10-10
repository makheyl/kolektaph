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
import { Notice } from '@/components/ui/Notice';
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
import { colors, radius, spacing } from '@/theme/tokens';

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
    <Screen
      header={
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
      }
      // The action that ends or follows the shift stays in reach, under the summary.
      footer={
        !ended ? (
          <>
            <AppText variant="label" color={colors.textMuted}>
              {t('driver.end.gpsStops')}
            </AppText>
            <Button
              size="driver"
              variant="danger"
              icon="stop-circle-outline"
              label={t('driver.end.confirm')}
              loading={busy}
              onPress={async () => {
                setBusy(true);
                await finishShift();
                setBusy(false);
              }}
            />
          </>
        ) : (
          <>
            {pending.total ? (
              <AppText variant="label" color={colors.textMuted}>
                {t('driver.end.signOutWait')}
              </AppText>
            ) : null}
            <Button
              size="driver"
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
          </>
        )
      }
    >
      {ended ? (
        <Card variant="mint" style={styles.done}>
          <View style={styles.doneBadge} aria-hidden>
            <Icon name="check" size={32} color={colors.textOnDark} />
          </View>
          <AppText variant="heading" color={colors.primary} style={styles.center}>
            {t('driver.end.doneBody')}
          </AppText>
        </Card>
      ) : null}

      <Card>
        <AppText variant="heading" color={colors.primary} accessibilityRole="header">
          {t('driver.end.summary')}
        </AppText>
        {rows.map(([label, value], i) => (
          <View key={label} style={[styles.row, i > 0 && styles.rowLine]}>
            <AppText style={styles.flex}>{label}</AppText>
            <AppText variant="bodyStrong" style={styles.value}>
              {value}
            </AppText>
          </View>
        ))}
      </Card>

      {pending.total ? (
        <Notice tone="warning" icon="cloud-upload-outline" live="polite">
          <AppText variant="bodyStrong">
            {ended
              ? t('driver.end.waitSync', { count: pending.total })
              : t('driver.end.pendingWarning', { count: pending.total })}
          </AppText>
          <Button
            variant="secondary"
            icon="send"
            label={t('driver.gps.sendNow')}
            onPress={() => void syncNow(true)}
          />
        </Notice>
      ) : ended ? (
        <Notice tone="success" icon="cloud-check-outline" text={t('driver.end.allSynced')} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // A name and its number share a line; the number moves under the name when they do not fit.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.border },
  value: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  done: { alignItems: 'center' },
  doneBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
