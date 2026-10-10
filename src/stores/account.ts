import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Holdings } from '@/features/account/transfer';
import type { ResidentProfile } from '@/services/types';

/**
 * A sample account on this device. `secret` is a fingerprint of the mobile number and password,
 * never the password itself. `holdings` is what the account owns while it is not signed in.
 */
export interface AccountRecord {
  secret: string;
  profile: ResidentProfile;
  holdings: Holdings;
}

export interface AccountStoreState {
  /** Sample accounts by mobile number. */
  accounts: Record<string, AccountRecord>;
  /** The account signed in on this device, by mobile number (null for a guest). */
  signedIn: string | null;
  /**
   * The guest's own holdings, set aside while an account is signed in. Null when there is
   * nothing set aside (a device that registered, or is a fresh guest).
   */
  aside: Holdings | null;
  /** The transfer offer has been answered for this sign-in (taken over or left). */
  offered: boolean;
}

/**
 * What this device shows about its accounts. Sample data only: accounts are kept on this device
 * for trying the flow, and nothing reaches a server.
 */
export const useAccountStore = create<AccountStoreState>()(
  persist(
    (): AccountStoreState => ({ accounts: {}, signedIn: null, aside: null, offered: false }),
    {
      name: 'kolektaph.account',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
