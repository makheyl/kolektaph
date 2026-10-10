import type { PointsEntry, Voucher } from '@/services/types';

/** What a device holds that an account can take over: its reports, points and vouchers. */
export interface Holdings {
  /** Ticket numbers the device sent or claimed. */
  reports: string[];
  points: PointsEntry[];
  vouchers: Voucher[];
}

export const NOTHING: Holdings = { reports: [], points: [], vouchers: [] };

export const holdsAnything = (h: Holdings) =>
  h.reports.length > 0 || h.points.length > 0 || h.vouchers.length > 0;

/**
 * Both sides together, each item once. Points stay in the order they were earned, so the
 * history reads the same after a transfer as before it.
 */
export function mergeHoldings(into: Holdings, from: Holdings): Holdings {
  const once = <T extends { id: string }>(items: T[]) => [
    ...new Map(items.map((item) => [item.id, item])).values(),
  ];
  return {
    reports: [...new Set([...into.reports, ...from.reports])],
    points: once([...into.points, ...from.points]).sort((a, b) => a.at - b.at),
    vouchers: once([...into.vouchers, ...from.vouchers]),
  };
}
