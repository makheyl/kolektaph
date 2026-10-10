import { reportedLoad } from '@/features/driver/load';
import type { TruckEventInput } from '@/services/types';

const load = (value: number): TruckEventInput => ({ kind: 'load', load: value }) as TruckEventInput;
const full = { kind: 'status', status: 'full' } as TruckEventInput;
const leave = { kind: 'disposal', action: 'leave' } as TruckEventInput;
const route = { kind: 'status', status: 'on_route' } as TruckEventInput;

describe('reported load', () => {
  it('is none before the crew reports one', () => {
    expect(reportedLoad([])).toBeNull();
    expect(reportedLoad([route])).toBeNull();
  });

  it('is the last load the crew chose', () => {
    expect(reportedLoad([load(0.25), route, load(0.5)])).toBe(0.5);
  });

  it('counts a full truck as 100%', () => {
    expect(reportedLoad([load(0.25), full])).toBe(1);
  });

  it('is cleared once the truck leaves the tapunan empty', () => {
    expect(reportedLoad([load(0.75), leave])).toBeNull();
    expect(reportedLoad([load(0.75), leave, load(0.25)])).toBe(0.25);
  });
});
