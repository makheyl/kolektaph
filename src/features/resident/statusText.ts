/**
 * What the Home status card says for each status, as lines with structured facts. Kolek's
 * "Nasaan na ang truck?" answer uses the same lines, so the two can never disagree.
 */
import { LOOKAHEAD_DAYS } from '@/features/schedule/collections';
import type { KolekLine } from '@/services/types';

import type { HomeStatus } from './homeStatus';

export interface StatusText {
  title: KolekLine;
  lines: KolekLine[];
  /** Short highlighted fact, e.g. "in 12 min". */
  chip: KolekLine | null;
  /** The truck is worth watching on the map. */
  showMap: boolean;
}

const S = 'resident.home.status';

export function statusText(
  status: Exclude<HomeStatus, { kind: 'no_barangay' }>,
  barangayId: string,
): StatusText {
  const line = (key: string, values?: KolekLine['values']): KolekLine => ({
    key: `${S}.${key}`,
    values,
  });
  switch (status.kind) {
    case 'no_collection_today':
      return {
        title: line('noneTodayTitle'),
        lines: [
          status.next
            ? line('noneTodayBody', {
                day: { kind: 'day', at: status.next.start },
                window: { kind: 'window', start: status.next.start, end: status.next.end },
              })
            : line('noneTodayNoNext', {
                weeks: { kind: 'number', value: Math.round(LOOKAHEAD_DAYS / 7) },
              }),
        ],
        chip: null,
        showMap: false,
      };
    case 'before_start':
      return {
        title: line('beforeStartTitle'),
        lines: [line('beforeStartBody', { time: { kind: 'time', at: status.departAt } })],
        chip: null,
        showMap: true,
      };
    case 'approaching':
      return {
        title: line('approachingTitle'),
        lines: [
          line('approachingBody', {
            place: { kind: 'barangay', id: status.truckBarangayId },
            time: { kind: 'time', at: status.arriveAt },
          }),
        ],
        chip: line('approachingIn', { minutes: { kind: 'minutes', value: status.minutes } }),
        showMap: true,
      };
    case 'bring_out':
      return {
        title: line('bringOutTitle'),
        lines: [line('bringOutBody', { time: { kind: 'time', at: status.arriveAt } })],
        chip: line('bringOutIn', { minutes: { kind: 'minutes', value: status.minutes } }),
        showMap: true,
      };
    case 'in_barangay':
      return {
        title: line('inBarangayTitle'),
        lines: [
          ...(status.streetName
            ? [line('inBarangayStreet', { street: { kind: 'text', value: status.streetName } })]
            : []),
          ...(status.finishAt
            ? [line('inBarangayFinish', { time: { kind: 'time', at: status.finishAt } })]
            : []),
        ],
        chip: null,
        showMap: true,
      };
    case 'passed':
      return {
        title: line('passedTitle', { barangay: { kind: 'barangay', id: barangayId } }),
        lines: [
          line('passedBody', { time: { kind: 'time', at: status.passedAt } }),
          ...(status.next
            ? [
                line('passedNext', {
                  day: { kind: 'day', at: status.next.start },
                  window: { kind: 'window', start: status.next.start, end: status.next.end },
                }),
              ]
            : []),
        ],
        chip: null,
        showMap: false,
      };
    case 'full':
      return { title: line('fullTitle'), lines: [line('fullBody')], chip: null, showMap: true };
    case 'breakdown':
      return {
        title: line('breakdownTitle', {
          incident: { kind: 'i18n', key: `incident.${status.incident}` },
        }),
        lines: [
          status.arriveAt
            ? line('breakdownArrive', { time: { kind: 'time', at: status.arriveAt } })
            : line('breakdownResume', { time: { kind: 'time', at: status.resumeAt } }),
          line('breakdownHold'),
        ],
        chip: null,
        showMap: true,
      };
    case 'paused': {
      const disposal = status.reason === 'to_disposal';
      return {
        title: line(disposal ? 'pausedDisposalTitle' : 'pausedBreakTitle'),
        lines: [line(disposal ? 'pausedDisposalBody' : 'pausedBreakBody')],
        chip: null,
        showMap: true,
      };
    }
    case 'unfinished':
      return {
        title: line('unfinishedTitle'),
        lines: [line('unfinishedBody')],
        chip: null,
        showMap: false,
      };
    case 'no_signal':
      return {
        title: line('noSignalTitle'),
        lines: [line('noSignalBody')],
        chip: null,
        showMap: false,
      };
  }
}
