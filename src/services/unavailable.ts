/**
 * Stand-ins for the newer features where a build does not offer them yet (the pilot database,
 * until each feature's tables and entry points exist). `features` says they are off, so screens
 * hide them; these make sure a stray call answers "not available" instead of breaking.
 */
import { ServerError } from './errors';
import type {
  AccountService,
  FeatureFlags,
  HaulingService,
  RewardsService,
  ScannerProvider,
} from './types';

export const NO_FEATURES: FeatureFlags = {
  accounts: false,
  hauling: false,
  rewards: false,
  scanner: false,
};

const refuse = async (): Promise<never> => {
  throw new ServerError('not_available', 501);
};
const nothing = () => () => {};

export const unavailableAccount: AccountService = {
  subscribe(listener) {
    listener({ status: 'guest' });
    return () => {};
  },
  subscribeTransfer(listener) {
    listener(null);
    return () => {};
  },
  acceptTransfer: refuse,
  declineTransfer: refuse,
  register: refuse,
  logIn: refuse,
  logOut: async () => {},
  saveProfile: refuse,
  changePassword: refuse,
  requestRecovery: refuse,
  confirmRecovery: refuse,
};

export const unavailableHauling: HaulingService = {
  subscribeMine(listener) {
    listener([]);
    return () => {};
  },
  subscribeAll(listener) {
    listener([]);
    return () => {};
  },
  subscribeRates(listener) {
    listener(null);
    return () => {};
  },
  submit: refuse,
  pay: refuse,
  cancel: refuse,
};

export const unavailableRewards: RewardsService = {
  subscribeSummary: nothing,
  subscribePerks(listener) {
    listener([]);
    return () => {};
  },
  subscribeVouchers(listener) {
    listener([]);
    return () => {};
  },
  subscribeCleanups(listener) {
    listener([]);
    return () => {};
  },
  findVoucher: async () => null,
  redeem: refuse,
};

export const unavailableScanner: ScannerProvider = { classify: refuse };
