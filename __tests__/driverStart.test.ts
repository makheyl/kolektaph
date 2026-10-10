import { greetingKey, PRE_TRIP_CHECKS, START_LOADS } from '@/features/driver/format';
import { beginShift } from '@/features/driver/shift';
import en from '@/i18n/locales/en.json';
import fil from '@/i18n/locales/fil.json';
import { manilaEpoch } from '@/lib/time';
import { useDriver } from '@/stores/driver';

// The upload and the phone's GPS service are not part of what is checked here.
jest.mock('@/features/driver/sync', () => ({ syncNow: jest.fn() }));
jest.mock('@/features/driver/recorder', () => ({
  preparePhoneGps: jest.fn(async () => ({ ok: true })),
  startPhoneGps: jest.fn(async () => ({ ok: true })),
  stopPhoneGps: jest.fn(async () => {}),
}));

describe('before the shift', () => {
  beforeEach(() => {
    useDriver.setState({
      session: { truckId: 't2', signedInAt: 0 },
      shift: null,
      outbox: [],
    });
  });

  it('greets by the time of day in Carmona', () => {
    expect(greetingKey(manilaEpoch(2026, 9, 29, 5, 30))).toBe('morning');
    expect(greetingKey(manilaEpoch(2026, 9, 29, 11, 59))).toBe('morning');
    expect(greetingKey(manilaEpoch(2026, 9, 29, 12, 0))).toBe('afternoon');
    expect(greetingKey(manilaEpoch(2026, 9, 29, 17, 59))).toBe('afternoon');
    expect(greetingKey(manilaEpoch(2026, 9, 29, 18, 0))).toBe('evening');
    expect(greetingKey(manilaEpoch(2026, 9, 29, 23, 0))).toBe('evening');
  });

  it('has the eight pre-trip checks, each worded in both languages', () => {
    expect(PRE_TRIP_CHECKS).toHaveLength(8);
    expect(new Set(PRE_TRIP_CHECKS).size).toBe(8);
    for (const item of PRE_TRIP_CHECKS) {
      expect(fil.driver.start.check[item]).toBeTruthy();
      expect(en.driver.start.check[item]).toBeTruthy();
    }
  });

  it('offers an empty truck, a quarter or half as the starting load', () => {
    expect([...START_LOADS]).toEqual([0, 0.25, 0.5]);
  });

  it('a shift that starts with a load reports it right after the start, as the crew would', async () => {
    const result = await beginShift({
      routeId: 'r-poblacion-milagrosa',
      crew: 3,
      gpsSource: 'demo',
      startLoad: 0.5,
    });
    expect(result).toEqual({ ok: true });
    const { shift, outbox } = useDriver.getState();
    expect(outbox.map((o) => o.event.kind)).toEqual(['shift_start', 'load']);
    expect(outbox[1].event).toMatchObject({ kind: 'load', load: 0.5, shiftId: shift?.shiftId });
    // Not held back for undo: it is part of starting, not a tap to take back.
    expect(outbox[1].holdUntil).toBe(0);
  });

  it('a shift that starts empty reports only its start', async () => {
    await beginShift({ routeId: null, crew: 2, gpsSource: 'demo', startLoad: 0 });
    expect(useDriver.getState().outbox.map((o) => o.event.kind)).toEqual(['shift_start']);
  });
});
