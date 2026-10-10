/**
 * Sample HaulingService: private-hauling requests on this device and in memory only, starting
 * from the sample requests (see data/samples/hauling). No request reaches the City and no money
 * moves: every payment is marked as a sample. A server implements the same interface later.
 */
import { BARANGAYS } from '@/data/carmona';
import {
  haulingNumber,
  SAMPLE_HAULING_COUNT,
  SAMPLE_HAULING_RATES,
  sampleHauling,
} from '@/data/samples/hauling';
import { amountDue, pointsDiscount } from '@/features/hauling/pricing';
import { canCancel, canPay } from '@/features/hauling/status';
import { barangayAt } from '@/lib/geo';
import { manilaParts } from '@/lib/time';

import { OfflineError, ServerError } from '../errors';
import type {
  HaulingEvent,
  HaulingRequest,
  HaulingService,
  HaulingStatus,
  PointsRules,
} from '../types';

export interface HaulingDeps {
  getSimTime: () => number;
  isOnline: () => boolean;
  /** The points a resident has, and the way to spend them on a booking. */
  pointsBalance: () => number;
  spendPoints: (points: number, ref: string) => void;
  pointsRules: () => Pick<PointsRules, 'pesosPer100'>;
}

const NETWORK_MS = 250;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface MockHauling extends HaulingService {
  reset(): void;
}

export function createMockHauling(deps: HaulingDeps): MockHauling {
  let requests: HaulingRequest[] | null = null;
  let seq = 100 + SAMPLE_HAULING_COUNT;
  const byRef = new Map<string, string>();
  const listeners = new Set<(requests: HaulingRequest[]) => void>();

  const all = () => (requests ??= sampleHauling(deps.getSimTime()));
  const publish = () => listeners.forEach((l) => l(all()));
  const save = (next: HaulingRequest) => {
    requests = [next, ...all().filter((r) => r.id !== next.id)].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    publish();
    return next;
  };
  const step = (
    request: HaulingRequest,
    status: HaulingStatus,
    by: HaulingEvent['by'],
  ): HaulingRequest => {
    const at = deps.getSimTime();
    return {
      ...request,
      status,
      history: [
        ...request.history,
        { id: `${request.id}|${status}|${at}`, status, at, by, note: null },
      ],
    };
  };
  const find = (id: string) => {
    const request = all().find((r) => r.id === id);
    if (!request) throw new ServerError('not_found', 404);
    return request;
  };
  // The sample device is both the requester and the City, so one list serves both views.
  const subscribe = (listener: (requests: HaulingRequest[]) => void) => {
    listener(all());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const reach = async () => {
    await wait(NETWORK_MS);
    if (!deps.isOnline()) throw new OfflineError();
  };

  return {
    subscribeMine: subscribe,
    subscribeAll: subscribe,
    subscribeRates(listener) {
      listener(SAMPLE_HAULING_RATES);
      return () => {};
    },
    async submit(input) {
      await reach();
      // The same request sent twice (a retry after a lost answer) is filed once.
      const known = input.clientRef ? byRef.get(input.clientRef) : undefined;
      if (known) return find(known);
      const now = deps.getSimTime();
      const { clientRef, ...request } = input;
      const id = haulingNumber(manilaParts(now).year, ++seq);
      if (clientRef) byRef.set(clientRef, id);
      return save({
        ...request,
        id,
        barangayId: barangayAt(request.location, BARANGAYS)?.properties.id ?? null,
        createdAt: now,
        status: 'requested',
        quote: null,
        payment: null,
        history: [
          {
            id: `${id}|requested|${now}`,
            status: 'requested',
            at: now,
            by: 'resident',
            note: null,
          },
        ],
        sample: false,
      });
    },
    async pay(id, method, pointsUsed) {
      await reach();
      const request = find(id);
      const now = deps.getSimTime();
      if (!request.quote || !canPay(request, now)) throw new ServerError('invalid_transition', 409);
      if (pointsUsed < 0 || pointsUsed > deps.pointsBalance()) {
        throw new ServerError('not_enough_points', 409);
      }
      const rules = deps.pointsRules();
      deps.spendPoints(pointsUsed, id);
      return save({
        ...step(request, 'accepted', 'resident'),
        payment: {
          method,
          pointsUsed,
          pointsDiscount: pointsDiscount(pointsUsed, rules),
          total: amountDue(request.quote, pointsUsed, rules),
          at: now,
          state: method === 'cash' ? 'due' : 'paid',
          sample: true,
        },
      });
    },
    async cancel(id) {
      await reach();
      const request = find(id);
      if (!canCancel(request)) throw new ServerError('invalid_transition', 409);
      return save(step(request, 'cancelled', 'resident'));
    },
    reset() {
      requests = null;
      seq = 100 + SAMPLE_HAULING_COUNT;
      byRef.clear();
      publish();
    },
  };
}
