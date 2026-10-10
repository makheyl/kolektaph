import { Redirect, Tabs } from 'expo-router';

import { PhoneFrame } from '@/components/layout/PhoneFrame';
import { usePendingReportsSync } from '@/features/reports/hooks';
import { ResidentTabBar } from '@/features/resident/components/ResidentTabBar';
import { useSmsSignupSync } from '@/features/resident/useSmsSignup';
import { useSettings } from '@/stores/settings';
import { colors } from '@/theme/tokens';

export default function ResidentLayout() {
  const onboarded = useSettings((s) => s.onboarded);
  usePendingReportsSync();
  useSmsSignupSync();
  if (!onboarded) return <Redirect href="/onboarding/language" />;

  return (
    <PhoneFrame bottomBar>
      <Tabs
        tabBar={(props) => <ResidentTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.page } }}
      >
        {/* The four tabs, in the order the bar shows them (see ResidentTabBar). */}
        <Tabs.Screen name="index" />
        <Tabs.Screen name="map" />
        <Tabs.Screen name="alerts" />
        <Tabs.Screen name="settings" />
        {/* Reached from Home (the bar still in view): Report Waste and Ask Kolek. */}
        <Tabs.Screen name="report" options={{ href: null }} />
        <Tabs.Screen name="kolek" options={{ href: null }} />
        {/* Reached from Home and Profile, with the bar still in view. */}
        <Tabs.Screen name="schedule" options={{ href: null }} />
        <Tabs.Screen name="barangay" options={{ href: null }} />
        <Tabs.Screen name="privacy" options={{ href: null }} />
        <Tabs.Screen name="missed" options={{ href: null }} />
        <Tabs.Screen name="reports/index" options={{ href: null }} />
        <Tabs.Screen name="reports/[id]" options={{ href: null }} />
        {/* Under Profile: the Profile tab stays marked on these. */}
        <Tabs.Screen name="account/index" options={{ href: null }} />
        <Tabs.Screen name="account/notifications" options={{ href: null }} />
        <Tabs.Screen name="account/language" options={{ href: null }} />
        <Tabs.Screen name="account/help" options={{ href: null }} />
        <Tabs.Screen name="account/personal" options={{ href: null }} />
        <Tabs.Screen name="account/security" options={{ href: null }} />
        {/* The newer features (each hidden where the build does not offer it). */}
        <Tabs.Screen name="rewards/index" options={{ href: null }} />
        <Tabs.Screen name="rewards/redeem" options={{ href: null }} />
        <Tabs.Screen name="rewards/how" options={{ href: null }} />
        <Tabs.Screen name="rewards/voucher/[id]" options={{ href: null }} />
        <Tabs.Screen name="hauling/new" options={{ href: null }} />
        <Tabs.Screen name="hauling/[id]/index" options={{ href: null }} />
        <Tabs.Screen name="hauling/[id]/checkout" options={{ href: null }} />
        <Tabs.Screen name="scanner" options={{ href: null }} />
        <Tabs.Screen name="impact" options={{ href: null }} />
      </Tabs>
    </PhoneFrame>
  );
}
