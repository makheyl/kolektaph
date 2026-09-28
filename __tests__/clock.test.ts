import { jumpTo, LIVE_CLOCK, simNow, withSpeed } from '@/simulator/clock';

describe('demo clock', () => {
  it('is real time in live mode', () => {
    expect(simNow(LIVE_CLOCK, 1_000)).toBe(1_000);
  });

  it('jumps to a chosen moment and then runs forward', () => {
    const c = jumpTo(LIVE_CLOCK, 50_000, 1_000);
    expect(c.mode).toBe('demo');
    expect(simNow(c, 1_000)).toBe(50_000);
    expect(simNow(c, 3_000)).toBe(52_000);
  });

  it('changes speed without a time jump', () => {
    const c = jumpTo(LIVE_CLOCK, 50_000, 1_000);
    const fast = withSpeed(c, 60, 2_000); // sim time is 51_000 at real 2_000
    expect(simNow(fast, 2_000)).toBe(51_000);
    expect(simNow(fast, 3_000)).toBe(51_000 + 60_000);
  });
});
