import { SAMPLE_PERKS, SAMPLE_POINTS_RULES, samplePointsEntries } from '@/data/samples/rewards';
import { formatPoints, signedPoints } from '@/features/rewards/format';
import { balanceOf, lifetimeOf, summarize, tierFor, weekStreak } from '@/features/rewards/points';
import { DAY, manilaEpoch, manilaParts, manilaStartOfDay } from '@/lib/time';
import { createMockAccount } from '@/services/mock/account';
import { createMockRewards } from '@/services/mock/rewards';
import { useAccountStore } from '@/stores/account';

/** The device's holdings for the account tests: nothing held, nothing to read back. */
const holdings = { read: () => ({ reports: [], points: [], vouchers: [] }), write: () => {} };
import type { PointsEntry, PointsSummary, Voucher } from '@/services/types';

// A Friday morning. Milagrosa is collected on Tuesdays and Fridays in the sample schedule.
const fri = manilaEpoch(2026, 10, 2, 8, 0);
const day = (y: number, m: number, d: number) => manilaEpoch(y, m, d);
const entry = (over: Partial<PointsEntry>): PointsEntry => ({
  id: 'e',
  kind: 'valid_report',
  points: 50,
  at: fri,
  ref: null,
  ...over,
});
const { tiers } = SAMPLE_POINTS_RULES;

describe('Eco Points', () => {
  it('balances what was earned against what was spent, and keeps the lifetime total', () => {
    const entries = [
      entry({ id: 'a', points: 50 }),
      entry({ id: 'b', kind: 'cleanup_drive', points: 100 }),
      entry({ id: 'c', kind: 'redeemed', points: -120 }),
    ];
    expect(balanceOf(entries)).toBe(30);
    expect(lifetimeOf(entries)).toBe(150);
  });

  it('finds the tier and how far the next one is', () => {
    expect(tierFor(1250, tiers)).toMatchObject({
      tier: { id: 'silver' },
      next: { id: 'gold' },
      toNext: 750,
      progress: 0.25,
    });
    expect(tierFor(0, tiers)).toMatchObject({ tier: { id: 'bronze' }, toNext: 1000, progress: 0 });
    expect(tierFor(2600, tiers)).toMatchObject({ tier: { id: 'gold' }, next: null, progress: 1 });
  });

  it("marks this week's collection days as confirmed, missed or still to come", () => {
    const tuesday = day(2026, 9, 29);
    const friday = day(2026, 10, 2);
    const confirmedTuesday = [
      entry({ kind: 'pickup_confirmed', points: 10, at: tuesday + DAY / 2 }),
    ];
    expect(weekStreak([friday, tuesday], confirmedTuesday, fri)).toEqual([
      { day: tuesday, state: 'confirmed' },
      { day: friday, state: 'upcoming' },
    ]);
    expect(weekStreak([tuesday, friday], [], fri)).toEqual([
      { day: tuesday, state: 'missed' },
      { day: friday, state: 'upcoming' },
    ]);
  });

  it('adds the sample entries up to the 1,250 points of the design', () => {
    const past = Array.from({ length: 20 }, (_, i) => day(2026, 9, 29) - i * 3 * DAY);
    const entries = samplePointsEntries(fri, past);
    expect(balanceOf(entries)).toBe(1250);
    const summary = summarize(entries, SAMPLE_POINTS_RULES, [], fri);
    expect(summary.lifetime).toBe(1250);
    // Newest first.
    expect(summary.entries[0].at).toBeGreaterThanOrEqual(summary.entries[1].at);
  });

  it('writes points with separators and a sign', () => {
    expect(formatPoints(1250)).toBe('1,250');
    expect(signedPoints(50)).toBe('+ 50');
    expect(signedPoints(-1300)).toBe('− 1,300');
  });
});

describe('sample rewards service', () => {
  const make = () =>
    createMockRewards({
      getSimTime: () => fri,
      // Tuesdays and Fridays, like Milagrosa in the sample schedule.
      collectionDays: (fromMs, days) =>
        Array.from({ length: days }, (_, i) => manilaStartOfDay(fromMs) + i * DAY).filter((d) =>
          [2, 5].includes(manilaParts(d).weekday),
        ),
    });
  const read = (service: ReturnType<typeof make>) => {
    let summary: PointsSummary | null = null;
    service.subscribeSummary((s) => (summary = s))();
    return summary as unknown as PointsSummary;
  };

  it('exchanges points for a perk and issues a voucher with a code', async () => {
    const service = make();
    const before = read(service).balance;
    const perk = SAMPLE_PERKS.find((p) => p.id === 'perk-stores')!;
    const voucher = await service.redeem(perk.id);
    expect(voucher.code).toMatch(/^KPH-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(voucher.status).toBe('issued');
    expect(voucher.validUntil).toBe(fri + 30 * DAY);
    const after = read(service);
    expect(after.balance).toBe(before - perk.cost);
    // Spending does not lower the lifetime total (the tier stays).
    expect(after.lifetime).toBe(before);
    let vouchers: Voucher[] = [];
    service.subscribeVouchers((v) => (vouchers = v))();
    expect(vouchers.map((v) => v.id)).toEqual([voucher.id]);
  });

  it('refuses a perk that costs more than the balance', async () => {
    const service = make();
    service.spend('hauling_discount', read(service).balance, 'HR-2026-000101');
    expect(read(service).balance).toBe(0);
    await expect(service.redeem('perk-stores')).rejects.toMatchObject({
      code: 'not_enough_points',
    });
  });

  it('tells its listeners when points are spent', () => {
    const service = make();
    const seen: number[] = [];
    const stop = service.subscribeSummary((s) => seen.push(s.balance));
    service.spend('hauling_discount', 500, 'HR-2026-000101');
    stop();
    expect(seen[1]).toBe(seen[0] - 500);
  });
});

describe('sample accounts', () => {
  beforeEach(() => {
    useAccountStore.setState({ accounts: {}, signedIn: null, aside: null, offered: false });
  });
  const input = {
    fullName: 'Juan Dela Cruz',
    mobile: '+639171234567',
    password: 'tamang-password',
    barangayId: 'milagrosa',
    area: 'Zone 3',
    email: null,
  };
  const stateOf = (service: ReturnType<typeof createMockAccount>) => {
    let status = '';
    service.subscribe((s) => (status = s.status))();
    return status;
  };

  it('registers a guest, logs out and logs in again with the same number and password', async () => {
    const service = createMockAccount(holdings);
    expect(stateOf(service)).toBe('guest');
    await service.register(input);
    expect(stateOf(service)).toBe('registered');
    await service.logOut();
    expect(stateOf(service)).toBe('guest');
    await expect(service.logIn(input.mobile, 'maling-password')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await service.logIn(input.mobile, input.password);
    expect(stateOf(service)).toBe('registered');
  });

  it('refuses a number that already has an account', async () => {
    const service = createMockAccount(holdings);
    await service.register(input);
    await expect(service.register(input)).rejects.toMatchObject({ code: 'mobile_taken' });
  });

  it('changes the password only when the current one is right', async () => {
    const service = createMockAccount(holdings);
    await service.register(input);
    await expect(service.changePassword('hindi-ito', 'bagong-password')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await service.changePassword(input.password, 'bagong-password');
    await service.logOut();
    await service.logIn(input.mobile, 'bagong-password');
    expect(stateOf(service)).toBe('registered');
  });

  it('sets a new password with the one-time code, and not with a wrong one', async () => {
    const service = createMockAccount(holdings);
    await service.register(input);
    await service.logOut();
    await expect(service.requestRecovery('+639990000000')).rejects.toMatchObject({
      code: 'unknown_account',
    });
    const { sampleCode } = await service.requestRecovery(input.mobile);
    expect(sampleCode).toMatch(/^\d{6}$/);
    const wrong = sampleCode === '000000' ? '111111' : '000000';
    await expect(
      service.confirmRecovery(input.mobile, wrong, 'bagong-password'),
    ).rejects.toMatchObject({
      code: 'wrong_code',
    });
    await service.confirmRecovery(input.mobile, sampleCode!, 'bagong-password');
    await service.logIn(input.mobile, 'bagong-password');
    expect(stateOf(service)).toBe('registered');
  });

  it('keeps the number when the profile is saved: the number is the account', async () => {
    const service = createMockAccount(holdings);
    await service.register(input);
    await service.saveProfile({
      fullName: 'Juan D. Cruz',
      mobile: '+639990000000',
      email: 'juan@example.com',
      barangayId: 'milagrosa',
      area: 'Zone 4',
    });
    let profile = null as null | { fullName: string; mobile: string; email: string | null };
    service.subscribe((s) => (profile = s.status === 'registered' ? s.profile : null))();
    expect(profile).toMatchObject({
      fullName: 'Juan D. Cruz',
      mobile: input.mobile,
      email: 'juan@example.com',
    });
  });
});
