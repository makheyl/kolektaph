import { sampleHauling } from '@/data/samples/hauling';
import { SAMPLE_POINTS_RULES } from '@/data/samples/rewards';
import {
  amountDue,
  formatPesos,
  maxPointsFor,
  pointsDiscount,
  quoteSubtotal,
} from '@/features/hauling/pricing';
import { canCancel, canPay, haulingGroup, haulingView } from '@/features/hauling/status';
import { DAY, HOUR, manilaEpoch } from '@/lib/time';
import { OfflineError, ServerError } from '@/services/errors';
import { createMockHauling } from '@/services/mock/hauling';
import type { HaulingQuote, NewHaulingRequest } from '@/services/types';

const now = manilaEpoch(2026, 9, 29, 8, 0);
const rules = SAMPLE_POINTS_RULES;
const quote: HaulingQuote = {
  day: now + 3 * DAY,
  slot: 'morning',
  volume: 'medium',
  baseFee: 1200,
  distanceFee: 150,
  disposalFee: 250,
  quotedAt: now,
  validUntil: now + 24 * HOUR,
};

describe('hauling fee', () => {
  it('adds up the fee and takes the points discount off, as in the design', () => {
    expect(quoteSubtotal(quote)).toBe(1600);
    expect(pointsDiscount(500, rules)).toBe(100);
    expect(amountDue(quote, 500, rules)).toBe(1500);
    expect(amountDue(quote, 0, rules)).toBe(1600);
  });

  it('counts points in whole hundreds only', () => {
    expect(pointsDiscount(99, rules)).toBe(0);
    expect(pointsDiscount(250, rules)).toBe(40);
  });

  it('offers no more points than the resident has or the fee is worth', () => {
    expect(maxPointsFor(quote, 1250, rules)).toBe(1200);
    expect(maxPointsFor(quote, 80, rules)).toBe(0);
    // A small fee: 400 pesos is fully covered by 2,000 points, however many more there are.
    const small = { ...quote, baseFee: 300, distanceFee: 50, disposalFee: 50 };
    expect(maxPointsFor(small, 50_000, rules)).toBe(2000);
    expect(amountDue(small, 2000, rules)).toBe(0);
    expect(maxPointsFor(quote, 1250, { pesosPer100: 0 })).toBe(0);
  });

  it('writes pesos with thousands separators', () => {
    expect(formatPesos(1500)).toBe('1,500');
    expect(formatPesos(700)).toBe('700');
    expect(formatPesos(1234567)).toBe('1,234,567');
  });
});

describe('hauling steps', () => {
  const quoted = { status: 'quoted' as const, quote };

  it('lets a quotation lapse after 24 hours without storing anything', () => {
    expect(haulingView(quoted, now + HOUR)).toBe('quoted');
    expect(haulingView(quoted, now + 25 * HOUR)).toBe('expired');
    expect(canPay(quoted, now + HOUR)).toBe(true);
    expect(canPay(quoted, now + 25 * HOUR)).toBe(false);
    expect(canPay({ status: 'requested', quote: null }, now)).toBe(false);
  });

  it('lets the requester cancel until the crew sets out', () => {
    expect(canCancel({ status: 'requested' })).toBe(true);
    expect(canCancel({ status: 'scheduled' })).toBe(true);
    expect(canCancel({ status: 'in_progress' })).toBe(false);
    expect(canCancel({ status: 'completed' })).toBe(false);
  });

  it('files each step under one of the filters of "Aking mga report"', () => {
    expect(haulingGroup('requested')).toBe('review');
    expect(haulingGroup('quoted')).toBe('review');
    expect(haulingGroup('scheduled')).toBe('scheduled');
    expect(haulingGroup('completed')).toBe('done');
    expect(haulingGroup('expired')).toBe('other');
  });
});

describe('sample hauling service', () => {
  const request = (over: Partial<NewHaulingRequest> = {}): NewHaulingRequest => ({
    requester: 'resident',
    businessName: null,
    contactName: 'Juan Dela Cruz',
    contactMobile: '+639171234567',
    location: [121.04495, 14.30407],
    landmark: 'Zone 3',
    day: now + 2 * DAY,
    slot: 'morning',
    volume: 'small',
    loadTypes: ['garden'],
    description: '',
    photos: [],
    ...over,
  });
  const make = (over: { online?: boolean; balance?: number } = {}) => {
    const spent: [number, string][] = [];
    const service = createMockHauling({
      getSimTime: () => now,
      isOnline: () => over.online ?? true,
      pointsBalance: () => over.balance ?? 1250,
      spendPoints: (points, ref) => spent.push([points, ref]),
      pointsRules: () => rules,
    });
    return { service, spent };
  };

  it('files a request under review, with its barangay worked out from the pin', async () => {
    const { service } = make();
    const filed = await service.submit(request());
    expect(filed.id).toMatch(/^HR-2026-\d{6}$/);
    expect(filed.status).toBe('requested');
    expect(filed.barangayId).toBe('milagrosa');
    expect(filed.sample).toBe(false);
    let mine: string[] = [];
    service.subscribeMine((list) => (mine = list.map((r) => r.id)))();
    expect(mine[0]).toBe(filed.id);
  });

  it('files a request sent twice only once', async () => {
    const { service } = make();
    const first = await service.submit(request({ clientRef: 'ref-1' }));
    const again = await service.submit(request({ clientRef: 'ref-1' }));
    expect(again.id).toBe(first.id);
  });

  it('keeps the request on the phone when there is no signal', async () => {
    const { service } = make({ online: false });
    await expect(service.submit(request())).rejects.toBeInstanceOf(OfflineError);
  });

  it('pays a quoted request with a sample payment and spends the points chosen', async () => {
    const { service, spent } = make();
    const waiting = sampleHauling(now)[0];
    const paid = await service.pay(waiting.id, 'gcash', 500);
    expect(paid.status).toBe('accepted');
    expect(paid.payment).toMatchObject({
      method: 'gcash',
      pointsUsed: 500,
      pointsDiscount: 100,
      total: 1500,
      state: 'paid',
      sample: true,
    });
    expect(spent).toEqual([[500, waiting.id]]);
  });

  it('leaves cash to be handed to the crew', async () => {
    const { service } = make();
    const paid = await service.pay(sampleHauling(now)[0].id, 'cash', 0);
    expect(paid.payment).toMatchObject({ method: 'cash', total: 1600, state: 'due' });
  });

  it('refuses a payment with more points than the resident has, or on a request not quoted', async () => {
    const { service, spent } = make({ balance: 100 });
    const [waiting, done] = sampleHauling(now);
    await expect(service.pay(waiting.id, 'gcash', 500)).rejects.toMatchObject({
      code: 'not_enough_points',
    });
    await expect(service.pay(done.id, 'gcash', 0)).rejects.toBeInstanceOf(ServerError);
    expect(spent).toEqual([]);
  });

  it('cancels a request that has not started, and not one that is finished', async () => {
    const { service } = make();
    const [waiting, done] = sampleHauling(now);
    expect((await service.cancel(waiting.id)).status).toBe('cancelled');
    await expect(service.cancel(done.id)).rejects.toMatchObject({ code: 'invalid_transition' });
  });
});
