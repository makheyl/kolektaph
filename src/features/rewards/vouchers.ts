import type { Voucher } from '@/services/types';

/**
 * What a voucher is now: used at the counter, or still good. A voucher past its last day is
 * expired, worked out from the date and never stored, so it cannot be out of date.
 */
export function voucherState(
  voucher: Pick<Voucher, 'status' | 'validUntil'>,
  now: number,
): Voucher['status'] {
  if (voucher.status !== 'issued') return voucher.status;
  return now > voucher.validUntil ? 'expired' : 'issued';
}
