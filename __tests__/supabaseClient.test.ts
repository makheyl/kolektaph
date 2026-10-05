/**
 * The small Supabase client: configuration, requests and their errors, the two saved identities,
 * and the sync round that keeps the device's copy of the server's data fresh. No network: every
 * test answers the requests itself.
 */
import { ROUTES } from '@/data/carmona';
import { randomUuid, uuidFromText } from '@/lib/uuid';
import { OfflineError, ServerError } from '@/services/errors';
import {
  AUTH_KEYS,
  type AuthSession,
  createAuth,
  type KeyValueStore,
} from '@/services/supabase/auth';
import { isPublishableKey, readConfig } from '@/services/supabase/config';
import {
  createHttp,
  errorFrom,
  type FetchLike,
  type Http,
  NO_TOKENS,
} from '@/services/supabase/http';
import type { EventRow } from '@/services/supabase/mappers';
import { createPhotoStore } from '@/services/supabase/storage';
import { createSync, type PulseAnswer, remoteEvents, useRemote } from '@/services/supabase/sync';
import { followServer, LIVE_CLOCK, simNow } from '@/simulator/clock';
import { useArea } from '@/stores/area';
import { useDemo } from '@/stores/demo';

const CONFIG = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}
type Answer = { status?: number; body?: unknown } | 'offline';

/** A stand-in for fetch: records each request and answers it with `reply`. */
function fakeFetch(reply: (call: Call) => Answer) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const raw = init?.body;
    const call: Call = {
      method: init?.method ?? 'GET',
      path: input.replace(CONFIG.url, ''),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof raw === 'string' ? JSON.parse(raw) : raw,
    };
    calls.push(call);
    const answer = reply(call);
    if (answer === 'offline') throw new TypeError('Network request failed');
    const status = answer.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (answer.body === undefined ? '' : JSON.stringify(answer.body)),
    } as Response;
  };
  return { fetchImpl, calls };
}

function memoryStore(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const sessionAnswer = (n: number, anonymous = true) => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  expires_in: 3600,
  user: { id: 'user-1', is_anonymous: anonymous, email: anonymous ? '' : 'staff@example.test' },
});

describe('configuration', () => {
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;

  it('takes a project address and a publishable key', () => {
    expect(readConfig('https://abc.supabase.co/', ' sb_publishable_x ')).toEqual({
      url: 'https://abc.supabase.co',
      key: 'sb_publishable_x',
    });
    expect(readConfig('https://abc.supabase.co', jwt('anon'))).not.toBeNull();
  });

  it('runs on the sample services when either value is missing or malformed', () => {
    expect(readConfig(undefined, 'sb_publishable_x')).toBeNull();
    expect(readConfig('https://abc.supabase.co', '')).toBeNull();
    expect(readConfig('http://abc.supabase.co', 'sb_publishable_x')).toBeNull();
    expect(readConfig('not a url', 'sb_publishable_x')).toBeNull();
  });

  it('accepts only a publishable key: a secret one is refused outright', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isPublishableKey('sb_publishable_abc')).toBe(true);
    expect(isPublishableKey(jwt('anon'))).toBe(true);
    expect(isPublishableKey('sb_secret_abc')).toBe(false);
    expect(isPublishableKey(jwt('service_role'))).toBe(false);
    expect(isPublishableKey('eyJub3QuYS50b2tlbg')).toBe(false);
    expect(isPublishableKey('anything-else')).toBe(false);
    expect(readConfig('https://abc.supabase.co', 'sb_secret_abc')).toBeNull();
    expect(readConfig('https://abc.supabase.co', jwt('service_role'))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('identifiers made on the device', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it('random references are UUIDs and differ', () => {
    const a = randomUuid();
    const b = randomUuid();
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
  });

  it('the same text always gives the same name, and different texts different names', () => {
    const name = uuidFromText('ref-1|0');
    expect(name).toMatch(UUID);
    expect(uuidFromText('ref-1|0')).toBe(name);
    const names = new Set(
      ['ref-1|0', 'ref-1|1', 'ref-2|0', 't2|task|abc|after', 't2|task|abc|before'].map(
        uuidFromText,
      ),
    );
    expect(names.size).toBe(5);
  });
});

describe('requests', () => {
  it('sends the key, reads rows, and passes arguments of a read in the query string', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: [{ id: 1 }] }));
    const http = createHttp(CONFIG, NO_TOKENS, fetchImpl);
    expect(await http.select('trucks', { select: 'id,code', order: 'id' })).toEqual([{ id: 1 }]);
    await http.read('pulse', { p_seq: 12, p_none: null });
    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/rest/v1/trucks?select=id%2Ccode&order=id',
      headers: { apikey: CONFIG.key },
    });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[1].path).toBe('/rest/v1/rpc/pulse?p_seq=12');
  });

  it('calls an entry point with JSON arguments as the signed-in identity', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: 'KPH-2026-000113' }));
    const http = createHttp(
      CONFIG,
      { token: async (who) => `token-of-${who}`, renew: async () => null },
      fetchImpl,
    );
    expect(await http.call('report_submit', { p_size: 'pile' }, 'guest')).toBe('KPH-2026-000113');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/rest/v1/rpc/report_submit',
      body: { p_size: 'pile' },
      headers: { Authorization: 'Bearer token-of-guest', 'Content-Type': 'application/json' },
    });
  });

  it('an answer with no body (a function that returns nothing) is null', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 204 }));
    expect(await createHttp(CONFIG, NO_TOKENS, fetchImpl).call('x', {}, 'anon')).toBeNull();
  });

  it('no signal is an OfflineError: nothing arrived, so retrying is safe', async () => {
    const { fetchImpl } = fakeFetch(() => 'offline');
    await expect(createHttp(CONFIG, NO_TOKENS, fetchImpl).read('pulse', {})).rejects.toBeInstanceOf(
      OfflineError,
    );
  });

  it('a refusal carries the entry point’s short reason', () => {
    // An entry point's own refusal: SQLSTATE PT<status>, the reason in the message.
    expect(
      errorFrom(429, {
        code: 'PT429',
        message: 'rate_limited',
        details: 'Up to 5 reports an hour.',
      }),
    ).toMatchObject({ code: 'rate_limited', status: 429, detail: 'Up to 5 reports an hour.' });
    // Postgres itself (no grant).
    expect(
      errorFrom(401, { code: '42501', message: 'permission denied for table staff' }),
    ).toMatchObject({ code: '42501', detail: 'permission denied for table staff' });
    // The sign-in service, and storage.
    expect(
      errorFrom(422, { code: 422, error_code: 'anonymous_provider_disabled', msg: 'x' }),
    ).toMatchObject({ code: 'anonymous_provider_disabled', status: 422 });
    expect(
      errorFrom(400, {
        statusCode: '409',
        error: 'Duplicate',
        message: 'The resource already exists',
      }),
    ).toMatchObject({ code: 'Duplicate', detail: 'The resource already exists' });
    expect(errorFrom(502, null).code).toBe('http_502');
  });

  it('renews a token the server no longer accepts, once, and repeats the request', async () => {
    let token = 'old';
    const renew = jest.fn(async () => (token = 'new'));
    const { fetchImpl, calls } = fakeFetch((call) =>
      call.headers.Authorization === 'Bearer old'
        ? { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } }
        : { body: [] },
    );
    const http = createHttp(CONFIG, { token: async () => token, renew }, fetchImpl);
    expect(await http.select('tickets', {}, 'guest')).toEqual([]);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.headers.Authorization)).toEqual(['Bearer old', 'Bearer new']);
  });

  it('does not mistake an entry point’s "sign in first" for a bad token', async () => {
    const renew = jest.fn(async () => 'new');
    const { fetchImpl } = fakeFetch(() => ({
      status: 401,
      body: { code: 'PT401', message: 'driver_sign_in_required' },
    }));
    const http = createHttp(CONFIG, { token: async () => 'tok', renew }, fetchImpl);
    await expect(http.call('driver_upload', {}, 'guest')).rejects.toMatchObject({
      code: 'driver_sign_in_required',
    });
    expect(renew).not.toHaveBeenCalled();
  });
});

describe('the two identities of a device', () => {
  const saved = (over: Partial<AuthSession> = {}): AuthSession => ({
    accessToken: 'access-0',
    refreshToken: 'refresh-0',
    expiresAt: 10_000_000,
    userId: 'user-1',
    anonymous: true,
    email: null,
    ...over,
  });

  it('makes the guest identity once, on first use, and saves it', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: sessionAnswer(1) }));
    const store = memoryStore();
    const auth = createAuth(CONFIG, store, fetchImpl, () => 1_000);
    await auth.ready;
    expect(auth.current('guest')).toBeNull();
    // Two things asking at the same moment still make one identity.
    const [a, b] = await Promise.all([auth.ensureGuest(), auth.ensureGuest()]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/v1/signup', body: { data: {} } });
    expect(a).toMatchObject({ userId: 'user-1', anonymous: true, expiresAt: 1_000 + 3_600_000 });
    expect(JSON.parse(store.data.get(AUTH_KEYS.guest)!)).toMatchObject({
      refreshToken: 'refresh-1',
    });
    expect(await auth.ensureGuest()).toBe(a);
    expect(calls).toHaveLength(1);
    // The staff identity is separate and untouched.
    expect(auth.current('staff')).toBeNull();
  });

  it('finds the saved identity again after a restart', async () => {
    const store = memoryStore({ [AUTH_KEYS.guest]: JSON.stringify(saved()) });
    const { fetchImpl, calls } = fakeFetch(() => ({ body: sessionAnswer(9) }));
    const auth = createAuth(CONFIG, store, fetchImpl, () => 1_000);
    expect((await auth.ensureGuest()).userId).toBe('user-1');
    expect(await auth.tokens.token('guest')).toBe('access-0');
    expect(calls).toHaveLength(0);
  });

  it('renews the token a minute before it ends, one request for many callers', async () => {
    let now = 10_000_000 - 30_000;
    const store = memoryStore({ [AUTH_KEYS.guest]: JSON.stringify(saved()) });
    const { fetchImpl, calls } = fakeFetch(() => ({ body: sessionAnswer(2) }));
    const auth = createAuth(CONFIG, store, fetchImpl, () => now);
    const tokens = await Promise.all([auth.tokens.token('guest'), auth.tokens.token('guest')]);
    expect(tokens).toEqual(['access-2', 'access-2']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: '/auth/v1/token?grant_type=refresh_token',
      body: { refresh_token: 'refresh-0' },
    });
    expect(JSON.parse(store.data.get(AUTH_KEYS.guest)!)).toMatchObject({
      refreshToken: 'refresh-2',
      expiresAt: now + 3_600_000,
    });
    now += 1_000;
    expect(await auth.tokens.token('guest')).toBe('access-2');
    expect(calls).toHaveLength(1);
  });

  it('uses what another tab already renewed instead of renewing again', async () => {
    const now = 10_000_000 - 30_000;
    const store = memoryStore({ [AUTH_KEYS.guest]: JSON.stringify(saved()) });
    const { fetchImpl, calls } = fakeFetch(() => ({ body: sessionAnswer(3) }));
    const auth = createAuth(CONFIG, store, fetchImpl, () => now);
    await auth.ready;
    // Another tab renewed and saved in the meantime.
    store.data.set(
      AUTH_KEYS.guest,
      JSON.stringify(
        saved({
          accessToken: 'access-tab',
          refreshToken: 'refresh-tab',
          expiresAt: now + 3_600_000,
        }),
      ),
    );
    expect(await auth.tokens.token('guest')).toBe('access-tab');
    expect(calls).toHaveLength(0);
  });

  it('keeps the session through a renewal that cannot reach the server', async () => {
    const now = 10_000_000 - 30_000;
    const store = memoryStore({ [AUTH_KEYS.guest]: JSON.stringify(saved()) });
    const { fetchImpl } = fakeFetch(() => 'offline');
    const auth = createAuth(CONFIG, store, fetchImpl, () => now);
    // The token still has 30 seconds: use it.
    expect(await auth.tokens.token('guest')).toBe('access-0');
    expect(auth.current('guest')).not.toBeNull();
    expect(store.data.has(AUTH_KEYS.guest)).toBe(true);
  });

  it('a busy sign-in service does not end the session either', async () => {
    const now = 10_000_000 + 5_000;
    const store = memoryStore({ [AUTH_KEYS.guest]: JSON.stringify(saved()) });
    const { fetchImpl } = fakeFetch(() => ({
      status: 429,
      body: { error_code: 'over_request_rate_limit' },
    }));
    const auth = createAuth(CONFIG, store, fetchImpl, () => now);
    await expect(auth.tokens.token('guest')).rejects.toBeInstanceOf(ServerError);
    expect(auth.current('guest')).not.toBeNull();
  });

  it('drops a session the server no longer knows', async () => {
    const now = 10_000_000 + 5_000;
    const store = memoryStore({ [AUTH_KEYS.guest]: JSON.stringify(saved()) });
    const { fetchImpl } = fakeFetch(() => ({
      status: 400,
      body: { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' },
    }));
    const auth = createAuth(CONFIG, store, fetchImpl, () => now);
    const changes = jest.fn();
    auth.subscribe(changes);
    expect(await auth.tokens.token('guest')).toBeNull();
    expect(auth.current('guest')).toBeNull();
    expect(store.data.has(AUTH_KEYS.guest)).toBe(false);
    expect(changes).toHaveBeenCalled();
  });

  it('a staff sign-in leaves the guest identity alone, and the password is never kept', async () => {
    const store = memoryStore({ [AUTH_KEYS.guest]: JSON.stringify(saved()) });
    const { fetchImpl, calls } = fakeFetch((call) =>
      call.path.startsWith('/auth/v1/logout') ? { status: 204 } : { body: sessionAnswer(5, false) },
    );
    const auth = createAuth(CONFIG, store, fetchImpl, () => 1_000);
    const staff = await auth.signInStaff(' staff@example.test ', 'not-a-real-password');
    expect(calls[0]).toMatchObject({
      path: '/auth/v1/token?grant_type=password',
      body: { email: 'staff@example.test', password: 'not-a-real-password' },
    });
    expect(staff).toMatchObject({ anonymous: false, email: 'staff@example.test' });
    expect(auth.current('guest')?.refreshToken).toBe('refresh-0');
    expect([...store.data.values()].join(' ')).not.toContain('not-a-real-password');

    await auth.signOut('staff');
    expect(calls[1]).toMatchObject({
      path: '/auth/v1/logout?scope=local',
      headers: { Authorization: 'Bearer access-5' },
    });
    expect(auth.current('staff')).toBeNull();
    expect(store.data.has(AUTH_KEYS.staff)).toBe(false);
    expect(auth.current('guest')).not.toBeNull();
  });

  it('a wrong password is the server’s refusal, and nothing is saved', async () => {
    const store = memoryStore();
    const { fetchImpl } = fakeFetch(() => ({
      status: 400,
      body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
    }));
    const auth = createAuth(CONFIG, store, fetchImpl);
    await expect(auth.signInStaff('a@b.test', 'x')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(store.data.size).toBe(0);
  });
});

describe('report photos', () => {
  const http = (reply: (call: Call) => Answer) => {
    const f = fakeFetch(reply);
    return {
      ...f,
      http: createHttp(CONFIG, { token: async () => 'tok', renew: async () => null }, f.fetchImpl),
    };
  };

  it('a sample picture and an already stored photo need no upload', async () => {
    const { http: h, calls } = http(() => ({ body: {} }));
    const photos = createPhotoStore(CONFIG, h, () => 'user-1');
    expect(await photos.toArg({ kind: 'sample', id: 'overflow' }, 'k', 'guest')).toEqual({
      sample: 'overflow',
    });
    expect(await photos.toArg({ kind: 'remote', path: 'user-1/x.jpg' }, 'k', 'guest')).toEqual({
      path: 'user-1/x.jpg',
    });
    expect(await photos.toArg(null, 'k', 'guest')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('asks for a link once and reuses it while it lasts', async () => {
    let now = 0;
    const { http: h, calls } = http(() => ({
      body: { signedURL: '/object/sign/report-photos/user-1/x.jpg?token=abc' },
    }));
    const photos = createPhotoStore(
      CONFIG,
      h,
      () => 'user-1',
      () => now,
    );
    const url = await photos.getUrl('user-1/x.jpg', 'guest');
    expect(url).toBe(`${CONFIG.url}/storage/v1/object/sign/report-photos/user-1/x.jpg?token=abc`);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/storage/v1/object/sign/report-photos/user-1/x.jpg',
      body: { expiresIn: 3600 },
    });
    now = 49 * 60_000;
    expect(await photos.getUrl('user-1/x.jpg', 'guest')).toBe(url);
    expect(calls).toHaveLength(1);
    now = 51 * 60_000;
    await photos.getUrl('user-1/x.jpg', 'guest');
    expect(calls).toHaveLength(2);
  });
});

describe('following the server clock', () => {
  it('live time is the server’s time, whatever the phone’s clock says', () => {
    const clock = followServer({ anchorRealMs: null, anchorSimMs: null, speed: 1 }, 90_000);
    expect(clock.mode).toBe('live');
    expect(simNow(clock, 1_000_000)).toBe(1_090_000);
    expect(simNow(LIVE_CLOCK, 1_000_000)).toBe(1_000_000);
  });

  it('demo time uses the server’s anchors, moved onto this device’s clock', () => {
    // The server set "sim = 5,000,000" when its own clock read 2,000,000, at ×10.
    const clock = followServer(
      { anchorRealMs: 2_000_000, anchorSimMs: 5_000_000, speed: 10 },
      90_000,
    );
    expect(clock.mode).toBe('demo');
    // This device is 90 s behind the server: at device time 1,910,000 the server reads 2,000,000.
    expect(simNow(clock, 1_910_000)).toBe(5_000_000);
    expect(simNow(clock, 1_911_000)).toBe(5_010_000);
  });
});

describe('sync: one round', () => {
  const session = (userId: string): AuthSession => ({
    accessToken: 't',
    refreshToken: 'r',
    expiresAt: Number.MAX_SAFE_INTEGER,
    userId,
    anonymous: true,
    email: null,
  });

  const event = (seq: number, at = Date.now()): EventRow => ({
    seq,
    id: `t2|status|${seq}`,
    truck_id: 't2',
    shift_id: 'shift|t2|a|b',
    at,
    kind: 'status',
    status: 'on_route',
  });

  const answer = (over: Partial<PulseAnswer> = {}): PulseAnswer => ({
    now: Date.now(),
    clock: { anchor_real: null, anchor_sim: null, speed: 1 },
    reference: '2026-09-29T01:56:19.797Z',
    me: { role: null, barangay: null, truck: null },
    first_seq: null,
    last_seq: null,
    events: [],
    rev: {},
    ...over,
  });

  /** A sync on a stand-in server: `pulses` are answered in turn, set reads from `tables`. */
  function setup(pulses: PulseAnswer[], tables: Record<string, unknown[] | Error> = {}) {
    const identities: { guest: AuthSession | null; staff: AuthSession | null } = {
      guest: null,
      staff: null,
    };
    const reads: string[] = [];
    let keep: string[] = [];
    const http = {
      read: jest.fn(async (fn: string, args: { p_seq?: number }, as: string) => {
        if (fn === 'pulse') {
          reads.push(`pulse(${args.p_seq})@${as}`);
          return pulses.shift() ?? answer();
        }
        reads.push(`${fn}@${as}`);
        return tables[fn] ?? [];
      }),
      select: jest.fn(async (table: string, _query: unknown, as: string) => {
        reads.push(`${table}@${as}`);
        const rows = tables[table] ?? [];
        if (rows instanceof Error) throw rows;
        return rows;
      }),
    } as unknown as Http;
    const auth = {
      ready: Promise.resolve(),
      current: (kind: 'guest' | 'staff') => identities[kind],
      subscribe: () => () => {},
    } as unknown as Parameters<typeof createSync>[0]['auth'];
    const sync = createSync({
      http,
      auth,
      routes: ROUTES,
      isOnline: () => true,
      keepTicketIds: () => keep,
    });
    return { sync, reads, identities, tables, setKeep: (ids: string[]) => (keep = ids) };
  }

  const ticketRow = (id: string, status = 'submitted') => ({
    id,
    category: 'OVERFLOW',
    size: 'bags',
    location: { coordinates: [121.05, 14.31] },
    accuracy_m: null,
    barangay_id: 'brgy-3',
    landmark: null,
    near_waterway: false,
    near_sensitive: false,
    note: null,
    notify: false,
    created_at: '2026-10-02T00:00:00+00:00',
    status,
    dispatch_mode: status === 'scheduled' ? 'special_pickup' : null,
    dispatch_truck_id: status === 'scheduled' ? 't2' : null,
    dispatch_due: null,
    merged_into: null,
    rating: null,
    missed_route_id: null,
    missed_street_key: null,
    missed_day: null,
    missed_basis: null,
    is_sample: false,
    source: 'resident',
    ticket_events: [],
    ticket_photos: [],
  });

  beforeEach(() => {
    useRemote.setState(useRemote.getInitialState(), true);
    useDemo.setState({ clock: LIVE_CLOCK });
    useArea.setState({ area: 'resident' });
  });

  it('reads every set once, then only a set whose fingerprint changed', async () => {
    const rev = {
      shifts: 'a',
      schedules: 'b',
      lead: 'c',
      contacts: 'd',
      announcements: '0:0',
      tickets: '1:0:0',
    };
    const { sync, reads } = setup(
      [answer({ rev }), answer({ rev }), answer({ rev: { ...rev, tickets: '2:0:0' } })],
      { tickets: [ticketRow('KPH-2026-000113')] },
    );
    await sync.pulseNow();
    expect(reads.sort()).toEqual(
      [
        'pulse(0)@anon',
        'shifts@anon',
        'route_schedules@anon',
        'sms_lead_changes@anon',
        'contacts@anon',
        'announcements@anon',
        'tickets@anon',
      ].sort(),
    );
    expect(useRemote.getState().tickets.map((t) => t.id)).toEqual(['KPH-2026-000113']);
    expect(useRemote.getState().schedules).toEqual([]);
    expect(useRemote.getState()).toMatchObject({ meKnown: true, online: true });

    reads.length = 0;
    await sync.pulseNow();
    expect(reads).toEqual(['pulse(0)@anon']);

    await sync.pulseNow();
    expect(reads).toEqual(['pulse(0)@anon', 'pulse(0)@anon', 'tickets@anon']);
  });

  it('a set that could not be read is tried again at the next round', async () => {
    const rev = { contacts: 'x' };
    const { sync, reads, tables } = setup([answer({ rev }), answer({ rev })], {
      contacts: new OfflineError(),
    });
    await expect(sync.pulseNow()).rejects.toBeInstanceOf(OfflineError);
    expect(useRemote.getState().rev.contacts).toBeUndefined();
    tables.contacts = [{ barangay_id: null, phone: '(046) 000 0000', hours: null }];
    reads.length = 0;
    await sync.pulseNow();
    expect(reads).toEqual(['pulse(0)@anon', 'contacts@anon']);
    expect(useRemote.getState().contacts.enro.phone).toBe('(046) 000 0000');
  });

  it('asks only for truck events after the last one it has seen', async () => {
    const { sync, reads } = setup([
      answer({ first_seq: 3, last_seq: 5, events: [event(4), event(5)] }),
      answer({ first_seq: 3, last_seq: 7, events: [event(5), event(6), event(7)] }),
      answer({ first_seq: 3, last_seq: 7 }),
    ]);
    await sync.pulseNow();
    expect(useRemote.getState()).toMatchObject({ cursor: 5 });
    await sync.pulseNow();
    await sync.pulseNow();
    expect(reads).toEqual(['pulse(0)@anon', 'pulse(5)@anon', 'pulse(7)@anon']);
    // An event that came twice is kept once.
    expect(useRemote.getState().eventRows.map((r) => r.seq)).toEqual([4, 5, 6, 7]);
  });

  it('a full page means there is more: the cursor stops at the last event received', async () => {
    const page = Array.from({ length: 500 }, (_, i) => event(i + 1));
    const { sync } = setup([answer({ first_seq: 1, last_seq: 900, events: page })]);
    await sync.pulseNow();
    expect(useRemote.getState().cursor).toBe(500);
  });

  it('drops what a demo reset removed on the server', async () => {
    const { sync } = setup([
      answer({ first_seq: 4, last_seq: 5, events: [event(4), event(5)] }),
      // After a reset the server holds nothing…
      answer({ first_seq: null, last_seq: null }),
      // …and what comes next continues the numbering.
      answer({ first_seq: 6, last_seq: 6, events: [event(6)] }),
    ]);
    await sync.pulseNow();
    await sync.pulseNow();
    expect(useRemote.getState()).toMatchObject({ eventRows: [], cursor: 0 });
    await sync.pulseNow();
    expect(useRemote.getState().eventRows.map((r) => r.seq)).toEqual([6]);
  });

  it('forgets events older than the nine days the app replays', async () => {
    const old = Date.now() - 10 * 24 * 3_600_000;
    const { sync } = setup([
      answer({ first_seq: 1, last_seq: 2, events: [event(1, old), event(2)] }),
    ]);
    await sync.pulseNow();
    expect(useRemote.getState().eventRows.map((r) => r.seq)).toEqual([2]);
  });

  it('follows the shared demo clock, and leaves the clock alone when nothing changed', async () => {
    const sim = Date.UTC(2026, 9, 5, 23, 25);
    const demo = () => {
      const now = Date.now();
      return answer({ now, clock: { anchor_real: now - 1_000, anchor_sim: sim, speed: 10 } });
    };
    const first = demo();
    const { sync } = setup([first, { ...first, now: Date.now() }, answer()]);
    await sync.pulseNow();
    const clock = useDemo.getState().clock;
    expect(clock).toMatchObject({ mode: 'demo', anchorSimMs: sim, speed: 10 });
    // About one second of server time has passed since the anchor, at ×10.
    expect(Math.abs(simNow(clock) - (sim + 10_000))).toBeLessThan(2_000);
    await sync.pulseNow();
    // Same clock on the server: the same object, so screens are not restarted for nothing.
    expect(useDemo.getState().clock).toBe(clock);
    await sync.pulseNow();
    expect(useDemo.getState().clock.mode).toBe('live');
  });

  it('reads as the guest, and as the City ENRO login only inside the dashboard', async () => {
    const rev = { tickets: 'same', decisions: 'd', staff: 's', gps: '0:0' };
    const { sync, reads, identities } = setup([answer({ rev }), answer({ rev }), answer({ rev })], {
      tickets: [ticketRow('KPH-2026-000113')],
    });
    identities.guest = session('guest-1');
    identities.staff = session('staff-1');
    await sync.pulseNow();
    expect(reads.every((r) => r.endsWith('@guest'))).toBe(true);
    expect(useRemote.getState().readerKey).toBe('guest-1');
    expect(useRemote.getState().tickets).toHaveLength(1);

    // Entering the dashboard is another caller: its sets are read again, as staff, even though
    // the fingerprints look the same.
    useArea.setState({ area: 'enro' });
    reads.length = 0;
    await sync.pulseNow();
    expect(reads.sort()).toEqual(
      [
        'pulse(0)@staff',
        'tickets@staff',
        'suggestion_decisions@staff',
        'staff@staff',
        'shift_gps@staff',
      ].sort(),
    );
    expect(useRemote.getState().readerKey).toBe('staff-1');

    useArea.setState({ area: 'driver' });
    reads.length = 0;
    await sync.pulseNow();
    expect(reads.every((r) => r.endsWith('@guest'))).toBe(true);
  });

  it('a truck phone keeps the pickups its own queue still refers to', async () => {
    const { sync, identities, tables, setKeep } = setup(
      [
        answer({ rev: { tickets: '1' } }),
        answer({ rev: { tickets: '2' } }),
        answer({ rev: { tickets: '3' } }),
      ],
      { tickets: [ticketRow('KPH-2026-000120', 'scheduled')] },
    );
    identities.guest = session('phone-1');
    await sync.pulseNow();
    expect(useRemote.getState().tickets.map((t) => t.id)).toEqual(['KPH-2026-000120']);
    // The crew marked it done: the server stops showing it, the phone still lists it.
    tables.tickets = [];
    setKeep(['KPH-2026-000120']);
    await sync.pulseNow();
    expect(useRemote.getState().tickets.map((t) => t.id)).toEqual(['KPH-2026-000120']);
    // The shift is cleared: nothing refers to it any more.
    setKeep([]);
    await sync.pulseNow();
    expect(useRemote.getState().tickets).toEqual([]);
  });

  it('builds the simulator’s events once per change', async () => {
    const { sync } = setup([
      answer({ first_seq: 1, last_seq: 1, events: [event(1)] }),
      answer({ first_seq: 1, last_seq: 1 }),
    ]);
    await sync.pulseNow();
    const events = remoteEvents(ROUTES);
    expect(events.map((e) => e.kind)).toEqual(['status']);
    await sync.pulseNow();
    expect(remoteEvents(ROUTES)).toBe(events);
  });
});
