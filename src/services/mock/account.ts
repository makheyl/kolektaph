/**
 * Sample AccountService: resident accounts kept on this device, so registering, logging in and
 * moving what a guest held can be tried with no server. Nothing is sent anywhere and numbers are
 * not verified. A password is never kept as typed: only a fingerprint of it.
 *
 * A device holds one identity at a time. Signing in to an account gives the account the
 * device's holdings (its reports, points and vouchers) and sets the guest's own holdings aside;
 * signing out gives them back. Registering keeps what the device holds: it now belongs to the
 * account.
 */
import { holdsAnything, type Holdings, mergeHoldings, NOTHING } from '@/features/account/transfer';
import { balanceOf } from '@/features/rewards/points';
import { uuidFromText } from '@/lib/uuid';
import { type AccountStoreState, useAccountStore } from '@/stores/account';

import { ServerError } from '../errors';
import type { AccountService, AccountState, GuestTransferOffer, ResidentProfile } from '../types';

const NETWORK_MS = 250;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Not a secure hash: enough for a sample that is never sent anywhere. */
const fingerprint = (mobile: string, password: string) => uuidFromText(`${mobile}|${password}`);

const sixDigits = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');

/** How the device's holdings are read and written (the other sample services own them). */
export interface AccountDeps {
  read: () => Holdings;
  write: (holdings: Holdings) => void;
}

export interface MockAccount extends AccountService {
  reset(): void;
}

const stateOf = (s: AccountStoreState): AccountState => {
  const account = s.signedIn ? s.accounts[s.signedIn] : undefined;
  return account ? { status: 'registered', profile: account.profile } : { status: 'guest' };
};

const offerOf = (s: AccountStoreState): GuestTransferOffer | null =>
  s.signedIn && s.aside && !s.offered && holdsAnything(s.aside)
    ? { reports: s.aside.reports.length, points: balanceOf(s.aside.points) }
    : null;

export function createMockAccount(deps: AccountDeps): MockAccount {
  const codes = new Map<string, string>();
  const set = (patch: Partial<AccountStoreState>) => useAccountStore.setState(patch);
  const current = () => useAccountStore.getState();

  /** Gives the device back to its guest: the signed-in account keeps what it held. */
  const signOutHere = () => {
    const s = current();
    if (!s.signedIn) return;
    const account = s.accounts[s.signedIn];
    set({
      accounts: { ...s.accounts, [s.signedIn]: { ...account, holdings: deps.read() } },
      signedIn: null,
    });
    deps.write(s.aside ?? NOTHING);
    set({ aside: null, offered: false });
  };

  return {
    subscribe(listener) {
      listener(stateOf(current()));
      return useAccountStore.subscribe((s) => listener(stateOf(s)));
    },
    subscribeTransfer(listener) {
      listener(offerOf(current()));
      return useAccountStore.subscribe((s) => listener(offerOf(s)));
    },
    async register({ password, email, ...rest }) {
      await wait(NETWORK_MS);
      if (current().accounts[rest.mobile]) throw new ServerError('mobile_taken', 409);
      // Another account signed in here keeps its holdings before this one takes the device.
      signOutHere();
      const s = current();
      const profile: ResidentProfile = { ...rest, email };
      // The device's own holdings now belong to the account. Nothing set aside: nothing to offer.
      set({
        accounts: {
          ...s.accounts,
          [rest.mobile]: {
            secret: fingerprint(rest.mobile, password),
            profile,
            holdings: deps.read(),
          },
        },
        signedIn: rest.mobile,
        aside: null,
        offered: true,
      });
    },
    async logIn(mobile, password) {
      await wait(NETWORK_MS);
      const s = current();
      const account = s.accounts[mobile];
      if (!account || account.secret !== fingerprint(mobile, password)) {
        throw new ServerError('invalid_credentials', 400);
      }
      if (s.signedIn === mobile) return;
      // Another account on this device goes first, so its holdings are kept with it.
      signOutHere();
      // The guest's own holdings are set aside; the account's holdings take the device.
      set({ aside: deps.read(), signedIn: mobile, offered: false });
      deps.write(account.holdings);
    },
    async logOut() {
      signOutHere();
    },
    async saveProfile(profile) {
      await wait(NETWORK_MS);
      const s = current();
      const account = s.signedIn ? s.accounts[s.signedIn] : undefined;
      if (!s.signedIn || !account) throw new ServerError('not_signed_in', 401);
      // The number is the account: it does not change here.
      const next: ResidentProfile = { ...profile, mobile: s.signedIn };
      set({ accounts: { ...s.accounts, [s.signedIn]: { ...account, profile: next } } });
    },
    async changePassword(currentPassword, next) {
      await wait(NETWORK_MS);
      const s = current();
      const account = s.signedIn ? s.accounts[s.signedIn] : undefined;
      if (!s.signedIn || !account) throw new ServerError('not_signed_in', 401);
      if (account.secret !== fingerprint(s.signedIn, currentPassword)) {
        throw new ServerError('invalid_credentials', 400);
      }
      set({
        accounts: {
          ...s.accounts,
          [s.signedIn]: { ...account, secret: fingerprint(s.signedIn, next) },
        },
      });
    },
    async acceptTransfer() {
      const s = current();
      if (!s.signedIn || !s.aside || s.offered) return;
      deps.write(mergeHoldings(deps.read(), s.aside));
      set({ aside: null, offered: true });
    },
    async declineTransfer() {
      // What the guest held stays set aside, and comes back at sign-out.
      set({ offered: true });
    },
    async requestRecovery(mobile) {
      await wait(NETWORK_MS);
      if (!current().accounts[mobile]) throw new ServerError('unknown_account', 404);
      const code = sixDigits();
      codes.set(mobile, code);
      // No text is sent on the sample data: the code is shown on screen instead.
      return { sampleCode: code };
    },
    async confirmRecovery(mobile, code, password) {
      await wait(NETWORK_MS);
      const s = current();
      const account = s.accounts[mobile];
      if (!account || codes.get(mobile) !== code) throw new ServerError('wrong_code', 400);
      codes.delete(mobile);
      set({
        accounts: {
          ...s.accounts,
          [mobile]: { ...account, secret: fingerprint(mobile, password) },
        },
      });
    },
    reset() {
      signOutHere();
      codes.clear();
      set({ accounts: {}, signedIn: null, aside: null, offered: false });
    },
  };
}
