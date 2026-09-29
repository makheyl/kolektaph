import { Stack } from 'expo-router';

import { useDriverRuntime } from '@/features/driver/hooks';

/** Driver app: plain stack (no tabs), with the upload loop and live truck view always running. */
export default function DriverLayout() {
  useDriverRuntime();
  return <Stack screenOptions={{ headerShown: false }} />;
}
