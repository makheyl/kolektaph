/**
 * The resident account on the pilot database (plan 2A). A guest identity becomes an account in
 * place: it gets a mobile number and a password, so the reports it owns stay with it. Signing in
 * to an account puts this device's guest identity aside (it comes back at sign-out), and offers
 * once the reports that guest held: the guest makes a one-time code before it signs in, and the
 * account takes the reports over with it.
 *
 * Points are not on the server yet (plan 2C), so the offer counts reports only.
 */
import { OfflineError, ServerError } from '../errors';
import type { AccountService, AccountState, GuestTransferOffer, ResidentProfile } from '../types';

import type { Auth, KeyValueStore } from './auth';
import type { Http } from './http';
import { profileFromRpc } from './mappers';

export const TRANSFER_KEY = 'kolektaph.account.transfer';

/** The one-time code this device's guest made before it signed in, and whether the offer is answered. */
interface TransferState {
  code: string | null;
  reports: number;
  offered: boolean;
}

const NOTHING_TO_OFFER: TransferState = { code: null, reports: 0, offered: false };

/** Shown only while the profile is still on its way from the server. */
const LOADING: ResidentProfile = {
  fullName: '',
  mobile: '',
  email: null,
  barangayId: null,
  area: '',
};

export interface SupabaseAccountDeps {
  auth: Auth;
  http: Http;
  store: KeyValueStore;
}

export function createSupabaseAccount({ auth, http, store }: SupabaseAccountDeps): AccountService {
  let profile: ResidentProfile | null = null;
  let transfer: TransferState = NOTHING_TO_OFFER;
  const listeners = new Set<() => void>();

  const signedIn = () => {
    const session = auth.current('guest');
    return !!session && !session.anonymous;
  };
  const notify = () => listeners.forEach((l) => l());
  const stateOf = (): AccountState =>
    signedIn() ? { status: 'registered', profile: profile ?? LOADING } : { status: 'guest' };
  const offerOf = (): GuestTransferOffer | null =>
    signedIn() && transfer.code && !transfer.offered && transfer.reports > 0
      ? { reports: transfer.reports, points: 0 }
      : null;

  const saveTransfer = async () => {
    try {
      await store.setItem(TRANSFER_KEY, JSON.stringify(transfer));
    } catch {
      // Storage unavailable: the offer lasts until the app closes.
    }
  };

  const loadProfile = async () => {
    if (!signedIn()) {
      profile = null;
      notify();
      return;
    }
    try {
      profile = profileFromRpc(await http.call('resident_profile_get', {}, 'guest')) ?? profile;
    } catch {
      // Keep what is shown; the next change or the next start tries again.
    }
    notify();
  };

  const readTransfer = async () => {
    try {
      const raw = await store.getItem(TRANSFER_KEY);
      if (raw) transfer = { ...NOTHING_TO_OFFER, ...(JSON.parse(raw) as Partial<TransferState>) };
    } catch {
      transfer = NOTHING_TO_OFFER;
    }
  };

  // Once the saved sessions are read: the offer and the profile of a signed-in account.
  void (async () => {
    await auth.ready;
    await readTransfer();
    await loadProfile();
  })();
  auth.subscribe(() => {
    if (!signedIn()) profile = null;
    notify();
  });

  const signOutHere = async () => {
    await auth.signOut('guest');
    await auth.giveBack();
    profile = null;
    transfer = NOTHING_TO_OFFER;
    await saveTransfer();
    notify();
  };

  return {
    subscribe(listener) {
      listener(stateOf());
      const handler = () => listener(stateOf());
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    subscribeTransfer(listener) {
      listener(offerOf());
      const handler = () => listener(offerOf());
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    async register(input) {
      await auth.ensureGuest();
      try {
        await auth.updateGuest({ phone: input.mobile, password: input.password });
      } catch (e) {
        if (
          e instanceof ServerError &&
          (e.code === 'phone_exists' || e.code === 'user_already_exists')
        ) {
          throw new ServerError('mobile_taken', 409);
        }
        throw e;
      }
      await auth.markRegistered();
      await http.call(
        'resident_profile_save',
        {
          p_full_name: input.fullName,
          p_barangay_id: input.barangayId,
          p_area: input.area,
          p_email: input.email,
        },
        'guest',
      );
      await loadProfile();
    },

    async logIn(mobile, password) {
      await auth.ready;
      // Checked first: a wrong password makes no code and changes nothing on this device.
      let session;
      try {
        session = await auth.signInResident(mobile, password);
      } catch (e) {
        if (e instanceof OfflineError) throw e;
        throw new ServerError('invalid_credentials', 400);
      }
      if (signedIn()) await signOutHere();
      // The guest still holds this device: it makes the code for its reports before it steps aside.
      transfer = NOTHING_TO_OFFER;
      if (auth.current('guest')?.anonymous) {
        try {
          const made = await http.call<{ code: string; reports: number }>(
            'guest_transfer_code',
            {},
            'guest',
          );
          transfer = { code: made.code, reports: made.reports, offered: false };
        } catch {
          // No code this time (offline, or too many in an hour): nothing is offered.
        }
      }
      await auth.takeOver(session);
      await saveTransfer();
      await loadProfile();
    },

    async logOut() {
      await auth.ready;
      if (!signedIn()) return;
      await signOutHere();
    },

    async saveProfile(next) {
      await auth.ready;
      if (!signedIn()) throw new ServerError('not_signed_in', 401);
      const saved = profileFromRpc(
        await http.call(
          'resident_profile_save',
          {
            p_full_name: next.fullName,
            p_barangay_id: next.barangayId,
            p_area: next.area,
            p_email: next.email,
          },
          'guest',
        ),
      );
      profile = saved ?? profile;
      notify();
    },

    async changePassword(currentPassword, next) {
      await auth.ready;
      if (!signedIn() || !profile) throw new ServerError('not_signed_in', 401);
      try {
        // Checked by signing in once more; that session is not kept.
        await auth.signInResident(profile.mobile, currentPassword);
      } catch (e) {
        if (e instanceof OfflineError) throw e;
        throw new ServerError('invalid_credentials', 400);
      }
      await auth.updateGuest({ password: next });
    },

    async acceptTransfer() {
      await auth.ready;
      if (!signedIn() || !transfer.code || transfer.offered) return;
      try {
        await http.call('guest_transfer', { p_code: transfer.code }, 'guest');
      } catch (e) {
        // Offline: the offer stays, to be tried again. A code the server no longer takes is spent.
        if (e instanceof OfflineError) throw e;
        if (!(e instanceof ServerError) || e.code !== 'code_not_valid') throw e;
      }
      transfer = { ...transfer, offered: true };
      await saveTransfer();
      notify();
    },

    async declineTransfer() {
      await auth.ready;
      transfer = { ...transfer, offered: true };
      await saveTransfer();
      notify();
    },

    async requestRecovery() {
      // Needs a text-message gateway, which the pilot does not have yet.
      throw new ServerError('not_available', 501);
    },

    async confirmRecovery() {
      throw new ServerError('not_available', 501);
    },
  };
}
