/**
 * Where the pilot database is. Both values are public by design: the publishable key only lets a
 * device do what the database's own rules allow (see supabase/README.md). They come from
 * EXPO_PUBLIC_ variables, so a build can point at another project; without them the app runs on
 * the sample (mock) services.
 */
export interface ApiConfig {
  /** "https://<project>.supabase.co", no trailing slash. */
  url: string;
  /** The publishable key. Never a secret key. */
  key: string;
}

/**
 * Only a publishable key may be shipped in an app: "sb_publishable_…", or the older "anon"
 * token. Anything else (a secret key, a service-role token, something unreadable) is refused.
 */
export function isPublishableKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  const payload = key.split('.')[1];
  if (!key.startsWith('eyJ') || !payload) return false;
  try {
    const json = JSON.parse(globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json.role === 'anon';
  } catch {
    return false;
  }
}

export function readConfig(url: string | undefined, key: string | undefined): ApiConfig | null {
  const cleanUrl = (url ?? '').trim().replace(/\/+$/, '');
  const cleanKey = (key ?? '').trim();
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(cleanUrl) || !cleanKey) return null;
  if (!isPublishableKey(cleanKey)) {
    console.warn('KolektaPH: EXPO_PUBLIC_SUPABASE_KEY is not a publishable key. Ignoring it.');
    return null;
  }
  return { url: cleanUrl, key: cleanKey };
}

/**
 * The project this build talks to, or null to run on the sample services. Tests always run on
 * the sample services.
 */
export const SUPABASE: ApiConfig | null =
  process.env.NODE_ENV === 'test'
    ? null
    : readConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY);
