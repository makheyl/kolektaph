import { useQuery } from '@tanstack/react-query';

import { MINUTE } from '@/lib/time';
import { services } from '@/services';
import { useDemo } from '@/stores/demo';

/** Per-day collection figures for [fromDay, toDay], refreshed every 5 minutes of demo time. */
export function useDailyStats(fromDay: number, toDay: number, now: number) {
  const clock = useDemo((s) => s.clock);
  const bucket = Math.floor(now / (5 * MINUTE));
  return useQuery({
    queryKey: ['dailyStats', fromDay, toDay, bucket, clock],
    queryFn: () => services.stats.getDailyStats(fromDay, toDay),
    // Keep showing the same range while it refreshes (not another range's numbers).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === fromDay ? previous : undefined,
  });
}
