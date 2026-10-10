import { Redirect } from 'expo-router';

import { useSettings } from '@/stores/settings';

/**
 * Entry point. A resident who finished onboarding lands straight on Home and a driver on the
 * driver app (a shift in progress continues); everyone else sees the welcome screen.
 */
export default function Index() {
  const { role, onboarded } = useSettings();
  if (role === 'resident' && onboarded) return <Redirect href="/resident" />;
  if (role === 'driver') return <Redirect href="/driver" />;
  return <Redirect href="/welcome" />;
}
