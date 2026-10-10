/**
 * Sample RewardsService: a resident's Eco Points and the perks, on this device and in memory
 * only. SAMPLE figures and perks (see data/samples/rewards): nothing here is a real balance or
 * a real offer. The same interface is what a server implements later.
 */
import {
  SAMPLE_PERKS,
  SAMPLE_POINTS_RULES,
  sampleCleanups,
  samplePointsEntries,
} from '@/data/samples/rewards';
import { balanceOf, summarize } from '@/features/rewards/points';
import { DAY, manilaParts, manilaStartOfDay } from '@/lib/time';

import { ServerError } from '../errors';
import type { PointsEntry, PointsSummary, RewardsService, Voucher } from '../types';

export interface RewardsDeps {
  getSimTime: () => number;
  /** The barangay's collection days from `fromMs` on, as Manila midnights. */
  collectionDays: (fromMs: number, days: number) => number[];
}

/** How long a voucher can be used after it is issued. */
const VOUCHER_DAYS = 30;
/** Letters and digits that are not mistaken for each other when read out at a counter. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const voucherCode = () => {
  const part = () =>
    Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(
      '',
    );
  return `KPH-${part()}-${part()}`;
};

export interface MockRewards extends RewardsService {
  /** Other sample services spend points through this (the hauling discount). */
  spend(kind: 'hauling_discount', points: number, ref: string): void;
  balance(): number;
  /** What this device holds: its points and vouchers (an account takes them over). */
  ledger(): { entries: PointsEntry[]; vouchers: Voucher[] };
  setLedger(next: { entries: PointsEntry[]; vouchers: Voucher[] }): void;
  reset(): void;
}

export function createMockRewards(deps: RewardsDeps): MockRewards {
  let entries: PointsEntry[] | null = null;
  let vouchers: Voucher[] = [];
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());

  /** The week in view starts on Monday (Manila). */
  const mondayOf = (now: number) =>
    manilaStartOfDay(now) - ((manilaParts(now).weekday + 6) % 7) * DAY;

  const all = () => {
    if (!entries) {
      const now = deps.getSimTime();
      // The sample history reaches back ten weeks, up to yesterday's collection.
      const past = deps.collectionDays(now - 70 * DAY, 70).filter((day) => day + DAY <= now);
      entries = samplePointsEntries(now, past);
    }
    return entries;
  };

  const summary = (): PointsSummary => {
    const now = deps.getSimTime();
    return summarize(all(), SAMPLE_POINTS_RULES, deps.collectionDays(mondayOf(now), 7), now);
  };

  const subscribe = (emit: () => void) => {
    emit();
    listeners.add(emit);
    return () => {
      listeners.delete(emit);
    };
  };

  return {
    subscribeSummary: (listener) => subscribe(() => listener(summary())),
    subscribePerks: (listener) => subscribe(() => listener(SAMPLE_PERKS)),
    subscribeVouchers: (listener) => subscribe(() => listener(vouchers)),
    subscribeCleanups: (listener) => subscribe(() => listener(sampleCleanups(deps.getSimTime()))),
    // Looks in this device's vouchers: the sample has one device for both the resident and the counter.
    // Dashes, spaces and capitals do not matter when a code is read out at the counter.
    async findVoucher(code) {
      const key = (text: string) => text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      return vouchers.find((v) => key(v.code) === key(code)) ?? null;
    },
    async redeem(perkId) {
      const perk = SAMPLE_PERKS.find((p) => p.id === perkId);
      if (!perk) throw new ServerError('unknown_perk', 404);
      if (balanceOf(all()) < perk.cost) throw new ServerError('not_enough_points', 409);
      const now = deps.getSimTime();
      const voucher: Voucher = {
        id: `v-${now}-${vouchers.length}`,
        perkId,
        code: voucherCode(),
        issuedAt: now,
        validUntil: now + VOUCHER_DAYS * DAY,
        status: 'issued',
      };
      entries = [
        ...all(),
        {
          id: `redeemed-${voucher.id}`,
          kind: 'redeemed',
          points: -perk.cost,
          at: now,
          ref: perkId,
        },
      ];
      vouchers = [voucher, ...vouchers];
      changed();
      return voucher;
    },
    spend(kind, points, ref) {
      if (points <= 0) return;
      const now = deps.getSimTime();
      entries = [...all(), { id: `${kind}-${ref}`, kind, points: -points, at: now, ref }];
      changed();
    },
    balance: () => balanceOf(all()),
    ledger: () => ({ entries: all(), vouchers }),
    setLedger(next) {
      entries = next.entries;
      vouchers = next.vouchers;
      changed();
    },
    reset() {
      entries = null;
      vouchers = [];
      changed();
    },
  };
}
