import { SAMPLE_HAULING_RATES } from '@/data/samples/hauling';
import { SAMPLE_PERKS, SAMPLE_POINTS_RULES, sampleCleanups } from '@/data/samples/rewards';
import { voucherState } from '@/features/rewards/vouchers';
import { manilaEpoch, manilaParts } from '@/lib/time';
import { createMockHauling } from '@/services/mock/hauling';
import { createMockRewards } from '@/services/mock/rewards';
import { unavailableHauling, unavailableRewards } from '@/services/unavailable';

// Thursday 9 October 2026, mid-morning in Carmona.
const now = manilaEpoch(2026, 9, 9, 9, 0);

describe('voucher state (worked out from the date, never stored)', () => {
  const validUntil = manilaEpoch(2026, 9, 20, 23, 59);

  it('a voucher not yet used is good until its last day', () => {
    expect(voucherState({ status: 'issued', validUntil }, now)).toBe('issued');
  });

  it('a voucher past its last day is expired, even though nothing stored says so', () => {
    expect(voucherState({ status: 'issued', validUntil }, validUntil + 1)).toBe('expired');
  });

  it('a used voucher stays used, whatever the date', () => {
    expect(voucherState({ status: 'used', validUntil }, validUntil + 1)).toBe('used');
  });
});

describe('sample clean-up drives', () => {
  const [next, last] = sampleCleanups(now);

  it('start at seven in the morning, Manila time, on a Saturday', () => {
    for (const drive of [next, last]) {
      const parts = manilaParts(drive.startsAt);
      expect(parts.hour).toBe(7);
      expect(parts.minute).toBe(0);
      expect(parts.weekday).toBe(6);
    }
  });

  it('one is still to come and one has passed, and both are labelled as samples', () => {
    expect(next.startsAt).toBeGreaterThan(now);
    expect(last.startsAt).toBeLessThan(now);
    expect(next.sample && last.sample).toBe(true);
  });
});

describe('the sample City services for the new pages', () => {
  it('the hauling list is the same for the resident and the City view, and carries the rates', () => {
    const hauling = createMockHauling({
      getSimTime: () => now,
      isOnline: () => true,
      pointsBalance: () => 0,
      spendPoints: () => {},
      pointsRules: () => SAMPLE_POINTS_RULES,
    });
    let mine: number | null = null;
    let all: number | null = null;
    let rates: unknown = undefined;
    hauling.subscribeMine((list) => (mine = list.length));
    hauling.subscribeAll((list) => (all = list.length));
    hauling.subscribeRates((r) => (rates = r));
    expect(all).toBe(mine);
    expect(all).toBeGreaterThan(0);
    expect(rates).toEqual(SAMPLE_HAULING_RATES);
    expect(SAMPLE_HAULING_RATES.sample).toBe(true);
  });

  it('a voucher is found by its code, read out with other spacing or capitals', async () => {
    const rewards = createMockRewards({ getSimTime: () => now, collectionDays: () => [] });
    const perk = SAMPLE_PERKS.find((p) => p.cost <= rewards.balance());
    expect(perk).toBeDefined();
    const voucher = await rewards.redeem(perk!.id);
    const readOut = `  ${voucher.code.replace(/-/g, ' ').toLowerCase()}  `;
    expect((await rewards.findVoucher(readOut))?.id).toBe(voucher.id);
    expect(await rewards.findVoucher('KPH-NOPE-NOPE')).toBeNull();
    expect(await rewards.findVoucher('')).toBeNull();
  });

  it('the clean-up drives are listed for the City view', () => {
    const rewards = createMockRewards({ getSimTime: () => now, collectionDays: () => [] });
    let drives: unknown[] = [];
    rewards.subscribeCleanups((list) => (drives = list));
    expect(drives).toHaveLength(2);
  });

  it('a pilot database shows no hauling rates and no clean-up drives until they exist', async () => {
    let rates: unknown = 'unset';
    unavailableHauling.subscribeRates((r) => (rates = r));
    expect(rates).toBeNull();
    let drives: unknown[] = ['unset'];
    unavailableRewards.subscribeCleanups((list) => (drives = list));
    expect(drives).toEqual([]);
    expect(await unavailableRewards.findVoucher('KPH-ABCD-EFGH')).toBeNull();
  });
});
