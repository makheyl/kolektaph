import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FontDisplay, useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

// Defines the shift GPS task at startup (Android may start the app just to deliver locations).
import '@/features/driver/recorder';
import i18n from '@/i18n';
import { watchNetwork } from '@/lib/network';
import { registerServiceWorker } from '@/lib/pwa';
import { useSettings, useSettingsHydrated } from '@/stores/settings';
import { startTabSync } from '@/stores/tabSync';

void SplashScreen.preventAutoHideAsync();
// Web demo: tabs share the mock server (driver tab ↔ City ENRO tab).
startTabSync();
// Offline queues (driver reports, resident reports) need to know when signal returns.
watchNetwork();
registerServiceWorker();

const queryClient = new QueryClient();

/** Text shows at once in the phone's own font and switches to Inter when it arrives. */
const FONT_DISPLAY = FontDisplay.SWAP;

/** Inter cut down to the characters the app uses (scripts/fonts/subset-fonts.mjs). */
const INTER = {
  regular: require('../../assets/fonts/Inter_400Regular.ttf'),
  semibold: require('../../assets/fonts/Inter_600SemiBold.ttf'),
  bold: require('../../assets/fonts/Inter_700Bold.ttf'),
  extrabold: require('../../assets/fonts/Inter_800ExtraBold.ttf'),
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular: { uri: INTER.regular, display: FONT_DISPLAY },
    Inter_600SemiBold: { uri: INTER.semibold, display: FONT_DISPLAY },
    Inter_700Bold: { uri: INTER.bold, display: FONT_DISPLAY },
    Inter_800ExtraBold: { uri: INTER.extrabold, display: FONT_DISPLAY },
  });
  const language = useSettings((s) => s.language);
  // Wait for saved settings so returning residents never see onboarding flash by.
  const hydrated = useSettingsHydrated();

  useEffect(() => {
    void i18n.changeLanguage(language);
    // Screen readers on web pick the right pronunciation from <html lang>.
    if (Platform.OS === 'web') document.documentElement.lang = language;
  }, [language]);

  // On the web, show text in a fallback font while Inter downloads (slow 3G): waiting for four
  // font files before drawing anything would delay the first screen by seconds.
  const ready = (fontsLoaded || Platform.OS === 'web') && hydrated;
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
