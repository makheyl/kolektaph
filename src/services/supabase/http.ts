/**
 * The few HTTP calls the app makes to Supabase, written directly on `fetch`: table reads and
 * entry points (PostgREST), sign-in (Auth) and photos (Storage). Kept this small on purpose: the
 * client library would add its whole size to the first download of the resident app.
 */
import { OfflineError, ServerError } from '../errors';
import type { ApiConfig } from './config';

/** Who a request is made as: nobody, this device's guest identity, or the City ENRO login. */
export type Caller = 'anon' | 'guest' | 'staff';

export interface TokenSource {
  /** A valid access token for the caller, or null when that identity is not signed in. */
  token(caller: Exclude<Caller, 'anon'>): Promise<string | null>;
  /** The server said the token is no longer good: get a fresh one (null if it cannot). */
  renew(caller: Exclude<Caller, 'anon'>): Promise<string | null>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  as?: Caller;
  /** An access token to send as it is (sign-out), instead of asking the token source. */
  bearer?: string;
  /** Query string values (table filters, or arguments of a read-only entry point). */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** JSON body, or raw bytes with `contentType`. */
  body?: unknown;
  contentType?: string;
  /** Give up after this long (ms). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

const queryString = (query: RequestOptions['query']) => {
  const parts = Object.entries(query ?? {}).flatMap(([k, v]) =>
    v == null ? [] : [`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`],
  );
  return parts.length ? `?${parts.join('&')}` : '';
};

/** The reason in an error answer, whichever of the three services sent it. */
export function errorFrom(status: number, body: unknown): ServerError {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  // An entry point's own refusal: SQLSTATE "PT<status>" with the short reason as the message.
  if (typeof b.code === 'string' && /^PT\d{3}$/.test(b.code) && text(b.message)) {
    return new ServerError(String(b.message), status, text(b.details));
  }
  const code =
    text(b.error_code) ?? // Auth
    text(b.code) ?? // PostgREST and Postgres
    text(b.error) ?? // Storage ("Duplicate"), older Auth
    `http_${status}`;
  const detail = text(b.message) ?? text(b.msg) ?? text(b.error_description);
  return new ServerError(code, status, detail);
}

/**
 * A rejected or expired access token, as each service reports it: PostgREST (PGRST301-303),
 * Auth ("bad_jwt") and Storage ("jwt expired", sometimes under status 400).
 */
const isTokenProblem = (e: ServerError) =>
  [400, 401, 403].includes(e.status) &&
  (/^PGRST30\d$/.test(e.code) || /\bjwt\b/i.test(`${e.code.replace(/_/g, ' ')} ${e.detail ?? ''}`));

export function createHttp(
  config: ApiConfig,
  tokens: TokenSource,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
) {
  async function send<T>(
    method: string,
    path: string,
    options: RequestOptions,
    token: string | null,
  ): Promise<T> {
    const headers: Record<string, string> = { apikey: config.key, Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
      body = options.body as BodyInit;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(`${config.url}${path}${queryString(options.query)}`, {
        method,
        headers,
        body,
        signal: abort.signal,
      });
    } catch {
      // No signal, a dropped connection or a timeout: nothing reached us, so it is safe to retry.
      throw new OfflineError();
    } finally {
      clearTimeout(timer);
    }

    const raw = await response.text().catch(() => '');
    let parsed: unknown = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) throw errorFrom(response.status, parsed);
    return parsed as T;
  }

  /** One request; a token the server no longer accepts is renewed once and the request retried. */
  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    if (options.bearer) return send<T>(method, path, options, options.bearer);
    const as = options.as ?? 'anon';
    const token = as === 'anon' ? null : await tokens.token(as);
    try {
      return await send<T>(method, path, options, token);
    } catch (e) {
      if (as === 'anon' || !token || !(e instanceof ServerError) || !isTokenProblem(e)) throw e;
      const fresh = await tokens.renew(as);
      if (!fresh || fresh === token) throw e;
      return send<T>(method, path, options, fresh);
    }
  }

  return {
    request,
    /** Rows of a table (or view) the caller may read. */
    select: <T>(table: string, query: RequestOptions['query'], as: Caller = 'anon') =>
      request<T[]>('GET', `/rest/v1/${table}`, { query, as }),
    /** A read-only entry point (arguments in the query string). */
    read: <T>(fn: string, args: RequestOptions['query'], as: Caller = 'anon') =>
      request<T>('GET', `/rest/v1/rpc/${fn}`, { query: args, as }),
    /** An entry point that writes (arguments as JSON). */
    call: <T>(fn: string, args: Record<string, unknown>, as: Caller) =>
      request<T>('POST', `/rest/v1/rpc/${fn}`, { body: args, as }),
  };
}

export type Http = ReturnType<typeof createHttp>;

/** For requests that never carry a signed-in identity (the sign-in calls themselves). */
export const NO_TOKENS: TokenSource = { token: async () => null, renew: async () => null };
