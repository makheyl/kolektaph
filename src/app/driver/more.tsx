import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Notice } from '@/components/ui/Notice';
import { forgetSignIn, savedTruck } from '@/features/driver/fingerprint';
import { useTrucks } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { useDriver } from '@/stores/driver';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/**
 * "More": which truck this phone is signed in as, and the rest of what the crew can open. The
 * shift's own rows show during a shift; signing out is offered when no shift is on the phone
 * (a shift is ended first, so nothing recorded is left behind).
 */
export default function DriverMore() {
  const { t } = useTranslation();
  const session = useDriver((s) => s.session);
  const shift = useDriver((s) => s.shift);
  const signOut = useDriver((s) => s.signOut);
  const { data: trucks = [] } = useTrucks();
  const [finger, setFinger] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  useEffect(() => {
    let live = true;
    void savedTruck().then((id) => {
      if (live) setFinger(id);
    });
    return () => {
      live = false;
    };
  }, []);

  const truckId = shift?.truckId ?? session?.truckId ?? null;
  if (!truckId) return <Redirect href="/driver/sign-in" />;
  const truck = trucks.find((tr) => tr.id === truckId);
  const onShift = shift != null && shift.endedAt == null;

  return (
    <Screen
      tone="mint"
      header={
        <AppHeader
          title={t('driver.more.title')}
          leading={
            <IconButton
              icon="arrow-left"
              label={t('common.back')}
              onPress={() => goBack('/driver/shift')}
            />
          }
        />
      }
    >
      <View style={styles.who}>
        <View style={styles.code} aria-hidden>
          <AppText variant="title" color={colors.textOnDark} style={styles.codeText}>
            {truck?.code}
          </AppText>
        </View>
        <AppText variant="title" color={colors.primary}>
          {truck?.name}
        </AppText>
        <AppText variant="label" color={colors.ink}>
          {t(onShift ? 'driver.shift.statusTitle' : 'driver.home.noShift')}
        </AppText>
      </View>

      <View style={styles.list}>
        {onShift ? (
          <>
            <ListRow
              variant="card"
              icon="cloud-upload-outline"
              title={t('driver.shift.gpsLog')}
              onPress={() => router.push('/driver/gps')}
            />
            <ListRow
              variant="card"
              icon="car-wrench"
              title={t('driver.shift.buttons.incident')}
              onPress={() => router.push('/driver/incident')}
            />
            <ListRow
              variant="card"
              icon="stop-circle-outline"
              title={t('driver.shift.endShift')}
              danger
              onPress={() => router.push('/driver/end')}
            />
          </>
        ) : (
          <>
            <ListRow
              variant="card"
              icon="play-circle"
              title={t('driver.home.start')}
              onPress={() => router.push('/driver/start')}
            />
            <ListRow
              variant="card"
              icon="logout"
              title={t('driver.more.signOut')}
              danger
              onPress={() => {
                signOut();
                router.replace('/driver/sign-in');
              }}
            />
          </>
        )}
        {finger ? (
          <ListRow
            variant="card"
            icon="fingerprint-off"
            title={t('driver.more.fingerprintOff')}
            trailing="none"
            onPress={() => {
              void forgetSignIn();
              setFinger(null);
              setRemoved(true);
            }}
          />
        ) : null}
        {removed ? (
          <Notice tone="success" live="polite" text={t('driver.more.fingerprintOffDone')} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { alignItems: 'center', gap: spacing.xs },
  code: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  codeText: { fontFamily: fonts.extrabold },
  list: { gap: spacing.md },
});
