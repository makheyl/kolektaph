import type { HaulingQuote, PointsRules } from '@/services/types';

/** Points are spent a hundred at a time: that is how the discount is set. */
export const POINTS_STEP = 100;

/** The fee before any discount: base, distance and disposal, in whole pesos. */
export const quoteSubtotal = (quote: HaulingQuote) =>
  quote.baseFee + quote.distanceFee + quote.disposalFee;

/** Pesos taken off for `points` Eco Points (whole hundreds only). */
export const pointsDiscount = (points: number, rules: Pick<PointsRules, 'pesosPer100'>) =>
  Math.floor(points / POINTS_STEP) * rules.pesosPer100;

/**
 * The most points a resident can put on a booking: what they have, in whole hundreds, and never
 * more than the fee itself (a booking is not paid for by points beyond its price).
 */
export function maxPointsFor(
  quote: HaulingQuote,
  balance: number,
  rules: Pick<PointsRules, 'pesosPer100'>,
): number {
  if (rules.pesosPer100 <= 0) return 0;
  const affordable = Math.floor(Math.max(0, balance) / POINTS_STEP);
  const useful = Math.floor(quoteSubtotal(quote) / rules.pesosPer100);
  return Math.min(affordable, useful) * POINTS_STEP;
}

/** What is left to pay after the points discount. Never below zero. */
export const amountDue = (
  quote: HaulingQuote,
  pointsUsed: number,
  rules: Pick<PointsRules, 'pesosPer100'>,
) => Math.max(0, quoteSubtotal(quote) - pointsDiscount(pointsUsed, rules));

/** "1,500": pesos with thousands separators (the ₱ sign is added by the text around it). */
export const formatPesos = (amount: number) =>
  String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
