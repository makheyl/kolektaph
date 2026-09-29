import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

// Defines the shift GPS task at startup (Android may start the app just to deliver locations).
import '@/features/driver/recorder';
import i18n from '@/i18n';
import { useSettings, useSettingsHydrated } from '@/stores/settings';
import { startTabSync } from '@/stores/tabSync';

void SplashScreen.preventAutoHideAsync();
// Web demo: tabs share the mock server (driver tab ↔ City ENRO tab).
startTabSync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const language = useSettings((s) => s.language);
  // Wait for saved settings so returning residents never see onboarding flash by.
  const hydrated = useSettingsHydrated();

  useEffect(() => {
    void i18n.changeLanguage(language);
    // Screen readers on web pick the right pronunciation from <html lang>.
    if (Platform.OS === 'web') document.documentElement.lang = language;
  }, [language]);

  const ready = fontsLoaded && hydrated;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
