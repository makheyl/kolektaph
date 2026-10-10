import { Redirect, Stack, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DRIVER_BAR_SCREENS, DriverTabBar } from '@/features/driver/components/DriverTabBar';
import { useDriverRuntime } from '@/features/driver/hooks';
import { useDriver } from '@/stores/driver';

/**
 * Driver app: a stack of screens, with the upload loop and live truck view always running. The
 * bar at the bottom reaches the four screens of a shift (Home, Route, GPS log, Truck).
 */
export default function DriverLayout() {
  useDriverRuntime();
  const session = useDriver((s) => s.session);
  const shift = useDriver((s) => s.shift);
  const pathname = usePathname();
  // The truck sign-in ended while a shift is on the phone (it lasts 18 hours, or the PIN was
  // changed): ask for the PIN again. The shift and every unsent report stay on the phone.
  const needsPin = !session && shift != null && pathname !== '/driver/sign-in';
  // From sign-in on, as in the design. Once a shift has ended only its summary is left to see.
  const onShift = shift != null && shift.endedAt == null;
  const withBar =
    (session != null || shift != null) &&
    shift?.endedAt == null &&
    DRIVER_BAR_SCREENS.includes(pathname);
  return (
    <View style={styles.root}>
      {needsPin ? <Redirect href="/driver/sign-in" /> : null}
      <View style={styles.stack}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      {withBar ? <DriverTabBar onShift={onShift} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stack: { flex: 1 },
});
