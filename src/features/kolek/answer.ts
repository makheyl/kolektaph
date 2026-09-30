/**
 * Ask Kolek, step 2: answer from data. Every fact in an answer comes from the same functions
 * the app screens use (schedule, Home status, settings, tickets), and the answer texts contain
 * no numbers of their own, so Kolek cannot invent a schedule, a time or a fee. When it does not
 * know, it says so and points to the barangay hall or the City ENRO.
 */
import { CATEGORY_META, RESIDENT_CATEGORIES } from '@/features/reports/categories';
import { homeStatus } from '@/features/resident/homeStatus';
import { statusText } from '@/features/resident/statusText';
import {
  collectionsForBarangay,
  isRunning,
  LOOKAHEAD_DAYS,
  nextCollection,
  nextCollectionAfterToday,
  scheduleValidOn,
  todaysCollection,
} from '@/features/schedule/collections';
import {
  atManilaTime,
  DAY,
  manilaDateKey,
  manilaParts,
  manilaStartOfDay,
  parseDateKey,
} from '@/lib/time';
import type {
  CityConfig,
  KolekAction,
  KolekContext,
  KolekIntent,
  KolekLine,
  KolekReply,
  ReportCategory,
  Route,
  RouteSchedule,
  ScheduleException,
  Ticket,
  TruckState,
  Weekday,
  WeeklyStats,
} from '@/services/types';

import { SEGREGATION_LAW, SORT_CLASSES } from './segregation';
import { type BarangayName, type Understood, understand } from './understand';

/** The national emergency hotline (Philippines, since 2016). */
export const EMERGENCY_HOTLINE = '911';
/** How far ahead Kolek mentions holiday changes. */
const CHANGES_AHEAD_DAYS = 90;

export interface KolekFacts {
  now: number;
  barangays: BarangayName[];
  schedules: RouteSchedule[];
  routes: Route[];
  exceptions: ScheduleException[];
  states: TruckState[];
  leadMinutes: number;
  weekly: WeeklyStats | null;
  contacts: CityConfig['contacts'];
  /** The resident's own tickets (from the ids kept on the device). */
  myTickets: Ticket[];
}

/** Suggestion chips (ids of `kolek.chips.*`). */
export const DEFAULT_CHIPS = ['next', 'truck', 'report', 'sort', 'missed', 'sms'];

const A = 'kolek.a';
const line = (key: string, values?: KolekLine['values']): KolekLine => ({
  key: `${A}.${key}`,
  values,
});
const action = (labelKey: string, href: string, icon: string): KolekAction => ({
  labelKey: `kolek.actions.${labelKey}`,
  href,
  icon,
});

function reply(
  intent: KolekIntent,
  lines: KolekLine[],
  actions: KolekAction[] = [],
  suggestions: string[] = DEFAULT_CHIPS,
): KolekReply {
  return { intent, lines, actions, suggestions };
}

// ---------- Helpers ----------

function contactLines(barangayId: string | null, contacts: CityConfig['contacts']): KolekLine[] {
  const out: KolekLine[] = [];
  if (barangayId) {
    const c = contacts.barangays[barangayId];
    out.push(
      c?.phone
        ? line('contactBarangay', {
            barangay: { kind: 'barangay', id: barangayId },
            phone: { kind: 'text', value: c.phone },
          })
        : line('contactBarangayNoPhone', { barangay: { kind: 'barangay', id: barangayId } }),
    );
    if (c?.hours) out.push(line('contactHours', { hours: { kind: 'text', value: c.hours } }));
  }
  const enro = contacts.enro;
  out.push(
    enro.phone
      ? line('contactEnro', { phone: { kind: 'text', value: enro.phone } })
      : line('contactEnroNoPhone'),
  );
  if (enro.hours) out.push(line('contactHours', { hours: { kind: 'text', value: enro.hours } }));
  return out;
}

const needBarangay = (intent: KolekIntent) =>
  reply(
    intent,
    [line('needBarangay')],
    [action('pickBarangay', '/resident/barangay', 'map-marker')],
  );

function regularDays(facts: KolekFacts, barangayId: string): Weekday[] {
  const today = manilaDateKey(facts.now);
  const days = facts.schedules
    .filter(
      (s) =>
        scheduleValidOn(s, today) &&
        facts.routes.find((r) => r.id === s.routeId)?.barangayIds.includes(barangayId),
    )
    .flatMap((s) => s.days);
  return [...new Set(days)].sort() as Weekday[];
}

function occurrences(facts: KolekFacts, barangayId: string, days = LOOKAHEAD_DAYS) {
  return collectionsForBarangay(
    barangayId,
    facts.schedules,
    facts.routes,
    facts.exceptions,
    manilaStartOfDay(facts.now),
    days,
  );
}

const windowOf = (o: { start: number; end: number }) =>
  ({ kind: 'window', start: o.start, end: o.end }) as const;

// ---------- Intents ----------

function nextCollectionReply(u: Understood, facts: KolekFacts, barangayId: string): KolekReply {
  const occ = occurrences(facts, barangayId);
  const b = { kind: 'barangay', id: barangayId } as const;
  const actions = [action('schedule', '/resident/schedule', 'calendar')];
  const today = manilaStartOfDay(facts.now);

  const onDay = (day: number) => occ.find((o) => isRunning(o) && o.day === day);
  let asked: number | null = null;
  if (u.day?.kind === 'today') asked = today;
  if (u.day?.kind === 'tomorrow') asked = today + DAY;
  if (u.day?.kind === 'weekday') {
    const add = (u.day.day - manilaParts(facts.now).weekday + 7) % 7;
    asked = today + add * DAY;
  }

  const lines: KolekLine[] = [];
  if (asked != null) {
    const o = onDay(asked);
    if (o) {
      lines.push(
        line('collectionOn', {
          barangay: b,
          day: { kind: 'day', at: o.start },
          window: windowOf(o),
          waste: { kind: 'i18n', key: `waste.${o.wasteType}` },
        }),
      );
      if (o.day === today) actions.unshift(action('map', '/resident/map', 'map'));
      return reply('next_collection', lines, actions);
    }
    lines.push(line('noCollectionOn', { barangay: b, day: { kind: 'day', at: asked } }));
  }

  const next =
    asked != null
      ? occ.find((o) => isRunning(o) && o.day > asked)
      : (nextCollection(occ, facts.now) ?? null);
  if (next) {
    lines.push(
      line('nextCollection', {
        barangay: b,
        day: { kind: 'day', at: next.start },
        window: windowOf(next),
        waste: { kind: 'i18n', key: `waste.${next.wasteType}` },
      }),
    );
  } else {
    lines.push(line('noSchedule', { barangay: b }), ...contactLines(barangayId, facts.contacts));
  }
  const days = regularDays(facts, barangayId);
  if (days.length) lines.push(line('regularDays', { days: { kind: 'weekdays', days } }));
  for (const o of occ.filter((x) => !isRunning(x) && x.exception)) {
    lines.push(
      line(o.kind === 'cancelled' ? 'changeCancelled' : 'changeMoved', {
        day: { kind: 'day', at: o.start },
        reason: { kind: 'localized', ...o.exception!.reason },
      }),
    );
  }
  return reply('next_collection', lines, actions);
}

function truckReply(facts: KolekFacts, barangayId: string): KolekReply {
  const occ = occurrences(facts, barangayId);
  const today = todaysCollection(occ, facts.now);
  const truck = today ? facts.states.find((s) => s.truckId === today.truckId) : undefined;
  const route = today ? facts.routes.find((r) => r.id === today.routeId) : undefined;
  const status = homeStatus({
    barangayId,
    now: facts.now,
    today,
    nextAfterToday: nextCollectionAfterToday(occ, facts.now),
    truck,
    route,
    leadMinutes: facts.leadMinutes,
  });
  if (status.kind === 'no_barangay') return needBarangay('truck_location');
  const text = statusText(status, barangayId);
  const lines = [text.title, ...text.lines, ...(text.chip ? [text.chip] : [])];
  const actions: KolekAction[] = [];
  if (text.showMap) actions.push(action('map', '/resident/map', 'map'));
  if (status.kind === 'passed' || status.kind === 'unfinished') {
    actions.push(action('missed', '/resident/missed', 'map-marker-remove'));
  }
  return reply('truck_location', lines, actions, ['next', 'missed', 'sms']);
}

function targetLine(category: ReportCategory): KolekLine {
  const target = CATEGORY_META[category].target;
  switch (target.kind) {
    case 'hours':
      return line('reportTargetHours', { hours: { kind: 'number', value: target.hours } });
    case 'next_working_day':
      return line('reportTargetNextDay');
    case 'booked':
      return line('reportTargetBooked');
    case 'same_day':
      return line('reportTargetSameDay');
  }
}

function reportReply(u: Understood): KolekReply {
  const c = u.category && RESIDENT_CATEGORIES.includes(u.category) ? u.category : null;
  if (!c) {
    return reply(
      'how_to_report',
      [line('reportSteps')],
      [action('report', '/resident/report', 'camera')],
      ['sort', 'status', 'emergency'],
    );
  }
  return reply(
    'how_to_report',
    [
      line('reportCategory', { category: { kind: 'i18n', key: `reports.category.${c}` } }),
      line('reportSteps'),
      targetLine(c),
    ],
    [action('reportThis', `/resident/report?category=${c}`, 'camera')],
    ['status', 'sort'],
  );
}

function emergencyReply(u: Understood): KolekReply {
  const c: ReportCategory | null =
    u.category === 'BURNING' || u.category === 'HAZARD' || u.category === 'DEBRIS'
      ? u.category
      : null;
  const lines = [
    line('emergencyCall', { hotline: { kind: 'text', value: EMERGENCY_HOTLINE } }),
    c
      ? line('emergencyReportCategory', {
          category: { kind: 'i18n', key: `reports.category.${c}` },
        })
      : line('emergencyReport'),
  ];
  if (c) lines.push(targetLine(c));
  return reply(
    'emergency',
    lines,
    [action('reportEmergency', c ? `/resident/report?category=${c}` : '/resident/report', 'alert')],
    ['report', 'status'],
  );
}

function missedReply(facts: KolekFacts, barangayId: string): KolekReply {
  const occ = occurrences(facts, barangayId);
  const today = todaysCollection(occ, facts.now);
  if (!today) {
    const next = nextCollectionAfterToday(occ, facts.now);
    return reply(
      'missed',
      [
        line('missedNoCollection', { barangay: { kind: 'barangay', id: barangayId } }),
        ...(next
          ? [line('missedNext', { day: { kind: 'day', at: next.start }, window: windowOf(next) })]
          : []),
      ],
      [action('report', '/resident/report', 'camera')],
      ['next', 'report'],
    );
  }
  return reply(
    'missed',
    [line('missedHow')],
    [action('missed', '/resident/missed', 'map-marker-remove')],
    ['truck', 'report'],
  );
}

function sortReply(u: Understood): KolekReply {
  const law = { kind: 'text', value: SEGREGATION_LAW } as const;
  if (u.item) {
    return reply(
      'segregation',
      [
        line('sortItem', {
          item: { kind: 'text', value: u.item.word },
          sortClass: { kind: 'i18n', key: `kolek.sort.class.${u.item.sortClass}` },
        }),
        line(`sortHow.${u.item.sortClass}`),
        line('sortSource', { law }),
      ],
      [],
      ['sort', 'next', 'report'],
    );
  }
  return reply(
    'segregation',
    [
      line('sortIntro'),
      ...SORT_CLASSES.map((c) =>
        line('sortClassLine', {
          sortClass: { kind: 'i18n', key: `kolek.sort.class.${c}` },
          examples: { kind: 'i18n', key: `kolek.sort.examples.${c}` },
        }),
      ),
      line('sortSource', { law }),
    ],
    [],
    ['next', 'report'],
  );
}

function statsReply(facts: KolekFacts): KolekReply {
  if (!facts.weekly) return fallbackReply(null, facts);
  return reply(
    'stats',
    [
      line('stats', {
        tonnes: { kind: 'number', value: facts.weekly.tonnes },
        trips: { kind: 'number', value: facts.weekly.trips },
        served: { kind: 'percent', value: facts.weekly.servedRate },
      }),
      line('sampleNote'),
    ],
    [],
    ['next', 'truck'],
  );
}

function smsReply(intent: 'sms_on' | 'sms_off', ctx: KolekContext, facts: KolekFacts) {
  const minutes = { kind: 'number', value: facts.leadMinutes } as const;
  const settings = action('settings', '/resident/settings', 'cog');
  if (intent === 'sms_off') {
    return ctx.smsOn
      ? reply('sms_off', [line('smsOff')], [settings], ['next'])
      : reply('sms_off', [line('smsNotOn')], [], ['next']);
  }
  return ctx.smsOn
    ? reply('sms_on', [line('smsAlreadyOn', { minutes })], [settings], ['truck', 'next'])
    : reply(
        'sms_on',
        [line('smsHow', { minutes })],
        [action('smsOn', '/onboarding/sms?from=settings', 'message-text')],
        ['truck', 'next'],
      );
}

function scheduleChangeReply(facts: KolekFacts, barangayId: string): KolekReply {
  const occ = occurrences(facts, barangayId, CHANGES_AHEAD_DAYS);
  const lines: KolekLine[] = [];
  for (const o of occ.filter((x) => !isRunning(x) && x.exception)) {
    const reason = { kind: 'localized', ...o.exception!.reason } as const;
    const day = { kind: 'day', at: o.start } as const;
    lines.push(
      o.kind === 'moved_out' && o.exception?.moveTo
        ? line('holidayMoved', {
            day,
            reason,
            to: { kind: 'day', at: parseDateKey(o.exception.moveTo) },
          })
        : line('holidayCancelled', { day, reason }),
    );
  }
  // Regular schedule changes the City ENRO has announced (they start on a later day).
  const today = manilaDateKey(facts.now);
  const routeIds = facts.routes.filter((r) => r.barangayIds.includes(barangayId)).map((r) => r.id);
  for (const s of facts.schedules) {
    if (!routeIds.includes(s.routeId) || !s.validFrom || s.validFrom <= today) continue;
    const from = parseDateKey(s.validFrom);
    lines.push(
      line('scheduleChange', {
        day: { kind: 'day', at: from },
        days: { kind: 'weekdays', days: s.days },
        window: {
          kind: 'window',
          start: atManilaTime(from, s.start),
          end: atManilaTime(from, s.windowEnd),
        },
      }),
    );
  }
  if (!lines.length) {
    lines.push(line('noChanges', { barangay: { kind: 'barangay', id: barangayId } }));
    const days = regularDays(facts, barangayId);
    if (days.length) lines.push(line('regularDays', { days: { kind: 'weekdays', days } }));
  }
  return reply(
    'schedule_change',
    lines,
    [action('schedule', '/resident/schedule', 'calendar')],
    ['next', 'sms'],
  );
}

function statusReply(u: Understood, ctx: KolekContext, facts: KolekFacts): KolekReply {
  const mine = facts.myTickets.filter((t) => ctx.myTicketIds.includes(t.id));
  if (u.ticketId) {
    const ticket = mine.find((t) => t.id === u.ticketId);
    if (!ticket) {
      return reply('report_status', [
        line('ticketNotFound', { id: { kind: 'text', value: u.ticketId } }),
      ]);
    }
    return reply(
      'report_status',
      [ticketLine(ticket)],
      [action('openTicket', `/resident/reports/${ticket.id}`, 'file-document')],
      ['report'],
    );
  }
  if (!mine.length) {
    return reply(
      'report_status',
      [line('noReports')],
      [action('report', '/resident/report', 'camera')],
    );
  }
  const latest = [...mine].sort((a, b) => b.createdAt - a.createdAt)[0];
  return reply(
    'report_status',
    [line('reportCount', { count: { kind: 'number', value: mine.length } }), ticketLine(latest)],
    [action('myReports', '/resident/reports', 'file-document-multiple')],
    ['report'],
  );
}

const ticketLine = (t: Ticket) =>
  line('ticketStatus', {
    id: { kind: 'text', value: t.id },
    category: { kind: 'i18n', key: `reports.category.${t.category}` },
    status: { kind: 'i18n', key: `reports.status.${t.status}` },
  });

function fallbackReply(barangayId: string | null, facts: KolekFacts): KolekReply {
  return reply('fallback', [line('fallback'), ...contactLines(barangayId, facts.contacts)]);
}

// ---------- Entry point ----------

/** Answers `question`; `previous` is the intent of Kolek's last answer (for follow-ups). */
export function answerKolek(
  question: string,
  previous: KolekIntent | null,
  ctx: KolekContext,
  facts: KolekFacts,
): KolekReply {
  const u = understand(question, facts.barangays, previous);
  const barangayId = u.barangayId ?? ctx.barangayId;

  switch (u.intent) {
    case 'greeting':
      return reply('greeting', [line('greeting')]);
    case 'thanks':
      return reply('thanks', [line('thanks')]);
    case 'next_collection':
      return barangayId ? nextCollectionReply(u, facts, barangayId) : needBarangay(u.intent);
    case 'truck_location':
      return barangayId ? truckReply(facts, barangayId) : needBarangay(u.intent);
    case 'how_to_report':
      return reportReply(u);
    case 'emergency':
      return emergencyReply(u);
    case 'missed':
      return barangayId ? missedReply(facts, barangayId) : needBarangay(u.intent);
    case 'segregation':
      return sortReply(u);
    case 'stats':
      return statsReply(facts);
    case 'sms_on':
    case 'sms_off':
      return smsReply(u.intent, ctx, facts);
    case 'contacts':
      return reply('contacts', contactLines(barangayId, facts.contacts), [], ['next', 'report']);
    case 'schedule_change':
      return barangayId ? scheduleChangeReply(facts, barangayId) : needBarangay(u.intent);
    case 'report_status':
      return statusReply(u, ctx, facts);
    case 'fees':
      return reply('fees', [line('fees'), ...contactLines(barangayId, facts.contacts)]);
    case 'fallback':
      return fallbackReply(barangayId, facts);
  }
}
