import * as SplashScreen from 'expo-splash-screen';

/**
 * Takes the launch screen away once the app has something to show. Safe to call again. On the
 * web the launch screen is part of the page instead (see splash.web.ts and public/index.html).
 */
export function hideAppSplash(): void {
  void SplashScreen.hideAsync();
}
