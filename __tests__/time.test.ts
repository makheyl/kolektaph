import {
  atManilaTime,
  DAY,
  formatClock,
  manilaEpoch,
  manilaParts,
  nextWeekdayAt,
  parseHHmm,
} from '@/lib/time';

// 2026-09-29 is a Tuesday.
const TUE_0725 = manilaEpoch(2026, 9, 29, 7, 25);

describe('Asia/Manila time helpers', () => {
  it('uses a fixed UTC+8 offset', () => {
    expect(new Date(TUE_0725).toISOString()).toBe('2026-09-28T23:25:00.000Z');
  });

  it('reads Manila wall-clock parts', () => {
    expect(manilaParts(TUE_0725)).toEqual({
      year: 2026,
      month: 9,
      day: 29,
      weekday: 2,
      hour: 7,
      minute: 25,
    });
  });

  it('formats a 12-hour clock like Philippine schedules', () => {
    expect(formatClock(TUE_0725)).toBe('7:25 AM');
    expect(formatClock(manilaEpoch(2026, 9, 29, 0, 5))).toBe('12:05 AM');
    expect(formatClock(manilaEpoch(2026, 9, 29, 12, 0))).toBe('12:00 PM');
    expect(formatClock(manilaEpoch(2026, 9, 29, 18, 0))).toBe('6:00 PM');
  });

  it('parses HH:mm and places it on the same Manila day', () => {
    expect(parseHHmm('07:00')).toBe(420);
    expect(() => parseHHmm('7am')).toThrow();
    expect(atManilaTime(TUE_0725, '10:00')).toBe(manilaEpoch(2026, 9, 29, 10, 0));
  });

  it('finds the next weekday, counting today', () => {
    expect(nextWeekdayAt(TUE_0725, 2, '06:55')).toBe(manilaEpoch(2026, 9, 29, 6, 55));
    expect(nextWeekdayAt(TUE_0725, 5, '07:00')).toBe(manilaEpoch(2026, 10, 2, 7, 0));
    expect(nextWeekdayAt(TUE_0725, 1, '18:00')).toBe(manilaEpoch(2026, 9, 28, 18, 0) + 7 * DAY);
  });
});
