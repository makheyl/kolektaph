import { type Href, router } from 'expo-router';

/** Back if there is history (e.g. a web user who opened a deep link has none), else `fallback`. */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
