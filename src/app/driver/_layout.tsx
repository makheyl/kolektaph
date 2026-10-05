import { Redirect, Stack, usePathname } from 'expo-router';

import { useDriverRuntime } from '@/features/driver/hooks';
import { useDriver } from '@/stores/driver';

/** Driver app: plain stack (no tabs), with the upload loop and live truck view always running. */
export default function DriverLayout() {
  useDriverRuntime();
  const session = useDriver((s) => s.session);
  const shift = useDriver((s) => s.shift);
  const pathname = usePathname();
  // The truck sign-in ended while a shift is on the phone (it lasts 18 hours, or the PIN was
  // changed): ask for the PIN again. The shift and every unsent report stay on the phone.
  const needsPin = !session && shift != null && pathname !== '/driver/sign-in';
  return (
    <>
      {needsPin ? <Redirect href="/driver/sign-in" /> : null}
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
