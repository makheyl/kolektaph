import { useEffect, useState } from 'react';

import { services } from '@/services';
import type { AccountState, GuestTransferOffer } from '@/services/types';

/** Whether this device is a guest or signed in to a registered account. */
export function useAccount(): AccountState {
  // The service answers at once, so the first render already knows.
  const [state, setState] = useState<AccountState>(() => {
    let now: AccountState = { status: 'guest' };
    services.account.subscribe((s) => (now = s))();
    return now;
  });
  useEffect(() => services.account.subscribe(setState), []);
  return state;
}

/** The offer to move what a guest held into the account just signed in to; null when none. */
export function useTransferOffer(): GuestTransferOffer | null {
  const [offer, setOffer] = useState<GuestTransferOffer | null>(null);
  useEffect(() => services.account.subscribeTransfer(setOffer), []);
  return offer;
}

/** "Juan" from "Juan Dela Cruz": the name a greeting uses. */
export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? '';
