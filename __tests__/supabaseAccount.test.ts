/**
 * The pilot's resident account (plan 2A), against a fake server that answers the same auth and
 * entry-point calls the database does: a guest becomes an account in place, signing in offers the
 * reports the guest held (once), and the account can take them over with the one-time code.
 */
import { ASIDE_KEY, createAuth, type KeyValueStore } from '@/services/supabase/auth';
import { createSupabaseAccount, TRANSFER_KEY } from '@/services/supabase/account';
import { createHttp, type FetchLike } from '@/services/supabase/http';
import { profileFromRpc } from '@/services/supabase/mappers';
import { OfflineError } from '@/services/errors';

const CONFIG = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };
const JUAN = {
  fullName: 'Juan Dela Cruz',
  mobile: '+639171234567',
  password: 'tamang-password',
  barangayId: 'milagrosa',
  area: 'Zone 3',
  email: null,
};

interface Call {
  method: string;
  path: string;
  bearer: string | null;
  body: unknown;
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

/** A small stand-in for the pilot: its auth endpoints and the entry points the account uses. */
function fakeServer() {
  type User = {
    anonymous: boolean;
    phone: string | null;
    password: string | null;
    reports: number;
  };
  const users = new Map<string, User>();
  const tokens = new Map<string, string>(); // access token -> user id
  const profiles = new Map<string, unknown>();
  const codes = new Map<string, string>(); // code (no dashes) -> guest id
  const calls: Call[] = [];
  let seq = 0;
  let offline = false;

  const issue = (userId: string) => {
    const token = `tok-${++seq}`;
    tokens.set(token, userId);
    const user = users.get(userId)!;
    return {
      access_token: token,
      refresh_token: `ref-${token}`,
      expires_in: 3600,
      user: { id: userId, is_anonymous: user.anonymous },
    };
  };
  const newGuest = () => {
    const id = `guest-${++seq}`;
    users.set(id, { anonymous: true, phone: null, password: null, reports: 0 });
    return id;
  };
  const seedAccount = (id: string, phone: string, password: string, reports = 0) =>
    users.set(id, { anonymous: false, phone, password, reports });

  const reply = (path: string, method: string, bearer: string | null, body: any) => {
    const me = bearer ? tokens.get(bearer) : undefined;
    if (path === '/auth/v1/signup') return { body: issue(newGuest()) };
    if (path === '/auth/v1/user' && method === 'PUT') {
      const user = me ? users.get(me) : undefined;
      if (!user) return { status: 401, body: { error_code: 'bad_jwt' } };
      const taken = [...users.entries()].some(([id, u]) => id !== me && u.phone === body.phone);
      if (body.phone && taken) return { status: 422, body: { error_code: 'phone_exists' } };
      if (body.phone) {
        user.phone = body.phone;
        user.anonymous = false;
      }
      if (body.password) user.password = body.password;
      return { body: { id: me } };
    }
    if (path === '/auth/v1/token') {
      const hit = [...users.entries()].find(
        ([, u]) => u.phone === body.phone && u.password === body.password && !u.anonymous,
      );
      return hit
        ? { body: issue(hit[0]) }
        : { status: 400, body: { error_code: 'invalid_credentials' } };
    }
    if (path === '/auth/v1/logout') {
      if (bearer) tokens.delete(bearer);
      return { status: 204 };
    }
    if (path === '/rest/v1/rpc/resident_profile_get') {
      const user = me ? users.get(me) : undefined;
      return { body: user && !user.anonymous ? (profiles.get(me!) ?? null) : null };
    }
    if (path === '/rest/v1/rpc/resident_profile_save') {
      const user = me ? users.get(me) : undefined;
      if (!user || user.anonymous)
        return { status: 403, body: { code: 'PT403', message: 'account_required' } };
      const saved = {
        fullName: String(body.p_full_name).trim(),
        mobile: user.phone,
        email: body.p_email,
        barangayId: body.p_barangay_id,
        area: String(body.p_area).trim(),
      };
      profiles.set(me!, saved);
      return { body: saved };
    }
    if (path === '/rest/v1/rpc/guest_transfer_code') {
      const user = me ? users.get(me) : undefined;
      if (!user?.anonymous) return { status: 403, body: { code: 'PT403', message: 'guest_only' } };
      const code = 'ABCD2345';
      codes.set(code, me!);
      return { body: { code: 'ABCD-2345', reports: user.reports, expiresAt: 'later' } };
    }
    if (path === '/rest/v1/rpc/guest_transfer') {
      const guest = codes.get(
        String(body.p_code)
          .replace(/[^A-Za-z0-9]/g, '')
          .toUpperCase(),
      );
      if (!guest || !me || users.get(me)?.anonymous) {
        return { status: 400, body: { code: 'PT400', message: 'code_not_valid' } };
      }
      const moved = users.get(guest)!.reports;
      users.get(me)!.reports += moved;
      users.get(guest)!.reports = 0;
      codes.delete(
        String(body.p_code)
          .replace(/[^A-Za-z0-9]/g, '')
          .toUpperCase(),
      );
      return { body: { reports: moved } };
    }
    return { status: 404, body: { message: `no such answer: ${path}` } };
  };

  const fetchImpl: FetchLike = async (input, init) => {
    const path = input.replace(CONFIG.url, '');
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const bearer = headers.Authorization?.replace('Bearer ', '') ?? null;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: path.split('?')[0], bearer, body });
    if (offline && path.includes('guest_transfer')) throw new TypeError('Network request failed');
    const { status = 200, body: answer } = reply(path.split('?')[0], method, bearer, body) as {
      status?: number;
      body?: unknown;
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (answer === undefined ? '' : JSON.stringify(answer)),
    } as Response;
  };

  return {
    fetchImpl,
    calls,
    users,
    seedAccount,
    setOffline: (on: boolean) => (offline = on),
  };
}

/** The app's pieces, wired the way the pilot services wire them. */
function setup() {
  const server = fakeServer();
  const store = memoryStore();
  const auth = createAuth(CONFIG, store, server.fetchImpl);
  const http = createHttp(CONFIG, auth.tokens, server.fetchImpl);
  const account = createSupabaseAccount({ auth, http, store });
  return { server, store, auth, account };
}

const stateOf = (account: ReturnType<typeof createSupabaseAccount>) => {
  let state: { status: string; profile?: { fullName: string } } | null = null;
  account.subscribe((s) => (state = s))();
  return state!;
};
const offerOf = (account: ReturnType<typeof createSupabaseAccount>) => {
  let offer: unknown = 'unset';
  account.subscribeTransfer((o) => (offer = o))();
  return offer;
};

describe('a guest becomes an account in place', () => {
  it('the phone and password go to the guest identity, and the profile is saved', async () => {
    const { server, account } = setup();
    await account.register(JUAN);
    const put = server.calls.find((c) => c.method === 'PUT' && c.path === '/auth/v1/user');
    expect(put?.body).toEqual({ phone: JUAN.mobile, password: JUAN.password });
    const save = server.calls.find((c) => c.path === '/rest/v1/rpc/resident_profile_save');
    expect(save?.body).toMatchObject({ p_full_name: JUAN.fullName, p_barangay_id: 'milagrosa' });
    expect(stateOf(account)).toMatchObject({
      status: 'registered',
      profile: { fullName: JUAN.fullName },
    });
  });

  it('a number another identity already has is refused', async () => {
    const { server, account } = setup();
    server.seedAccount('other', JUAN.mobile, 'otro-password');
    await expect(account.register(JUAN)).rejects.toMatchObject({ code: 'mobile_taken' });
    expect(stateOf(account).status).toBe('guest');
  });
});

describe('signing in to an account', () => {
  it('a wrong password changes nothing: no code is made and the device stays a guest', async () => {
    const { server, account, auth } = setup();
    server.seedAccount('juan', JUAN.mobile, JUAN.password, 1);
    await auth.ensureGuest();
    await expect(account.logIn(JUAN.mobile, 'mali')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(server.calls.some((c) => c.path === '/rest/v1/rpc/guest_transfer_code')).toBe(false);
    expect(stateOf(account).status).toBe('guest');
  });

  it('offers the reports the guest held, once, and sets the guest identity aside', async () => {
    const { server, store, auth, account } = setup();
    server.seedAccount('juan', JUAN.mobile, JUAN.password);
    await auth.ensureGuest();
    const guestToken = auth.current('guest')!.accessToken;
    server.users.get(auth.current('guest')!.userId)!.reports = 1;

    await account.logIn(JUAN.mobile, JUAN.password);
    expect(stateOf(account).status).toBe('registered');
    expect(offerOf(account)).toEqual({ reports: 1, points: 0 });
    // The code was made while the guest still held the device.
    const made = server.calls.find((c) => c.path === '/rest/v1/rpc/guest_transfer_code');
    expect(made?.bearer).toBe(guestToken);
    // The guest is set aside, to come back at sign-out.
    expect(JSON.parse(store.data.get(ASIDE_KEY)!)).toMatchObject({ anonymous: true });
  });

  it('taking the offer over moves the reports to the account, and the offer is gone', async () => {
    const { server, account, auth } = setup();
    server.seedAccount('juan', JUAN.mobile, JUAN.password);
    await auth.ensureGuest();
    server.users.get(auth.current('guest')!.userId)!.reports = 1;
    await account.logIn(JUAN.mobile, JUAN.password);

    await account.acceptTransfer();
    const juanId = [...server.users.entries()].find(([, u]) => u.phone === JUAN.mobile)![0];
    expect(server.users.get(juanId)!.reports).toBe(1);
    expect(offerOf(account)).toBeNull();
    // Taking it over again changes nothing.
    await account.acceptTransfer();
    expect(server.users.get(juanId)!.reports).toBe(1);
  });

  it('leaving the offer keeps the guest reports set aside, and they come back at sign-out', async () => {
    const { server, store, auth, account } = setup();
    server.seedAccount('juan', JUAN.mobile, JUAN.password);
    await auth.ensureGuest();
    const guestId = auth.current('guest')!.userId;
    server.users.get(guestId)!.reports = 1;
    await account.logIn(JUAN.mobile, JUAN.password);

    await account.declineTransfer();
    expect(offerOf(account)).toBeNull();
    await account.logOut();
    expect(stateOf(account).status).toBe('guest');
    expect(auth.current('guest')).toMatchObject({ userId: guestId, anonymous: true });
    expect(store.data.has(ASIDE_KEY)).toBe(false);
    expect(server.users.get(guestId)!.reports).toBe(1);
  });

  it('a device that is offline keeps the offer for later, and says so', async () => {
    const { server, account, auth } = setup();
    server.seedAccount('juan', JUAN.mobile, JUAN.password);
    await auth.ensureGuest();
    server.users.get(auth.current('guest')!.userId)!.reports = 1;
    await account.logIn(JUAN.mobile, JUAN.password);

    server.setOffline(true);
    await expect(account.acceptTransfer()).rejects.toBeInstanceOf(OfflineError);
    expect(offerOf(account)).toEqual({ reports: 1, points: 0 });
  });

  it('signing in to another account signs the first one out', async () => {
    const { server, account, auth } = setup();
    server.seedAccount('juan', JUAN.mobile, JUAN.password);
    server.seedAccount('ana', '+639181234567', 'ana-password');
    await account.logIn(JUAN.mobile, JUAN.password);
    await account.logIn('+639181234567', 'ana-password');
    expect(auth.current('guest')?.userId).toBe(
      [...server.users.entries()].find(([, u]) => u.phone === '+639181234567')![0],
    );
    expect(server.calls.some((c) => c.path === '/auth/v1/logout')).toBe(true);
  });

  it('the offer is remembered across a restart of the app', async () => {
    const { server, store, account, auth } = setup();
    server.seedAccount('juan', JUAN.mobile, JUAN.password);
    await auth.ensureGuest();
    server.users.get(auth.current('guest')!.userId)!.reports = 1;
    await account.logIn(JUAN.mobile, JUAN.password);
    expect(JSON.parse(store.data.get(TRANSFER_KEY)!)).toMatchObject({ reports: 1, offered: false });
  });
});

describe('an account keeps its details', () => {
  it("a changed profile is saved, and the mobile number stays the account's", async () => {
    const { server, account } = setup();
    await account.register(JUAN);
    await account.saveProfile({
      ...JUAN,
      fullName: 'Juan D. Cruz',
      area: 'Zone 4',
      email: 'juan@example.com',
    });
    const save = server.calls.filter((c) => c.path === '/rest/v1/rpc/resident_profile_save').pop();
    expect(save?.body).toMatchObject({
      p_full_name: 'Juan D. Cruz',
      p_area: 'Zone 4',
      p_email: 'juan@example.com',
    });
    expect(stateOf(account)).toMatchObject({
      status: 'registered',
      profile: { fullName: 'Juan D. Cruz' },
    });
  });

  it('changing the password needs the current one', async () => {
    const { server, account } = setup();
    await account.register(JUAN);
    await expect(account.changePassword('mali', 'bagong-password')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await account.changePassword(JUAN.password, 'bagong-password');
    const juan = [...server.users.values()].find((u) => u.phone === JUAN.mobile)!;
    expect(juan.password).toBe('bagong-password');
  });

  it('a forgotten password is not reset here: the pilot has no text gateway yet', async () => {
    const { account } = setup();
    await expect(account.requestRecovery(JUAN.mobile)).rejects.toMatchObject({
      code: 'not_available',
    });
  });
});

describe('the profile from the server', () => {
  it('a guest or an empty answer has no profile', () => {
    expect(profileFromRpc(null)).toBeNull();
    expect(profileFromRpc('nope')).toBeNull();
  });

  it('missing words come back empty, and an email that is empty comes back as none', () => {
    expect(
      profileFromRpc({ fullName: 'Juan', mobile: '+639171234567', email: '', barangayId: null }),
    ).toEqual({
      fullName: 'Juan',
      mobile: '+639171234567',
      email: null,
      barangayId: null,
      area: '',
    });
  });
});
