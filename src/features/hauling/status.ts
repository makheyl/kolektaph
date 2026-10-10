import type { IconName } from '@/components/ui/Icon';
import type { HaulingRequest, HaulingStatus, PaymentMethod } from '@/services/types';
import { colors } from '@/theme/tokens';

/** What a request looks like to its requester, once the 24-hour rule is applied. */
export type HaulingView = HaulingStatus | 'expired';

/**
 * A quotation not accepted in time has lapsed. That is a rule, not something stored: the
 * request still says "quoted" and this works out what to show.
 */
export function haulingView(request: Pick<HaulingRequest, 'status' | 'quote'>, now: number) {
  return request.status === 'quoted' && request.quote && now > request.quote.validUntil
    ? ('expired' as const)
    : request.status;
}

/** Icon and colour per step (always shown with its words). The colours follow the reports'. */
export const HAULING_STATUS_META: Record<
  HaulingView,
  { icon: IconName; color: string; soft: string }
> = {
  requested: { icon: 'inbox-arrow-down', color: colors.amber, soft: colors.amberSoft },
  quoted: { icon: 'cash-multiple', color: colors.amber, soft: colors.amberSoft },
  accepted: { icon: 'check-decagram', color: colors.blue, soft: colors.blueSoft },
  scheduled: { icon: 'calendar-clock', color: colors.blue, soft: colors.blueSoft },
  in_progress: { icon: 'truck-fast', color: colors.blue, soft: colors.blueSoft },
  completed: { icon: 'check-circle', color: colors.primary, soft: colors.greenSoft },
  declined: { icon: 'close-octagon', color: colors.red, soft: colors.redSoft },
  cancelled: { icon: 'cancel', color: colors.grey, soft: colors.greySoft },
  expired: { icon: 'timer-off-outline', color: colors.grey, soft: colors.greySoft },
};

/** The steps a request that goes well passes through, in order. */
export const HAULING_STEPS: HaulingStatus[] = [
  'requested',
  'quoted',
  'accepted',
  'scheduled',
  'in_progress',
  'completed',
];

/** The requester can pay only while the quotation stands. */
export const canPay = (request: Pick<HaulingRequest, 'status' | 'quote'>, now: number) =>
  haulingView(request, now) === 'quoted';

/** The requester can call it off any time before the crew sets out. */
export const canCancel = (request: Pick<HaulingRequest, 'status'>) =>
  ['requested', 'quoted', 'accepted', 'scheduled'].includes(request.status);

export const PAYMENT_METHODS: { id: PaymentMethod; icon: IconName }[] = [
  { id: 'gcash', icon: 'cellphone' },
  { id: 'maya', icon: 'credit-card-outline' },
  { id: 'card', icon: 'credit-card' },
  { id: 'cash', icon: 'cash' },
];

/** How "Aking mga report" groups a request, with the same three filters as the reports. */
export function haulingGroup(view: HaulingView): 'review' | 'scheduled' | 'done' | 'other' {
  if (view === 'requested' || view === 'quoted') return 'review';
  if (view === 'accepted' || view === 'scheduled' || view === 'in_progress') return 'scheduled';
  if (view === 'completed') return 'done';
  return 'other';
}
