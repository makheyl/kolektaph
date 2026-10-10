import { holdsAnything, mergeHoldings, NOTHING } from '@/features/account/transfer';
import type { PointsEntry, Voucher } from '@/services/types';

const point = (id: string, at: number, points = 50): PointsEntry => ({
  id,
  kind: 'valid_report',
  points,
  at,
  ref: null,
});
const voucher = (id: string): Voucher => ({
  id,
  perkId: 'perk-1',
  code: `KPH-${id}`,
  issuedAt: 1,
  validUntil: 2,
  status: 'issued',
});

describe('what a device holds', () => {
  it('nothing held is nothing to offer', () => {
    expect(holdsAnything(NOTHING)).toBe(false);
  });

  it('a report, a point or a voucher is something to offer', () => {
    expect(holdsAnything({ ...NOTHING, reports: ['KPH-2026-000101'] })).toBe(true);
    expect(holdsAnything({ ...NOTHING, points: [point('p1', 1)] })).toBe(true);
    expect(holdsAnything({ ...NOTHING, vouchers: [voucher('v1')] })).toBe(true);
  });
});

describe('merging a guest into an account', () => {
  it('keeps each report once, in the order they came', () => {
    const merged = mergeHoldings(
      { ...NOTHING, reports: ['KPH-1', 'KPH-2'] },
      { ...NOTHING, reports: ['KPH-2', 'KPH-3'] },
    );
    expect(merged.reports).toEqual(['KPH-1', 'KPH-2', 'KPH-3']);
  });

  it('puts the points in the order they were earned, and keeps each once', () => {
    const shared = point('same', 200);
    const merged = mergeHoldings(
      { ...NOTHING, points: [point('late', 300), shared] },
      { ...NOTHING, points: [point('early', 100), shared] },
    );
    expect(merged.points.map((p) => p.id)).toEqual(['early', 'same', 'late']);
  });

  it('keeps every voucher, each once', () => {
    const merged = mergeHoldings(
      { ...NOTHING, vouchers: [voucher('a')] },
      { ...NOTHING, vouchers: [voucher('a'), voucher('b')] },
    );
    expect(merged.vouchers.map((v) => v.id)).toEqual(['a', 'b']);
  });

  it('merging nothing changes nothing', () => {
    const held = { ...NOTHING, reports: ['KPH-1'], points: [point('p', 1)] };
    expect(mergeHoldings(held, NOTHING)).toEqual(held);
  });
});
