import type { TFunction } from 'i18next';

import { barangayVisit } from '@/features/tracking/eta';
import { formatClock } from '@/lib/time';
import type { Route, TruckState } from '@/services/types';

/** One line relating a truck to the resident's barangay: "Darating sa Milagrosa mga 7:40 AM". */
export function truckRelationText(
  t: TFunction,
  route: Route | undefined,
  truck: TruckState,
  barangayId: string | null,
  barangayName: string,
  now: number,
): string | null {
  if (!barangayId || !route) return null;
  const visit = barangayVisit(route, truck, barangayId, now);
  if (!visit) return t('resident.map.notOnRoute', { barangay: barangayName });
  switch (visit.state) {
    case 'passed':
      return t('resident.map.passedAt', {
        barangay: barangayName,
        time: formatClock(visit.passedAt),
      });
    case 'in_progress':
      return t('resident.map.inBarangay', { barangay: barangayName });
    case 'upcoming':
      return visit.arriveAt == null
        ? t('resident.map.noEta')
        : t('resident.map.arrives', { barangay: barangayName, time: formatClock(visit.arriveAt) });
  }
}
