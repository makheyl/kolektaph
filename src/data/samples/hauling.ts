/**
 * SAMPLE private-hauling requests for the prototype, so the quotation and the checkout can be
 * tried. The fees are the design's example figures, not the City's prices, and the people and
 * the business are made up.
 */
import { DAY, HOUR, manilaParts, manilaStartOfDay } from '@/lib/time';
import type {
  HaulingEvent,
  HaulingRates,
  HaulingRequest,
  HaulingStatus,
  LngLat,
} from '@/services/types';

/** "HR-2026-000012" */
export const haulingNumber = (year: number, seq: number) =>
  `HR-${year}-${String(seq).padStart(6, '0')}`;

export const SAMPLE_HAULING_COUNT = 2;

/**
 * SAMPLE fees: the figures of the design's checkout (base P1,200, distance P150, disposal P250),
 * with the other sizes scaled from them. The City sets the real ones.
 */
export const SAMPLE_HAULING_RATES: HaulingRates = {
  base: { small: 500, medium: 1200, large: 2400 },
  distanceFee: 150,
  disposalFee: 250,
  sample: true,
};

// Near the Milagrosa label point (a sample place, not a real address).
const MILAGROSA: LngLat = [121.04495, 14.30407];
const POBLACION: LngLat = [121.05381, 14.31139];

const SAMPLE_CONTACT = { contactName: 'Juan Dela Cruz', contactMobile: '+639171234567' };

const steps = (id: string, list: [HaulingStatus, number, HaulingEvent['by']][]): HaulingEvent[] =>
  list.map(([status, at, by]) => ({ id: `${id}|${status}`, status, at, by, note: null }));

export function sampleHauling(now: number): HaulingRequest[] {
  const year = manilaParts(now).year;
  const today = manilaStartOfDay(now);

  const waiting = haulingNumber(year, 101);
  const done = haulingNumber(year, 100);
  return [
    // Quoted two hours ago: the one to open for the quotation and the checkout.
    {
      id: waiting,
      requester: 'resident',
      businessName: null,
      ...SAMPLE_CONTACT,
      location: MILAGROSA,
      landmark: '',
      barangayId: 'milagrosa',
      day: today + 3 * DAY,
      slot: 'morning',
      volume: 'medium',
      loadTypes: ['garden'],
      description: '',
      photos: [{ kind: 'sample', id: 'bulky' }],
      createdAt: now - 20 * HOUR,
      status: 'quoted',
      quote: {
        day: today + 3 * DAY,
        slot: 'morning',
        volume: 'medium',
        baseFee: 1200,
        distanceFee: 150,
        disposalFee: 250,
        quotedAt: now - 2 * HOUR,
        validUntil: now + 22 * HOUR,
      },
      payment: null,
      history: steps(waiting, [
        ['requested', now - 20 * HOUR, 'resident'],
        ['quoted', now - 2 * HOUR, 'enro'],
      ]),
      sample: true,
    },
    // A business pickup finished last week, paid in cash to the crew.
    {
      id: done,
      requester: 'business',
      businessName: 'Halimbawang Karinderya',
      ...SAMPLE_CONTACT,
      location: POBLACION,
      landmark: '',
      barangayId: 'brgy-4',
      day: today - 6 * DAY,
      slot: 'afternoon',
      volume: 'small',
      loadTypes: ['general'],
      description: '',
      photos: [{ kind: 'sample', id: 'overflow' }],
      createdAt: now - 9 * DAY,
      status: 'completed',
      quote: {
        day: today - 6 * DAY,
        slot: 'afternoon',
        volume: 'small',
        baseFee: 500,
        distanceFee: 100,
        disposalFee: 100,
        quotedAt: now - 8 * DAY,
        validUntil: now - 7 * DAY,
      },
      payment: {
        method: 'cash',
        pointsUsed: 0,
        pointsDiscount: 0,
        total: 700,
        at: now - 6 * DAY + 15 * HOUR,
        state: 'paid',
        sample: true,
      },
      history: steps(done, [
        ['requested', now - 9 * DAY, 'resident'],
        ['quoted', now - 8 * DAY, 'enro'],
        ['accepted', now - 8 * DAY + 3 * HOUR, 'resident'],
        ['scheduled', now - 8 * DAY + 5 * HOUR, 'enro'],
        ['in_progress', now - 6 * DAY + 14 * HOUR, 'driver'],
        ['completed', now - 6 * DAY + 15 * HOUR, 'driver'],
      ]),
      sample: true,
    },
  ];
}
