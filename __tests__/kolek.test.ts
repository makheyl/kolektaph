import {
  BARANGAYS,
  ROUTE_SCHEDULES,
  ROUTES,
  SCHEDULE_EXCEPTIONS,
  TRUCK_CAPACITY_TONNES,
  TRUCKS,
} from '@/data/carmona';
import { sampleTickets } from '@/data/carmona/sampleTickets';
import {
  answerKolek,
  DEFAULT_CHIPS,
  EMERGENCY_HOTLINE,
  type KolekFacts,
} from '@/features/kolek/answer';
import { renderLine } from '@/features/kolek/render';
import { SEGREGATION_LAW } from '@/features/kolek/segregation';
import { barangayIn, normalize, ticketIdIn, understand } from '@/features/kolek/understand';
import { CATEGORY_META } from '@/features/reports/categories';
import { homeStatus } from '@/features/resident/homeStatus';
import { statusText } from '@/features/resident/statusText';
import {
  collectionsForBarangay,
  LOOKAHEAD_DAYS,
  nextCollectionAfterToday,
  todaysCollection,
} from '@/features/schedule/collections';
import { weeklyStats } from '@/features/stats/weekly';
import i18n, { resources } from '@/i18n';
import { DAY, manilaEpoch, manilaStartOfDay } from '@/lib/time';
import type { KolekContext, KolekIntent, KolekValue } from '@/services/types';
import { simulateFleet } from '@/simulator/truckSimulator';

/** Tuesday 29 Sep 2026, 7:28 AM: Milagrosa's collection day, truck on its way. */
const NOW = manilaEpoch(2026, 9, 29, 7, 28);
const NAMES = BARANGAYS.features.map(({ properties: p }) => ({
  id: p.id,
  name: p.name,
  altNames: p.altNames,
}));
const nameOf = (id: string) => NAMES.find((b) => b.id === id)?.name ?? '';

const tickets = sampleTickets(NOW);
const CTX: KolekContext = {
  barangayId: 'milagrosa',
  smsOn: false,
  myTicketIds: tickets.slice(0, 2).map((t) => t.id),
};

function facts(now = NOW): KolekFacts {
  return {
    now,
    barangays: NAMES,
    schedules: ROUTE_SCHEDULES,
    routes: ROUTES,
    exceptions: SCHEDULE_EXCEPTIONS,
    states: simulateFleet(TRUCKS, ROUTE_SCHEDULES, ROUTES, now, SCHEDULE_EXCEPTIONS, []),
    leadMinutes: 15,
    weekly: weeklyStats(
      {
        trucks: TRUCKS,
        schedules: ROUTE_SCHEDULES,
        routes: ROUTES,
        exceptions: SCHEDULE_EXCEPTIONS,
        events: [],
        capacityTonnes: TRUCK_CAPACITY_TONNES,
      },
      now,
    ),
    contacts: {
      enro: { phone: null, hours: null },
      barangays: { milagrosa: { phone: '(046) 555 0100', hours: 'Lunes–Biyernes' } },
    },
    myTickets: tickets.filter((t) => CTX.myTicketIds.includes(t.id)),
  };
}

const F = facts();
const ask = (q: string, previous: KolekIntent | null = null, ctx = CTX, f = F) =>
  answerKolek(q, previous, ctx, f);

/**
 * 50 questions residents might type, in Filipino, English and Taglish, with text-speak and
 * typos. Written as a routing target for plan §9 S6 (≥ 85% to the right intent).
 */
const TEST_SET: [string, KolekIntent][] = [
  ['Kailan po ang kuha ng basura dito?', 'next_collection'],
  ['Anong araw ang collection sa Mabuhay?', 'next_collection'],
  ['may koleksyon ba bukas?', 'next_collection'],
  ['When is the next garbage collection?', 'next_collection'],
  ['sched ng basura sa brgy 3', 'next_collection'],
  ['may kuha ba ng basura ngayon?', 'next_collection'],
  ['anong oras kinukuha ang basura sa lantic', 'next_collection'],
  ['Nasaan na ang truck?', 'truck_location'],
  ['nsan n po ung trak', 'truck_location'],
  ['Malapit na ba ang garbage truck?', 'truck_location'],
  ['where is the garbage truck now', 'truck_location'],
  ['kailan darating ang truck?', 'truck_location'],
  ['dadaan pa ba ang truck ngayon?', 'truck_location'],
  ['Paano mag-report ng tambak na basura?', 'how_to_report'],
  ['may nagtapon ng basura sa bakanteng lote, saan ko ito irereport', 'how_to_report'],
  ['how do i report illegal dumping', 'how_to_report'],
  ['puno na yung basurahan sa kanto, pano ireport', 'how_to_report'],
  ['may basura sa kanal namin', 'how_to_report'],
  ['may patay na aso sa kalsada', 'how_to_report'],
  ['may nagsusunog ng basura sa tabi namin', 'emergency'],
  ['emergency! may tumagas na kemikal', 'emergency'],
  ['natumba ang puno at humarang sa daan, emergency pickup', 'emergency'],
  ['delikadong basura, may syringe at karayom', 'emergency'],
  ['Hindi dinaanan ang kalye namin', 'missed'],
  ['di po kami nadaanan ng truck kanina', 'missed'],
  ['the truck skipped our street', 'missed'],
  ['nilampasan kami ng trak', 'missed'],
  ['Paano maghiwalay ng basura?', 'segregation'],
  ['saan ilalagay ang baterya?', 'segregation'],
  ['nabubulok ba ang balat ng saging', 'segregation'],
  ['how do I segregate my trash', 'segregation'],
  ['anong gagawin sa diaper', 'segregation'],
  ['Ilang tonelada ang nakolekta ngayong linggo?', 'stats'],
  ['how much garbage was collected this week', 'stats'],
  ['Paano ako makakatanggap ng text alert?', 'sms_on'],
  ['i-text nyo ako pag malapit na ang truck', 'sms_on'],
  ['gusto ko ng SMS notification', 'sms_on'],
  ['ayoko na ng text', 'sms_off'],
  ['stop sms', 'sms_off'],
  ['ano ang number ng barangay hall?', 'contacts'],
  ['sino ang pwede kong tawagan sa ENRO', 'contacts'],
  ['may koleksyon ba sa pasko?', 'schedule_change'],
  ['may pagbabago ba sa schedule dahil sa holiday?', 'schedule_change'],
  ['ano na ang status ng report ko?', 'report_status'],
  ['nasaan na yung ticket KPH-2026-000113', 'report_status'],
  ['magkano ang bayad sa basura?', 'fees'],
  ['hello kolek', 'greeting'],
  ['salamat po', 'thanks'],
  ['sino ang mayor ng carmona?', 'fallback'],
  ['anong oras magsasara ang munisipyo?', 'fallback'],
];

const CHIP_INTENTS: Record<string, KolekIntent> = {
  next: 'next_collection',
  truck: 'truck_location',
  report: 'how_to_report',
  sort: 'segregation',
  missed: 'missed',
  sms: 'sms_on',
  contacts: 'contacts',
  holiday: 'schedule_change',
  status: 'report_status',
  emergency: 'emergency',
};

describe('Kolek: understanding Taglish', () => {
  it('normalises spelling variants and English words', () => {
    expect(normalize('Kelan dadating ang TRAK?')).toBe('kailan darating ang truck');
    expect(normalize('i-text nyo ako')).toBe('text nyo ako');
    expect(normalize('Where is the garbage truck?')).toBe('saan is the truck');
  });

  it('finds barangays by name, number and Poblacion name', () => {
    expect(barangayIn(normalize('sa brgy 1 po'), NAMES)).toBe('brgy-1');
    expect(barangayIn(normalize('barangay 14'), NAMES)).toBe('bancal');
    expect(barangayIn(normalize('Poblacion 8'), NAMES)).toBe('brgy-8');
    expect(barangayIn(normalize('sa Cabilang Baybay'), NAMES)).toBe('cabilang-baybay');
    expect(barangayIn(normalize('nasaan ang truck'), NAMES)).toBeNull();
  });

  it('routes at least 85% of the 50-question Taglish set to the right intent', () => {
    expect(TEST_SET).toHaveLength(50);
    const misses = TEST_SET.filter(([q, want]) => understand(q, NAMES).intent !== want);
    const score = (TEST_SET.length - misses.length) / TEST_SET.length;
    if (misses.length) {
      console.log(
        'Kolek misses:',
        misses.map(([q, want]) => `${q} → ${understand(q, NAMES).intent} (want ${want})`),
      );
    }
    expect(score).toBeGreaterThanOrEqual(0.85);
  });

  it('routes every suggestion chip, in both languages, to its topic', () => {
    for (const lang of ['fil', 'en'] as const) {
      const chips = resources[lang].translation.kolek.chips as Record<string, string>;
      for (const [id, intent] of Object.entries(CHIP_INTENTS)) {
        expect([lang, id, understand(chips[id], NAMES).intent]).toEqual([lang, id, intent]);
      }
    }
    expect(DEFAULT_CHIPS.every((id) => id in CHIP_INTENTS)).toBe(true);
  });

  it('keeps the topic for a follow-up that only names a place or a day', () => {
    const r = ask('e sa Mabuhay?', 'next_collection');
    expect(r.intent).toBe('next_collection');
    expect(r.lines[0].values?.barangay).toEqual({ kind: 'barangay', id: 'mabuhay' });
    expect(ask('e sa Mabuhay?').intent).toBe('fallback');
  });
});

describe('Kolek: answers come from data', () => {
  const occ = (b: string) =>
    collectionsForBarangay(b, ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS, NOW, 14);

  it('gives the same collection window as the schedule', () => {
    const r = ask('Kailan ang susunod na koleksyon?');
    const today = todaysCollection(occ('milagrosa'), NOW)!;
    expect(r.lines[0]).toMatchObject({
      key: 'kolek.a.nextCollection',
      values: { window: { kind: 'window', start: today.start, end: today.end } },
    });
  });

  it('says when there is no collection on the day asked, and gives the next one', () => {
    const r = ask('may koleksyon ba bukas?');
    expect(r.lines[0].key).toBe('kolek.a.noCollectionOn');
    const next = nextCollectionAfterToday(occ('milagrosa'), NOW)!;
    expect(r.lines[1].values?.day).toEqual({ kind: 'day', at: next.start });
  });

  it('answers "nasaan ang truck" with exactly the Home status lines', () => {
    const o = occ('milagrosa');
    const today = todaysCollection(o, NOW)!;
    const status = homeStatus({
      barangayId: 'milagrosa',
      now: NOW,
      today,
      nextAfterToday: nextCollectionAfterToday(o, NOW),
      truck: F.states.find((s) => s.truckId === today.truckId),
      route: ROUTES.find((r) => r.id === today.routeId),
    });
    if (status.kind === 'no_barangay') throw new Error('unexpected');
    const text = statusText(status, 'milagrosa');
    expect(ask('Nasaan na ang truck?').lines.slice(0, 1 + text.lines.length)).toEqual([
      text.title,
      ...text.lines,
    ]);
  });

  it('lists the Christmas move from the holiday data', () => {
    const r = ask('may koleksyon ba sa pasko?');
    const line = r.lines.find((l) => l.key === 'kolek.a.holidayMoved');
    expect(line?.values?.reason).toEqual({ kind: 'localized', fil: 'Pasko', en: 'Christmas Day' });
    expect(line?.values?.to).toEqual({ kind: 'day', at: manilaEpoch(2026, 12, 26) });
  });

  it('never quotes a fee; it points to the barangay and the City ENRO', () => {
    const r = ask('magkano ang bayad sa basura?');
    expect(r.lines.map((l) => l.key)).toEqual([
      'kolek.a.fees',
      'kolek.a.contactBarangay',
      'kolek.a.contactHours',
      'kolek.a.contactEnroNoPhone',
    ]);
  });

  it('only shows the resident their own reports', () => {
    const notMine = tickets[5].id;
    expect(ask(`status ng ${notMine}`).lines[0].key).toBe('kolek.a.ticketNotFound');
    const mine = ask(`status ng ${tickets[0].id}`);
    expect(mine.lines[0].key).toBe('kolek.a.ticketStatus');
    expect(mine.actions[0].href).toBe(`/resident/reports/${tickets[0].id}`);
  });

  it('asks for a barangay instead of guessing', () => {
    const r = ask('Kailan ang koleksyon?', null, { ...CTX, barangayId: null });
    expect(r.lines[0].key).toBe('kolek.a.needBarangay');
  });

  it('links to the report wizard with the category filled in', () => {
    expect(ask('may basura sa kanal namin').actions[0].href).toBe(
      '/resident/report?category=WATERWAY',
    );
    expect(ask('may nagsusunog ng basura').actions[0].href).toBe(
      '/resident/report?category=BURNING',
    );
  });
});

describe('Kolek: no invented facts', () => {
  const digitsOrMoney = /[0-9₱]|\bpiso\b|\bpeso/i;
  const collect = (node: unknown, out: string[] = []): string[] => {
    if (typeof node === 'string') out.push(node);
    else if (node && typeof node === 'object') Object.values(node).forEach((v) => collect(v, out));
    return out;
  };

  it('answer texts contain no numbers or prices of their own', () => {
    for (const lang of ['fil', 'en'] as const) {
      const tr = resources[lang].translation;
      const texts = [...collect(tr.kolek), ...collect(tr.resident.home.status)];
      expect(texts.filter((s) => digitsOrMoney.test(s.replace(/\{\{[^}]+\}\}/g, '')))).toEqual([]);
    }
  });

  it('every fact in every answer to the test set comes from the data', () => {
    // Everything Kolek may state, computed independently from the sample data.
    const times = new Set<number>();
    const days = new Set<number>();
    for (let d = 0; d <= 100; d++) days.add(manilaStartOfDay(NOW) + d * DAY);
    for (const b of NAMES) {
      for (const o of collectionsForBarangay(
        b.id,
        ROUTE_SCHEDULES,
        ROUTES,
        SCHEDULE_EXCEPTIONS,
        NOW,
        100,
      )) {
        times.add(o.start).add(o.end);
      }
    }
    // Every time the Home status can show, for every barangay (ETAs, departures, passes).
    for (const b of NAMES) {
      const o = collectionsForBarangay(b.id, ROUTE_SCHEDULES, ROUTES, SCHEDULE_EXCEPTIONS, NOW, 14);
      const today = todaysCollection(o, NOW);
      const status = homeStatus({
        barangayId: b.id,
        now: NOW,
        today,
        nextAfterToday: nextCollectionAfterToday(o, NOW),
        truck: F.states.find((s) => s.truckId === today?.truckId),
        route: ROUTES.find((r) => r.id === today?.routeId),
      });
      for (const [k, v] of Object.entries(status)) {
        if (typeof v === 'number' && k !== 'minutes') times.add(v);
      }
    }
    const numbers = new Set<number>([
      F.weekly!.tonnes,
      F.weekly!.trips,
      F.leadMinutes,
      F.myTickets.length,
      Math.round(LOOKAHEAD_DAYS / 7),
      ...Object.values(CATEGORY_META).flatMap((m) =>
        m.target.kind === 'hours' ? [m.target.hours] : [],
      ),
    ]);
    const texts = new Set<string>([
      EMERGENCY_HOTLINE,
      SEGREGATION_LAW,
      '(046) 555 0100',
      'Lunes–Biyernes',
      ...tickets.map((t) => t.id),
      ...F.states.flatMap((s) => (s.streetName ? [s.streetName] : [])),
    ]);

    const check = (question: string, value: KolekValue) => {
      const where = `${question} → ${JSON.stringify(value)}`;
      switch (value.kind) {
        case 'time':
          expect([where, times.has(value.at)]).toEqual([where, true]);
          break;
        case 'window':
          expect([where, times.has(value.start) && times.has(value.end)]).toEqual([where, true]);
          break;
        case 'day':
          expect([where, days.has(manilaStartOfDay(value.at))]).toEqual([where, true]);
          break;
        case 'number':
          expect([where, numbers.has(value.value)]).toEqual([where, true]);
          break;
        case 'percent':
          expect([where, value.value]).toEqual([where, F.weekly!.servedRate]);
          break;
        case 'text':
          expect([
            where,
            texts.has(value.value) ||
              value.value === ticketIdIn(question) ||
              normalize(question).includes(value.value),
          ]).toEqual([where, true]);
          break;
        default:
          break;
      }
    };

    for (const [q] of TEST_SET) {
      const reply = ask(q);
      for (const line of reply.lines) {
        for (const v of Object.values(line.values ?? {})) check(q, v);
      }
    }
  });

  it('renders every answer in both languages without missing text', async () => {
    for (const lang of ['fil', 'en'] as const) {
      await i18n.changeLanguage(lang);
      for (const [q] of TEST_SET) {
        for (const line of ask(q).lines) {
          const text = renderLine(line, { t: i18n.t, now: NOW, language: lang, nameOf });
          expect([q, text.includes('{{') || text.startsWith('kolek.')]).toEqual([q, false]);
        }
      }
    }
    await i18n.changeLanguage('fil');
  });
});
