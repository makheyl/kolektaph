/**
 * The two identities a device can have on the server, kept side by side:
 *
 *   guest  an anonymous identity, made the first time the device reports, signs up for texts or
 *          signs in to a truck. It owns the resident's reports and the truck sign-in.
 *   staff  a City ENRO login (email and password), used by the dashboard only.
 *
 * Keeping them apart lets a driver tab and a City ENRO tab share one browser, and a staff
 * sign-in never replaces (and so never loses) the device's guest identity.
 *
 * Sessions are saved on the device. An access token lasts an hour and is renewed shortly before
 * it ends; a session the server no longer knows is dropped.
 */
import { OfflineError, ServerError } from '../errors';
import type { ApiConfig } from './config';
import { createHttp, type FetchLike, NO_TOKENS, type TokenSource } from './http';

export type IdentityKind = 'guest' | 'staff';
const KINDS: IdentityKind[] = ['guest', 'staff'];

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Device time (epoch ms) at which the access token ends. */
  expiresAt: number;
  userId: string;
  anonymous: boolean;
  email: string | null;
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const AUTH_KEYS: Record<IdentityKind, string> = {
  guest: 'kolektaph.auth.guest',
  staff: 'kolektaph.auth.staff',
};

/** Renew this long before the token ends, so a request never leaves with a dying token. */
const RENEW_MARGIN_MS = 60_000;

interface SessionAnswer {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user?: { id?: unknown; is_anonymous?: unknown; email?: unknown } | null;
}

function parseStored(raw: string | null): AuthSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<AuthSession>;
    return typeof s.accessToken === 'string' &&
      typeof s.refreshToken === 'string' &&
      typeof s.expiresAt === 'number' &&
      typeof s.userId === 'string'
      ? {
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          expiresAt: s.expiresAt,
          userId: s.userId,
          anonymous: s.anonymous === true,
          email: typeof s.email === 'string' ? s.email : null,
        }
      : null;
  } catch {
    return null;
  }
}

/** A session the server will not renew: it is gone for good (4xx, except "slow down"). */
const isGone = (e: unknown) =>
  e instanceof ServerError && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status);

export function createAuth(
  config: ApiConfig,
  store: KeyValueStore,
  fetchImpl?: FetchLike,
  now: () => number = () => Date.now(),
) {
  const http = createHttp(config, NO_TOKENS, fetchImpl);
  const sessions: Record<IdentityKind, AuthSession | null> = { guest: null, staff: null };
  const listeners = new Set<() => void>();
  const renewing: Partial<Record<IdentityKind, Promise<AuthSession | null>>> = {};
  let makingGuest: Promise<AuthSession> | null = null;
  let loaded = false;

  const notify = () => listeners.forEach((l) => l());

  const read = async (kind: IdentityKind) => {
    try {
      return parseStored(await store.getItem(AUTH_KEYS[kind]));
    } catch {
      return null;
    }
  };

  const keep = async (kind: IdentityKind, session: AuthSession | null) => {
    sessions[kind] = session;
    try {
      if (session) await store.setItem(AUTH_KEYS[kind], JSON.stringify(session));
      else await store.removeItem(AUTH_KEYS[kind]);
    } catch {
      // Storage is full or unavailable: the session still works until the app closes.
    }
    notify();
  };

  const hydrated = (async () => {
    for (const kind of KINDS) sessions[kind] = await read(kind);
    loaded = true;
    notify();
  })();

  const toSession = (answer: SessionAnswer): AuthSession => {
    const { access_token, refresh_token, expires_in, user } = answer;
    if (
      typeof access_token !== 'string' ||
      typeof refresh_token !== 'string' ||
      typeof expires_in !== 'number' ||
      typeof user?.id !== 'string'
    ) {
      throw new ServerError('bad_session', 502);
    }
    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      // From this device's own clock, so a wrong phone clock cannot make a fresh token look old.
      expiresAt: now() + expires_in * 1000,
      userId: user.id,
      anonymous: user.is_anonymous === true,
      email: typeof user.email === 'string' && user.email ? user.email : null,
    };
  };

  /** One renewal at a time per identity. Returns null when the session is gone. */
  const renew = (kind: IdentityKind): Promise<AuthSession | null> => {
    const running = renewing[kind];
    if (running) return running;
    const started = (async () => {
      await hydrated;
      const mine = sessions[kind];
      // Another tab of the same browser may have renewed already: use what it saved.
      const saved = await read(kind);
      if (
        saved &&
        saved.refreshToken !== mine?.refreshToken &&
        saved.expiresAt - now() > RENEW_MARGIN_MS
      ) {
        sessions[kind] = saved;
        notify();
        return saved;
      }
      const base = saved ?? mine;
      if (!base) return null;
      try {
        const next = toSession(
          await http.request<SessionAnswer>('POST', '/auth/v1/token', {
            query: { grant_type: 'refresh_token' },
            body: { refresh_token: base.refreshToken },
          }),
        );
        await keep(kind, next);
        return next;
      } catch (e) {
        if (!isGone(e)) throw e;
        await keep(kind, null);
        return null;
      }
    })().finally(() => {
      delete renewing[kind];
    });
    renewing[kind] = started;
    return started;
  };

  const tokens: TokenSource = {
    async token(kind) {
      await hydrated;
      const s = sessions[kind];
      if (!s) return null;
      if (s.expiresAt - now() > RENEW_MARGIN_MS) return s.accessToken;
      try {
        return (await renew(kind))?.accessToken ?? null;
      } catch (e) {
        // No signal while the token still has a little life left: use it.
        if (e instanceof OfflineError && s.expiresAt > now()) return s.accessToken;
        throw e;
      }
    },
    renew: async (kind) => (await renew(kind))?.accessToken ?? null,
  };

  // On the web every tab shares the saved sessions: follow what another tab saves.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (e: StorageEvent) => {
      const kind = KINDS.find((k) => AUTH_KEYS[k] === e.key);
      if (!kind) return;
      sessions[kind] = parseStored(e.newValue);
      notify();
    });
  }

  return {
    tokens,
    /** Resolves once the saved sessions are loaded. */
    ready: hydrated,
    isReady: () => loaded,
    /** The identity as it is now (null until `ready`, or when not signed in). */
    current: (kind: IdentityKind) => sessions[kind],
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** This device's guest identity, created on first use. */
    async ensureGuest(): Promise<AuthSession> {
      await hydrated;
      if (sessions.guest) return sessions.guest;
      if (makingGuest) return makingGuest;
      const started = (async () => {
        const saved = await read('guest');
        if (saved) {
          sessions.guest = saved;
          notify();
          return saved;
        }
        const session = toSession(
          await http.request<SessionAnswer>('POST', '/auth/v1/signup', { body: { data: {} } }),
        );
        await keep('guest', session);
        return session;
      })().finally(() => {
        makingGuest = null;
      });
      makingGuest = started;
      return started;
    },

    /** City ENRO sign-in. The password goes to the sign-in service only and is never kept. */
    async signInStaff(email: string, password: string): Promise<AuthSession> {
      await hydrated;
      const session = toSession(
        await http.request<SessionAnswer>('POST', '/auth/v1/token', {
          query: { grant_type: 'password' },
          body: { email: email.trim(), password },
        }),
      );
      await keep('staff', session);
      return session;
    },

    /** Ends the session on the server (best effort) and forgets it on this device. */
    async signOut(kind: IdentityKind): Promise<void> {
      await hydrated;
      const s = sessions[kind];
      if (!s) return;
      try {
        await http.request('POST', '/auth/v1/logout', {
          query: { scope: 'local' },
          bearer: s.accessToken,
        });
      } catch {
        // Offline, or already ended: forgetting it here is what matters.
      }
      await keep(kind, null);
    },

    /** Forgets an identity on this device only (the server already removed it). */
    forget: (kind: IdentityKind) => keep(kind, null),
  };
}

export type Auth = ReturnType<typeof createAuth>;
