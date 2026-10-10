import { useEffect, useState } from 'react';

import { services } from '@/services';
import type { HaulingRates, HaulingRequest } from '@/services/types';

/** The resident's hauling requests, newest first; null until the first list arrives. */
export function useMyHauling(): HaulingRequest[] | null {
  const [requests, setRequests] = useState<HaulingRequest[] | null>(null);
  useEffect(() => services.hauling.subscribeMine(setRequests), []);
  return requests;
}

/** Every hauling request the City holds (City ENRO); null until the first list arrives. */
export function useAllHauling(): HaulingRequest[] | null {
  const [requests, setRequests] = useState<HaulingRequest[] | null>(null);
  useEffect(() => services.hauling.subscribeAll(setRequests), []);
  return requests;
}

/** The City's booking fees; null until they are set (or always, on the pilot database until then). */
export function useHaulingRates(): HaulingRates | null {
  const [rates, setRates] = useState<HaulingRates | null>(null);
  useEffect(() => services.hauling.subscribeRates(setRates), []);
  return rates;
}
