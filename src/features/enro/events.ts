/**
 * How a truck event reads in the City ENRO timeline ("7:45 AM · PUNO na").
 */
import type { TFunction } from 'i18next';

import type { IconName } from '@/components/ui/Icon';
import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import type { Route, TruckEvent } from '@/services/types';

import { percent } from './format';

export function eventIcon(e: TruckEvent): IconName {
  switch (e.kind) {
    case 'shift_start':
      return 'play-circle';
    case 'shift_end':
      return 'stop-circle-outline';
    case 'status':
      return TRUCK_STATUS_META[e.status].icon;
    case 'load':
      return 'weight';
    case 'disposal':
      return 'truck-delivery';
    case 'incident':
      return 'car-wrench';
    case 'incident_end':
      return 'check-circle';
    case 'street':
      return e.outcome === 'collected' ? 'check' : 'debug-step-over';
    case 'task':
      return e.action === 'done' ? 'clipboard-check-outline' : 'clipboard-arrow-right-outline';
  }
}

export function describeEvent(
  t: TFunction,
  e: TruckEvent,
  route: Route | undefined,
  nameOf: (barangayId: string) => string,
): string {
  const k = 'enro.trucks.event';
  switch (e.kind) {
    case 'shift_start':
      return t(`${k}.shift_start`, { crew: e.crew });
    case 'shift_end':
      return t(`${k}.shift_end`);
    case 'status':
      return t(`${k}.status`, { status: t(`truck.status.${e.status}`) });
    case 'load':
      return t(`${k}.load`, { load: percent(e.load) });
    case 'disposal':
      return t(e.action === 'arrive' ? `${k}.disposal_arrive` : `${k}.disposal_leave`);
    case 'incident':
      return t(`${k}.incident`, {
        incident: t(`incident.${e.incident}`),
        duration: t(`driver.incident.minutes.${e.minutes}`, {
          defaultValue: t('common.minutes', { count: e.minutes }),
        }),
      });
    case 'incident_end':
      return t(`${k}.incident_end`);
    case 'task':
      return t(e.action === 'done' ? `${k}.task_done` : `${k}.task_start`, { ticket: e.ticketId });
    case 'street': {
      const seg = route?.segments.find((s) => s.id === e.segmentIds[0]);
      const street = `${seg?.name ?? t('truck.unnamedRoad')}, ${seg?.barangayId ? nameOf(seg.barangayId) : ''}`;
      return e.outcome === 'collected'
        ? t(`${k}.street_collected`, { street })
        : t(`${k}.street_skipped`, { street, reason: t(`skipReason.${e.reason}`) });
    }
  }
}
