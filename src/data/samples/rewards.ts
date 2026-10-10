/**
 * SAMPLE Eco Points for the prototype: the rules, a resident's entries and the perks. The point
 * values come from the design and stand in until the City sets its own. No perk here is an
 * offer of the City or of any partner: each one is shown with a "sample" label.
 */
import { DAY, HOUR, manilaParts, manilaStartOfDay } from '@/lib/time';
import type { CleanupDrive, Perk, PointsEntry, PointsRules } from '@/services/types';

export const SAMPLE_POINTS_RULES: PointsRules = {
  earn: {
    valid_report: 50,
    pickup_confirmed: 10,
    segregation_check: 20,
    cleanup_drive: 100,
    week_complete: 50,
  },
  tiers: [
    { id: 'bronze', from: 0 },
    { id: 'silver', from: 1000 },
    { id: 'gold', from: 2000 },
  ],
  pesosPer100: 20,
};

/** SAMPLE clean-up drives: one coming up, one that has passed. Neither is an announced City event. */
export function sampleCleanups(now: number): CleanupDrive[] {
  // The Saturday of this week (Manila), 7 in the morning: days since Saturday, Sunday counting 1.
  const saturday = manilaStartOfDay(now) - ((manilaParts(now).weekday + 1) % 7) * DAY + 7 * HOUR;
  return [
    {
      id: 'sample-drive-next',
      barangayId: 'milagrosa',
      place: 'Sample: covered court, Milagrosa',
      startsAt: saturday + 7 * DAY,
      attendees: 0,
      sample: true,
    },
    {
      id: 'sample-drive-last',
      barangayId: 'maduya',
      place: 'Sample: waterway clean-up, Maduya',
      startsAt: saturday - 7 * DAY,
      attendees: 24,
      sample: true,
    },
  ];
}

export const SAMPLE_PERKS: Perk[] = [
  {
    id: 'perk-property-tax',
    title: { fil: '5% bawas sa amilyar', en: '5% off real property tax' },
    partner: 'City of Carmona',
    group: 'city',
    cost: 800,
    sample: true,
  },
  {
    id: 'perk-stores',
    title: { fil: '10% bawas sa mga partner na tindahan', en: '10% off at partner stores' },
    partner: 'Partner stores',
    group: 'stores',
    cost: 300,
    sample: true,
  },
  {
    id: 'perk-water',
    title: { fil: 'Rebate sa bayarin sa tubig', en: 'Water bill rebate' },
    partner: 'Water district',
    group: 'bills',
    cost: 1000,
    sample: true,
  },
  {
    id: 'perk-eco-bag',
    title: { fil: 'Libreng eco bag', en: 'Free eco bag' },
    partner: 'Partner stores',
    group: 'stores',
    cost: 150,
    sample: true,
  },
];

/** How many past collection days the sample resident confirmed. */
const SAMPLE_CONFIRMED_DAYS = 20;

/**
 * A resident's sample entries, relative to `now`: a confirmation on each recent collection day
 * of their barangay, and a spread of the other ways to earn. With twenty collection days behind
 * them they add up to the 1,250 points of the design.
 */
export function samplePointsEntries(now: number, pastCollectionDays: number[]): PointsEntry[] {
  const { earn } = SAMPLE_POINTS_RULES;
  const year = manilaParts(now).year;
  const entries: PointsEntry[] = [];
  const add = (kind: PointsEntry['kind'], points: number, at: number, ref: string | null = null) =>
    entries.push({ id: `sample-${kind}-${entries.length}`, kind, points, at, ref });

  const confirmed = [...pastCollectionDays].sort((a, b) => b - a).slice(0, SAMPLE_CONFIRMED_DAYS);
  // A little after the usual collection window, as if tapped when the truck had gone.
  for (const day of confirmed) add('pickup_confirmed', earn.pickup_confirmed, day + 11 * HOUR);
  for (let week = 1; week <= 3; week++)
    add('week_complete', earn.week_complete, now - week * 7 * DAY);
  for (let n = 0; n < 12; n++) {
    add(
      'valid_report',
      earn.valid_report,
      now - (3 + n * 6) * DAY - 5 * HOUR,
      `KPH-${year}-${String(80 - n).padStart(6, '0')}`,
    );
  }
  for (let n = 0; n < 5; n++) add('segregation_check', earn.segregation_check, now - (1 + n) * DAY);
  for (let n = 0; n < 2; n++) add('cleanup_drive', earn.cleanup_drive, now - (16 + n * 30) * DAY);
  return entries;
}
