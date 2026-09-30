import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { usePendingReportsSync } from '@/features/reports/hooks';
import { useSettings } from '@/stores/settings';
import { colors, fonts } from '@/theme/tokens';

function tabIcon(active: IconName, inactive: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    // Shape changes (filled vs outline) as well as colour, so the active tab isn't colour-only.
    // The tint colours are our own hex strings (tabBarActive/InactiveTintColor below).
    return <Icon name={focused ? active : inactive} size={28} color={color as string} />;
  }
  return TabIcon;
}

export default function ResidentLayout() {
  const { t } = useTranslation();
  const onboarded = useSettings((s) => s.onboarded);
  usePendingReportsSync();
  if (!onboarded) return <Redirect href="/onboarding/language" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.grey,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 13 },
        tabBarStyle: { minHeight: 64, paddingTop: 6, backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('resident.tabs.home'),
          tabBarIcon: tabIcon('home-variant', 'home-variant-outline'),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: t('resident.tabs.map'), tabBarIcon: tabIcon('map', 'map-outline') }}
      />
      <Tabs.Screen
        name="kolek"
        options={{
          title: t('resident.tabs.kolek'),
          tabBarIcon: tabIcon('chat-question', 'chat-question-outline'),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: t('resident.tabs.report'),
          tabBarIcon: tabIcon('camera', 'camera-outline'),
        }}
      />
      {/* Reached from Home and Settings, not the tab bar. */}
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="barangay" options={{ href: null }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="missed" options={{ href: null }} />
      <Tabs.Screen name="reports/index" options={{ href: null }} />
      <Tabs.Screen name="reports/[id]" options={{ href: null }} />
    </Tabs>
  );
}
