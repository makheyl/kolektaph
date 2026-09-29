import { Redirect } from 'expo-router';

import { useSettings } from '@/stores/settings';

/**
 * Entry point. A resident who finished onboarding lands straight on Home; everyone else sees
 * the demo role picker (prototype phase).
 */
export default function Index() {
  const { role, onboarded } = useSettings();
  if (role === 'resident' && onboarded) return <Redirect href="/resident" />;
  return <Redirect href="/demo" />;
}
