import { Redirect } from 'expo-router';

// Until onboarding exists (Sprint S2), the entry point is the demo role picker.
export default function Index() {
  return <Redirect href="/demo" />;
}
