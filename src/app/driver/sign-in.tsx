import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { DRIVER_DEMO_PIN } from '@/data/carmona';
import { PinPad } from '@/features/driver/components/PinPad';
import { syncNow } from '@/features/driver/sync';
import { useTrucks } from '@/features/tracking/hooks';
import { formatClock } from '@/lib/time';
import { OfflineError, services, SignInError } from '@/services';
import { useDemo } from '@/stores/demo';
import { useDriver } from '@/stores/driver';
import { useSettings } from '@/stores/settings';
import { colors, radius, spacing } from '@/theme/tokens';

/** Truck + 4-digit PIN. No typing on the phone keyboard; big keys only. */
export default function DriverSignIn() {
  const { t } = useTranslation();
  const { data: trucks = [] } = useTrucks();
  const session = useDriver((s) => s.session);
  const signIn = useDriver((s) => s.signIn);
  const setSync = useDriver((s) => s.setSync);
  // A shift on the phone belongs to one truck: only that truck can sign in again.
  const shiftTruck = useDriver((s) => s.shift?.truckId ?? null);
  const expired = useDriver((s) => s.sync.lastError === 'signin');
  const demoMode = useDemo((s) => s.demoMode);
  const { language, setLanguage } = useSettings();
  const [picked, setTruckId] = useState<string | null>(null);
  const truckId = shiftTruck ?? picked;
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Redirect href="/driver" />;
  const truck = trucks.find((tr) => tr.id === truckId);

  const submit = async (full: string) => {
    if (!truckId) return;
    setBusy(true);
    setError(null);
    try {
      signIn(await services.driver.signIn(truckId, full));
      setSync({ lastError: null, failures: 0, nextTryAt: 0 });
      // Anything that waited for the PIN goes out now.
      void syncNow(true);
      router.replace('/driver');
    } catch (e) {
      setPin('');
      setError(
        e instanceof SignInError
          ? e.reason === 'locked'
            ? t('driver.signIn.locked', {
                time: e.info.lockedUntil ? formatClock(e.info.lockedUntil) : '',
              })
            : e.reason === 'unknown_truck'
              ? t('driver.signIn.unknownTruck')
              : e.info.attemptsLeft != null
                ? t('driver.signIn.wrongPinLeft', { count: e.info.attemptsLeft })
                : t('driver.signIn.wrongPin')
          : t(e instanceof OfflineError ? 'driver.signIn.offline' : 'driver.signIn.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const onDigit = (d: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          Kolekta
          <AppText variant="display" color={colors.green}>
            PH
          </AppText>{' '}
          <AppText variant="title">· {t('driver.brand')}</AppText>
        </AppText>
        <AppText variant="title">{t('driver.signIn.title')}</AppText>
        <View style={styles.row}>
          <Chip label="Filipino" selected={language === 'fil'} onPress={() => setLanguage('fil')} />
          <Chip label="English" selected={language === 'en'} onPress={() => setLanguage('en')} />
        </View>
      </View>

      {expired && shiftTruck ? (
        <Card style={styles.notice} accessibilityLiveRegion="polite">
          <AppText variant="bodyStrong">{t('driver.signIn.again')}</AppText>
        </Card>
      ) : null}

      {!truck ? (
        <View style={styles.section}>
          <AppText variant="heading">{t('driver.signIn.pickTruck')}</AppText>
          <View style={styles.grid}>
            {trucks.map((tr) => (
              <Pressable
                key={tr.id}
                accessibilityRole="button"
                accessibilityLabel={tr.name}
                onPress={() => {
                  setTruckId(tr.id);
                  setError(null);
                }}
                style={({ pressed }) => [styles.truck, pressed && { opacity: 0.85 }]}
              >
                <Icon name="dump-truck" size={36} color={colors.navy} />
                <AppText variant="title">{tr.code}</AppText>
                <AppText variant="label" color={colors.textMuted}>
                  {tr.name}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <AppText variant="heading" style={styles.center}>
            {t('driver.signIn.pinFor', { truck: truck.name })}
          </AppText>
          <PinPad
            length={pin.length}
            onDigit={onDigit}
            onDelete={() => setPin(pin.slice(0, -1))}
            disabled={busy}
          />
          {busy ? (
            <AppText style={styles.center} accessibilityLiveRegion="polite">
              {t('driver.signIn.checking')}
            </AppText>
          ) : null}
          {error ? (
            <Card style={styles.error} accessibilityLiveRegion="assertive">
              <AppText variant="bodyStrong" color={colors.red}>
                {error}
              </AppText>
            </Card>
          ) : null}
          {demoMode ? (
            <AppText variant="label" color={colors.textMuted} style={styles.center}>
              {t('driver.signIn.demoPin', { pin: DRIVER_DEMO_PIN })}
            </AppText>
          ) : null}
          {shiftTruck ? null : (
            <Button
              variant="secondary"
              icon="swap-horizontal"
              label={t('driver.signIn.changeTruck')}
              onPress={() => {
                setTruckId(null);
                setPin('');
                setError(null);
              }}
            />
          )}
        </View>
      )}

      <View style={styles.footer}>
        <SampleDataBadge />
        <Button
          variant="secondary"
          icon="arrow-left"
          label={t('enro.nav.backToDemo')}
          onPress={() => router.replace('/demo')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  section: { gap: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  truck: {
    flexBasis: '45%',
    flexGrow: 1,
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.navy,
  },
  center: { textAlign: 'center' },
  error: { backgroundColor: colors.redSoft, borderColor: colors.red },
  notice: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
  footer: { gap: spacing.md },
});
