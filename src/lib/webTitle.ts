import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

const APP_NAME = 'KolektaPH';

/**
 * On the web, names the browser tab (and its history entries) after the screen in view:
 * "Iskedyul · KolektaPH". Called by the bars at the top of screens; no title = just the app's name.
 */
export function useWebTitle(title?: string | null): void {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    }, [title]),
  );
}
