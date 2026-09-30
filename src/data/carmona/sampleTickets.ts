/**
 * SAMPLE reports for the prototype: a spread of categories and statuses around Carmona, built
 * with the real lifecycle so every history is valid. Times are relative to when the demo data
 * is created. Photos are bundled sample pictures, labelled as samples.
 */
import { applyAction, newTicket, ticketNumber } from '@/features/reports/lifecycle';
import { DAY, HOUR, manilaParts } from '@/lib/time';
import type {
  LngLat,
  NewReport,
  PhotoRef,
  Ticket,
  TicketAction,
  TicketActor,
} from '@/services/types';

const sample = (id: Extract<PhotoRef, { kind: 'sample' }>['id']): PhotoRef => ({
  kind: 'sample',
  id,
});

/** Offset a point by metres (east, north); fine at city scale. */
const at = ([lng, lat]: LngLat, east: number, north: number): LngLat => [
  lng + east / 107_900,
  lat + north / 110_540,
];

// Near barangay label points (sample places, not real addresses).
const MILAGROSA_CANAL = at([121.04384, 14.30479], 120, -80);
const POBLACION_3 = at([121.05353, 14.31121], 30, 20);

interface Step {
  hoursAgo: number;
  action: TicketAction;
  by: TicketActor;
}

export const SAMPLE_TICKET_COUNT = 12;

export function sampleTickets(now: number): Ticket[] {
  const year = manilaParts(now).year;
  let seq = 100;
  const make = (
    report: Partial<NewReport> & Pick<NewReport, 'category' | 'location'>,
    barangayId: string,
    hoursAgo: number,
    steps: Step[] = [],
  ): Ticket => {
    seq += 1;
    const id = ticketNumber(year, seq);
    let t = newTicket(
      id,
      {
        size: 'bags',
        photos: [],
        accuracyM: 8,
        landmark: '',
        nearWaterway: false,
        nearSensitive: false,
        note: '',
        contact: null,
        ...report,
      },
      { at: now - hoursAgo * HOUR, barangayId },
    );
    steps.forEach((s, i) => {
      t = applyAction(t, s.action, {
        at: now - s.hoursAgo * HOUR,
        by: s.by,
        eventId: `${id}|${i}`,
      });
    });
    return { ...t, sample: true };
  };

  return [
    make(
      {
        category: 'DUMPING',
        size: 'pile',
        location: MILAGROSA_CANAL,
        nearWaterway: true,
        photos: [sample('dumping'), sample('waterway')],
        landmark: 'Tabi ng kanal, likod ng basketball court',
      },
      'milagrosa',
      30,
      [{ hoursAgo: 26, action: { type: 'verify' }, by: 'enro' }],
    ),
    make(
      {
        category: 'OVERFLOW',
        location: POBLACION_3,
        photos: [sample('overflow')],
        landmark: 'Communal bin sa kanto ng palengke',
      },
      'brgy-3',
      5,
    ),
    make(
      {
        category: 'WATERWAY',
        size: 'pile',
        location: at([121.06413, 14.31325], -60, 40),
        photos: [sample('waterway')],
        landmark: 'Ilalim ng tulay',
      },
      'maduya',
      20,
      [
        {
          hoursAgo: 18,
          action: { type: 'dispatch', mode: 'special_pickup', truckId: 't4', due: now + 4 * HOUR },
          by: 'enro',
        },
      ],
    ),
    make(
      {
        category: 'ANIMAL',
        location: at([121.03458, 14.28408], 90, 150),
        photos: [sample('animal')],
        landmark: 'Gilid ng kalsada, tapat ng sari-sari store',
      },
      'lantic',
      2,
    ),
    make(
      {
        category: 'BULKY',
        size: 'pile',
        location: at([121.01391, 14.28772], -40, 70),
        photos: [sample('bulky')],
        landmark: 'Lumang kutson at aparador sa harap ng gate',
      },
      'bancal',
      72,
      [
        {
          hoursAgo: 70,
          action: { type: 'dispatch', mode: 'next_schedule', truckId: 't1', due: now + 2 * DAY },
          by: 'enro',
        },
      ],
    ),
    make(
      {
        category: 'EVENT',
        size: 'pile',
        location: at([121.03393, 14.30408], 50, -60),
        photos: [sample('event')],
        landmark: 'Covered court, pagkatapos ng pista',
      },
      'mabuhay',
      26,
      [
        { hoursAgo: 25, action: { type: 'verify' }, by: 'enro' },
        {
          hoursAgo: 24,
          action: { type: 'dispatch', mode: 'add_to_route', truckId: 't3', due: now },
          by: 'enro',
        },
        { hoursAgo: 11, action: { type: 'start' }, by: 'driver' },
        {
          hoursAgo: 10,
          action: { type: 'collect', before: sample('event'), after: sample('clean') },
          by: 'driver',
        },
      ],
    ),
    make(
      {
        category: 'DUMPING',
        size: 'pile',
        location: at([121.04159, 14.31774], -20, -30),
        photos: [sample('dumping')],
        landmark: 'Bakanteng lote sa dulo ng kalye',
      },
      'cabilang-baybay',
      96,
      [
        { hoursAgo: 95, action: { type: 'verify' }, by: 'enro' },
        {
          hoursAgo: 94,
          action: { type: 'dispatch', mode: 'special_pickup', truckId: 't2', due: now },
          by: 'enro',
        },
        {
          hoursAgo: 80,
          action: { type: 'collect', before: sample('dumping'), after: sample('clean') },
          by: 'driver',
        },
        { hoursAgo: 79, action: { type: 'rate', stars: 5 }, by: 'resident' },
      ],
    ),
    make(
      {
        category: 'OVERFLOW',
        location: at(POBLACION_3, 15, -10),
        photos: [sample('overflow')],
        landmark: 'Kanto ng palengke',
      },
      'brgy-3',
      1,
    ),
    make(
      {
        category: 'HAZARD',
        location: at([121.05579, 14.31468], 20, 30),
        nearSensitive: true,
        photos: [sample('hazard')],
        landmark: 'Basag na bote at lumang baterya malapit sa paaralan',
      },
      'brgy-8',
      3,
      [{ hoursAgo: 2, action: { type: 'verify' }, by: 'enro' }],
    ),
    make(
      {
        category: 'DUMPING',
        size: 'pile',
        location: at(MILAGROSA_CANAL, -10, 15),
        photos: [sample('dumping')],
      },
      'milagrosa',
      240,
      [
        {
          hoursAgo: 238,
          action: { type: 'dispatch', mode: 'special_pickup', truckId: 't2', due: now },
          by: 'enro',
        },
        {
          hoursAgo: 230,
          action: { type: 'collect', before: sample('dumping'), after: sample('clean') },
          by: 'driver',
        },
      ],
    ),
    make(
      {
        category: 'DUMPING',
        location: at(MILAGROSA_CANAL, 20, -5),
        photos: [sample('dumping')],
      },
      'milagrosa',
      480,
      [
        {
          hoursAgo: 478,
          action: { type: 'dispatch', mode: 'special_pickup', truckId: 't2', due: now },
          by: 'enro',
        },
        {
          hoursAgo: 470,
          action: { type: 'collect', before: sample('dumping'), after: sample('clean') },
          by: 'enro',
        },
      ],
    ),
    make(
      {
        category: 'OVERFLOW',
        location: at([121.05774, 14.31314], 10, 10),
        photos: [sample('street')],
      },
      'brgy-2',
      50,
      [
        {
          hoursAgo: 48,
          action: { type: 'reject', reason: 'Walang basura sa larawan.' },
          by: 'enro',
        },
      ],
    ),
  ];
}
