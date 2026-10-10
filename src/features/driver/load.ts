import type { TruckEventInput } from '@/services/types';

/**
 * The load the crew last reported from this phone (1 when the truck was reported full), or null
 * when there is none. Leaving the tapunan empties the truck, so a report made before that no
 * longer counts.
 */
export function reportedLoad(events: readonly TruckEventInput[]): number | null {
  const last = events.findLast(
    (e) =>
      e.kind === 'load' ||
      (e.kind === 'status' && e.status === 'full') ||
      (e.kind === 'disposal' && e.action === 'leave'),
  );
  if (!last) return null;
  if (last.kind === 'load') return last.load;
  if (last.kind === 'status') return 1;
  return null;
}
