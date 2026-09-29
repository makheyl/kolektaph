import { BARANGAYS } from '@/data/carmona';
import { barangayAt, boundsOf, metresBetween, splitLineAt } from '@/lib/geo';
import { maskPhMobile, normalizePhMobile } from '@/lib/phone';
import { manilaDateKey, manilaDayDiff, manilaEpoch, parseDateKey } from '@/lib/time';
import type { LngLat } from '@/services/types';

describe('geo helpers', () => {
  const line: LngLat[] = [
    [121.05, 14.3],
    [121.06, 14.3],
    [121.06, 14.31],
  ];
  const total = metresBetween(line[0], line[1]) + metresBetween(line[1], line[2]);

  it('splits a line so both halves add up to the whole', () => {
    const [before, after] = splitLineAt(line, 700);
    const len = (c: LngLat[]) => c.slice(1).reduce((s, p, i) => s + metresBetween(c[i], p), 0);
    expect(len(before)).toBeCloseTo(700, 0);
    expect(len(before) + len(after)).toBeCloseTo(total, 0);
    expect(before[before.length - 1]).toEqual(after[0]);
  });

  it('handles cuts at the ends', () => {
    expect(splitLineAt(line, 0)[1]).toEqual(line);
    expect(splitLineAt(line, total + 100)[0]).toEqual(line);
  });

  it('finds the barangay of each label point, inside its bounds', () => {
    for (const f of BARANGAYS.features) {
      expect(barangayAt(f.properties.labelPoint, BARANGAYS)?.properties.id).toBe(f.properties.id);
      const [w, s, e, n] = boundsOf(f);
      const [x, y] = f.properties.labelPoint;
      expect(x >= w && x <= e && y >= s && y <= n).toBe(true);
    }
  });

  it('returns null outside Carmona (e.g. Manila City Hall)', () => {
    expect(barangayAt([120.9817, 14.5896], BARANGAYS)).toBeNull();
  });
});

describe('Philippine mobile numbers', () => {
  it.each([
    ['09171234567', '+639171234567'],
    ['0917 123 4567', '+639171234567'],
    ['+63 917 123 4567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['(0917) 123-4567', '+639171234567'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhMobile(input)).toBe(expected);
  });

  it.each(['0917123456', '08171234567', '12345', '', '+1 917 123 4567'])('rejects %s', (input) => {
    expect(normalizePhMobile(input)).toBeNull();
  });

  it('masks the middle digits when shown back', () => {
    expect(maskPhMobile('+639171234567')).toBe('0917 ••• 4567');
  });
});

describe('Manila calendar keys', () => {
  it('round-trips date keys', () => {
    const t = manilaEpoch(2026, 12, 25, 7, 30);
    expect(manilaDateKey(t)).toBe('2026-12-25');
    expect(parseDateKey('2026-12-25')).toBe(manilaEpoch(2026, 12, 25));
  });

  it('counts calendar days, not 24-hour periods', () => {
    expect(manilaDayDiff(manilaEpoch(2026, 9, 29, 23, 50), manilaEpoch(2026, 9, 30, 0, 10))).toBe(
      1,
    );
    expect(manilaDayDiff(manilaEpoch(2026, 9, 29, 0, 10), manilaEpoch(2026, 9, 29, 23, 50))).toBe(
      0,
    );
  });
});
