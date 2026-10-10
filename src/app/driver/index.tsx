import { Redirect } from 'expo-router';

import { useDriver } from '@/stores/driver';

/** Sends the driver to the right step: sign in → start shift → shift → end-of-shift summary. */
export default function DriverIndex() {
  const session = useDriver((s) => s.session);
  const shift = useDriver((s) => s.shift);
  if (shift && shift.endedAt == null) return <Redirect href="/driver/shift" />;
  if (shift) return <Redirect href="/driver/end" />;
  if (!session) return <Redirect href="/driver/sign-in" />;
  return <Redirect href="/driver/shift" />;
}
