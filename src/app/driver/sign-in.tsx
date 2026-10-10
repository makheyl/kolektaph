import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/layout/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Icon } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { DRIVER_DEMO_PIN } from '@/data/carmona';
import { PinPad } from '@/features/driver/components/PinPad';
import {
  canUseFingerprint,
  forgetSignIn,
  readSignIn,
  savedTruck,
  saveSignIn,
} from '@/features/driver/fingerprint';
import { syncNow } from '@/features/driver/sync';
import { useTrucks } from '@/features/tracking/hooks';
import { formatClock } from '@/lib/time';
import { OfflineError, services, SignInError } from '@/services';
import { useDemo } from '@/stores/demo';
import { useDriver } from '@/stores/driver';
import { colors, radius, shadows, spacing, touch } from '@/theme/tokens';

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
  const [picked, setTruckId] = useState<string | null>(null);
  const truckId = shiftTruck ?? picked;
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  // Fingerprint sign-in: offered only on a phone with a fingerprint or face set up.
  const [canFinger] = useState(canUseFingerprint);
  const [fingerTruck, setFingerTruck] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    let live = true;
    void savedTruck().then((id) => {
      if (live) setFingerTruck(id);
    });
    return () => {
      live = false;
    };
  }, []);

  if (session) return <Redirect href="/driver" />;
  const truck = trucks.find((tr) => tr.id === truckId);
  // The list of trucks is open until one is chosen, and again when the crew asks to change it.
  const choosing = !shiftTruck && (picking || !truck);

  const submit = async (id: string | null, full: string, byFinger = false) => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const signedIn = await services.driver.signIn(id, full);
      // Asked for and not yet saved: the phone asks for a finger once, to lock the PIN away.
      if (remember && canFinger && !byFinger) {
        await saveSignIn({ truckId: id, pin: full }, t('driver.signIn.fingerprintSave'));
      }
      signIn(signedIn);
      setSync({ lastError: null, failures: 0, nextTryAt: 0 });
      // Anything that waited for the PIN goes out now.
      void syncNow(true);
      router.replace('/driver');
    } catch (e) {
      setPin('');
      // The saved PIN is no longer the truck's PIN: it is of no use on this phone any more.
      const stale = byFinger && e instanceof SignInError && e.reason === 'wrong_pin';
      if (stale) {
        void forgetSignIn();
        setFingerTruck(null);
      }
      setError(
        stale
          ? t('driver.signIn.fingerprintOldPin')
          : e instanceof SignInError
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

  const withFinger = async () => {
    if (busy) return;
    setError(null);
    const saved = await readSignIn(t('driver.signIn.fingerprintPrompt'));
    if (saved === 'cancelled') return;
    if (saved === 'gone') {
      setFingerTruck(null);
      setError(t('driver.signIn.fingerprintGone'));
      return;
    }
    setTruckId(saved.truckId);
    await submit(saved.truckId, saved.pin, true);
  };
  // A shift on the phone is one truck's: the fingerprint of another truck is not offered for it.
  const fingerOffered =
    canFinger && fingerTruck != null && (!shiftTruck || shiftTruck === fingerTruck);
  const fingerName = trucks.find((tr) => tr.id === fingerTruck)?.name ?? '';

  const onDigit = (d: string) => {
    if (busy || pin.length >= 4) return;
    setPin(pin + d);
  };

  return (
    <AuthShell
      exit="/sign-in"
      brand="driver"
      tone="mint"
      quietTitle
      title={t('driver.signIn.tagline')}
    >
      {expired && shiftTruck ? (
        <Notice tone="warning" live="polite" text={t('driver.signIn.again')} />
      ) : null}

      {/* The truck stands where the design has the driver's ID: a crew signs in as its truck. */}
      <View style={styles.field}>
        <AppText variant="label" color={colors.primary}>
          {t('driver.signIn.truck')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            truck
              ? `${truck.name}. ${t('driver.signIn.changeTruck')}`
              : t('driver.signIn.pickTruck')
          }
          accessibilityState={{ expanded: choosing, disabled: !!shiftTruck }}
          disabled={!!shiftTruck}
          onPress={() => setPicking(!picking)}
          style={({ pressed, hovered }: PressState) => [
            styles.input,
            (pressed || hovered) && { backgroundColor: colors.mintSoft },
          ]}
        >
          <Icon name="card-account-details-outline" size={28} color={colors.primary} />
          <AppText
            variant="bodyStrong"
            color={truck ? colors.text : colors.textMuted}
            style={styles.flex}
          >
            {truck ? `${truck.code} · ${truck.name}` : t('driver.signIn.pickTruck')}
          </AppText>
          {shiftTruck ? null : (
            <Icon
              name={choosing ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={colors.primary}
            />
          )}
        </Pressable>
        {choosing ? (
          <View style={styles.grid}>
            {trucks.map((tr) => (
              <Pressable
                key={tr.id}
                accessibilityRole="button"
                accessibilityLabel={tr.name}
                accessibilityState={{ selected: tr.id === truckId }}
                onPress={() => {
                  setTruckId(tr.id);
                  setPicking(false);
                  setPin('');
                  setError(null);
                }}
                style={({ pressed, hovered }: PressState) => [
                  styles.truck,
                  tr.id === truckId && styles.truckOn,
                  (pressed || hovered) && { backgroundColor: colors.mintSoft },
                ]}
              >
                <Icon name="dump-truck" size={26} color={colors.primary} />
                <AppText variant="heading" color={colors.ink}>
                  {tr.code}
                </AppText>
                <AppText variant="label" color={colors.textMuted}>
                  {tr.name}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {truck ? (
        <View style={styles.field}>
          <AppText variant="label" color={colors.primary} accessibilityRole="header">
            {t('driver.signIn.pinFor', { truck: truck.name })}
          </AppText>
          <View
            style={styles.input}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('driver.signIn.pinDots', { count: pin.length })}
            accessibilityValue={{ min: 0, max: 4, now: pin.length }}
          >
            <Icon name="lock" size={28} color={colors.primary} />
            <AppText variant="title" style={styles.pin}>
              {'•'.repeat(pin.length)}
            </AppText>
          </View>
          {/* Big keys, not the phone keyboard: the crew wears gloves. */}
          <PinPad
            dots={false}
            length={pin.length}
            onDigit={onDigit}
            onDelete={() => setPin(pin.slice(0, -1))}
            disabled={busy}
          />
        </View>
      ) : null}

      {error ? <Notice tone="danger" live="assertive" text={error} /> : null}
      <Button
        label={t('driver.signIn.logIn')}
        disabled={!truck || pin.length < 4}
        loading={busy}
        onPress={() => void submit(truckId, pin)}
      />
      {canFinger && truck && fingerTruck !== truckId ? (
        <View>
          <Checkbox
            checked={remember}
            onChange={setRemember}
            label={t('driver.signIn.rememberFingerprint')}
          />
          <AppText variant="label" color={colors.textMuted}>
            {t('driver.signIn.rememberHint')}
          </AppText>
        </View>
      ) : null}
      {fingerOffered ? (
        <Button
          variant="secondary"
          icon="fingerprint"
          label={t('driver.signIn.useFingerprint')}
          accessibilityHint={t('driver.signIn.fingerprintFor', { truck: fingerName })}
          disabled={busy}
          onPress={() => void withFinger()}
        />
      ) : null}
      {demoMode && truck ? (
        <AppText variant="label" color={colors.ink} style={styles.center}>
          {t('driver.signIn.demoPin', { pin: DRIVER_DEMO_PIN })}
        </AppText>
      ) : null}

      <SampleDataBadge centered />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  // The white field of the design: an icon, then what was entered.
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.large + 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  pin: { letterSpacing: 6, minHeight: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  truck: {
    flexBasis: '45%',
    flexGrow: 1,
    minHeight: touch.driver,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.mintEdge,
  },
  truckOn: { borderColor: colors.primary, backgroundColor: colors.mintSoft },
  center: { textAlign: 'center' },
});
