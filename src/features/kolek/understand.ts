/**
 * Ask Kolek, step 1: understand a Taglish question. Spelling variants and English words are
 * mapped to one Filipino form ("kelan"/"when" → kailan, "trak" → truck), then an ordered list
 * of rules picks the intent. Rules, not a model: every answer can be traced to a rule and a
 * test (plan §7). Pure and unit-tested with a 50-question Taglish set.
 */
import type { KolekIntent, ReportCategory, Weekday } from '@/services/types';

import { type SortItem, sortItemIn } from './segregation';

/** Phrases replaced before splitting into words (longest first). */
const PHRASES: [RegExp, string][] = [
  [/\bhow much\b/g, 'gaano'],
  [/\bhow many\b/g, 'ilang'],
  [/\bgarbage truck\b|\btrash truck\b|\bdump truck\b/g, 'truck'],
  [/\bbarangay hall\b|\bbrgy hall\b/g, 'barangayhall'],
  [/\bdi nabubulok\b|\bhindi nabubulok\b|\bnon biodegradable\b/g, 'dinabubulok'],
  [/\bbagong taon\b|\bnew year\b|\bholy week\b|\bsemana santa\b/g, 'holiday'],
  [/\bthank you\b/g, 'salamat'],
  [/\bgood (morning|afternoon|evening)\b|\bmagandang (umaga|hapon|gabi|araw)\b/g, 'hello'],
  [/\bthis week\b|\bngayong linggo\b|\bsa linggong ito\b/g, 'thisweek'],
  [/\bthis month\b|\bngayong buwan\b|\bsa buwang ito\b/g, 'thismonth'],
];

/** Word variants → one form. */
const WORDS: Record<string, string> = {};
const alias = (canonical: string, variants: string[]) => {
  for (const v of variants) WORDS[v] = canonical;
};
alias('kailan', ['kelan', 'kilan', 'kaylan', 'kailn', 'kln', 'klan', 'when']);
alias('truck', ['trak', 'truk', 'trck', 'trock', 'trucks', 'basurero', 'dumptruck']);
alias('nasaan', ['nasan', 'nsan', 'asan', 'nasaan', 'nasn']);
alias('saan', ['where', 'san']);
alias('paano', ['pano', 'panu', 'paanu', 'how']);
alias('basura', ['garbage', 'trash', 'basora', 'waste', 'rubbish', 'basurahan']);
alias('koleksyon', [
  'collection',
  'koleksiyon',
  'kolekta',
  'collect',
  'collected',
  'nakolekta',
  'kinolekta',
  'pickup',
]);
alias('kuha', ['kukunin', 'kinukuha', 'kunin', 'pagkuha', 'kumuha', 'nakuha', 'kinuha']);
alias('iskedyul', ['schedule', 'sched', 'sked', 'skedyul', 'iskedul', 'skejul', 'schedules']);
alias('ngayon', ['ngaun', 'ngayn', 'today', 'now', 'ngayong', 'ngyon']);
alias('bukas', ['bkas', 'tomorrow', 'bukas']);
alias('report', [
  'magreport',
  'ireport',
  'irereport',
  'nireport',
  'mareport',
  'magrereport',
  'reports',
  'reklamo',
  'complain',
  'complaint',
  'isumbong',
]);
alias('text', [
  'itext',
  'txt',
  'texts',
  'sms',
  'message',
  'magtext',
  'itxt',
  'texto',
  'itetext',
  'tetext',
  'notification',
  'notif',
  'abiso',
]);
alias('hindi', ['hnd', 'hinde', 'di', 'd', 'hndi', 'not', 'didnt', 'wasnt', 'never']);
alias('daan', ['dinaanan', 'nadaanan', 'dumaan', 'dadaan', 'dinadaanan', 'pass', 'passed']);
alias('lampas', ['nilampasan', 'lumampas', 'nilagpasan', 'skipped', 'skip', 'missed', 'lagpas']);
alias('darating', ['dumating', 'dating', 'arrive', 'arriving', 'coming', 'parating', 'dadating']);
alias('malapit', ['near', 'nearby', 'close', 'mlapit']);
alias('salamat', ['thanks', 'thank', 'ty', 'tnx', 'thx', 'salamuch', 'slamat', 'tenkyu']);
alias('hello', ['hi', 'hey', 'kumusta', 'kamusta', 'musta', 'helo', 'hallo', 'uy']);
alias('hiwalay', [
  'segregate',
  'segregation',
  'ihiwalay',
  'paghiwalayin',
  'maghiwalay',
  'paghihiwalay',
  'sort',
  'separate',
  'segregated',
]);
alias('nabubulok', ['biodegradable', 'bulok', 'compost', 'compostable', 'nabubulok']);
alias('recycle', ['recyclable', 'recycling', 'irecycle', 'marerecycle', 'mare-recycle']);
alias('tapon', ['nagtapon', 'tinapon', 'itinapon', 'nagtatapon', 'dumping', 'dumped', 'dump']);
alias('ilalagay', ['ilagay', 'lalagay', 'itatapon', 'itapon', 'put', 'throw', 'dispose']);
alias('sunog', [
  'nagsusunog',
  'sinusunog',
  'burning',
  'burn',
  'fire',
  'usok',
  'smoke',
  'nasusunog',
]);
alias('emergency', ['emerhensya', 'emerhensiya', 'urgent', 'emergencia']);
alias('patay', ['dead', 'namatay']);
alias('hayop', ['aso', 'pusa', 'daga', 'manok', 'dog', 'cat', 'rat', 'animal', 'ibon', 'bird']);
alias('kanal', ['estero', 'ilog', 'sapa', 'canal', 'creek', 'river', 'drainage', 'imburnal']);
alias('numero', [
  'number',
  'contact',
  'hotline',
  'tawagan',
  'tatawagan',
  'call',
  'telepono',
  'phone',
  'contacts',
  'kontak',
]);
alias('bayad', [
  'fee',
  'fees',
  'singil',
  'multa',
  'penalty',
  'fine',
  'presyo',
  'price',
  'babayaran',
]);
alias('tonelada', ['tons', 'tonnes', 'ton', 'kilo', 'kilos', 'kg']);
alias('ilang', ['ilan']);
alias('status', ['estado', 'update', 'balita', 'lagay']);
alias('ticket', ['tiket', 'tickets']);
alias('holiday', ['pasko', 'christmas', 'piyesta', 'undas', 'holidays', 'pista']);
alias('pagbabago', [
  'binago',
  'nagbago',
  'changed',
  'change',
  'changes',
  'moved',
  'lipat',
  'inilipat',
  'cancelled',
  'canceled',
  'kanselado',
]);
alias('stop', ['ayoko', 'ayaw', 'tigil', 'itigil', 'unsubscribe', 'patayin', 'off', 'tanggalin']);
alias('barangay', ['brgy', 'bgy', 'brg']);
alias('lunes', ['monday']);
alias('martes', ['tuesday']);
alias('miyerkoles', ['wednesday', 'miyerkules']);
alias('huwebes', ['thursday']);
alias('biyernes', ['friday', 'byernes']);
alias('sabado', ['saturday']);
alias('linggo_day', ['sunday']);

/** Lower-case, no accents or punctuation, one form per word (see WORDS). */
export function normalize(text: string): string {
  let s = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/-/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => WORDS[w] ?? w)
    .join(' ');
}

const has = (s: string, ...words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(s));

// ---------- Entities ----------

export type DayAsked = { kind: 'today' } | { kind: 'tomorrow' } | { kind: 'weekday'; day: Weekday };

const WEEKDAY_WORDS: [string, Weekday][] = [
  ['linggo_day', 0],
  ['lunes', 1],
  ['martes', 2],
  ['miyerkoles', 3],
  ['huwebes', 4],
  ['biyernes', 5],
  ['sabado', 6],
];

export function dayIn(s: string): DayAsked | null {
  if (has(s, 'bukas')) return { kind: 'tomorrow' };
  const wd = WEEKDAY_WORDS.find(([w]) => has(s, w));
  if (wd) return { kind: 'weekday', day: wd[1] };
  if (has(s, 'ngayon') && !has(s, 'thisweek', 'thismonth')) return { kind: 'today' };
  return null;
}

export interface BarangayName {
  id: string;
  name: string;
  altNames: string[];
}

/** A barangay named in the question ("sa Mabuhay", "brgy 3", "Poblacion 8"). */
export function barangayIn(s: string, barangays: BarangayName[]): string | null {
  const candidates = barangays.flatMap((b) =>
    [b.name, ...b.altNames].map((n) => ({ id: b.id, key: normalize(n) })),
  );
  candidates.sort((a, b) => b.key.length - a.key.length);
  const hit = candidates.find((c) => new RegExp(`(^| )${c.key}( |$)`).test(s));
  return hit?.id ?? null;
}

/** "KPH-2026-000113" (spaces or no dashes are fine). */
export function ticketIdIn(text: string): string | null {
  const m = /kph[\s-]*(\d{4})[\s-]*(\d{1,6})/i.exec(text);
  return m ? `KPH-${m[1]}-${m[2].padStart(6, '0')}` : null;
}

/** The report category a question describes, if any. */
export function categoryIn(s: string): ReportCategory | null {
  if (has(s, 'sunog')) return 'BURNING';
  if (
    has(
      s,
      'kemikal',
      'chemical',
      'syringe',
      'karayom',
      'needle',
      'tumagas',
      'toxic',
      'hazardous',
    ) ||
    has(s, 'delikado', 'delikadong', 'mapanganib')
  ) {
    return 'HAZARD';
  }
  if (has(s, 'natumba', 'nabuwal', 'bumagsak', 'sanga', 'debris', 'gumuho', 'landslide', 'bagyo')) {
    return 'DEBRIS';
  }
  if (has(s, 'patay') && has(s, 'hayop')) return 'ANIMAL';
  if (has(s, 'kanal')) return 'WATERWAY';
  if (has(s, 'overflow', 'overflowing', 'umaapaw', 'apaw') || /\bpuno\b.*\bbasura\b/.test(s)) {
    return 'OVERFLOW';
  }
  if (has(s, 'sofa', 'kutson', 'mattress', 'furniture', 'aparador', 'ref', 'refrigerator')) {
    return 'BULKY';
  }
  if (has(s, 'handaan', 'party', 'event', 'okasyon', 'binyag', 'kasal')) return 'EVENT';
  if (has(s, 'tapon', 'tambak', 'nakatambak', 'lote', 'bakante', 'bakanteng', 'illegal')) {
    return 'DUMPING';
  }
  return null;
}

const EMERGENCY = new Set<ReportCategory>(['BURNING', 'HAZARD', 'DEBRIS']);

// ---------- Intent ----------

export interface Understood {
  intent: KolekIntent;
  normalized: string;
  barangayId: string | null;
  day: DayAsked | null;
  category: ReportCategory | null;
  item: SortItem | null;
  ticketId: string | null;
  /** The period a statistics question asks about. */
  period: 'week' | 'month';
}

/**
 * Picks the intent with ordered rules (first match wins). Order matters: specific requests
 * ("stop sms", "hindi nadaanan") come before broad ones ("truck", "kailan").
 */
export function understand(
  text: string,
  barangays: BarangayName[],
  previous: KolekIntent | null = null,
): Understood {
  const s = normalize(text);
  const ticketId = ticketIdIn(text);
  const category = categoryIn(s);
  const item = sortItemIn(s);
  const barangayId = barangayIn(s, barangays);
  const day = dayIn(s);
  const period = has(s, 'thismonth', 'buwan', 'month', 'buwanan') ? 'month' : 'week';
  const base = { normalized: s, barangayId, day, category, item, ticketId, period } as const;
  const truck = has(s, 'truck');
  const put = has(s, 'ilalagay', 'saan') && item != null;

  const rules: [KolekIntent, boolean][] = [
    ['report_status', ticketId != null || (has(s, 'status') && has(s, 'report', 'ticket'))],
    ['emergency', has(s, 'emergency') || (category != null && EMERGENCY.has(category) && !put)],
    [
      'missed',
      has(s, 'lampas') ||
        (has(s, 'hindi') && has(s, 'daan', 'kuha', 'dumating', 'darating') && !has(s, 'ba')) ||
        (has(s, 'hindi') && has(s, 'daan') && has(s, 'kalye', 'street', 'kami', 'namin')),
    ],
    ['sms_off', has(s, 'text') && has(s, 'stop')],
    ['sms_on', has(s, 'text')],
    ['fees', has(s, 'bayad', 'magkano')],
    [
      'stats',
      has(s, 'tonelada', 'statistics', 'stats', 'istatistika') ||
        (has(s, 'ilang', 'gaano') && has(s, 'basura', 'koleksyon', 'truck', 'biyahe', 'trips')),
    ],
    ['schedule_change', has(s, 'holiday') || (has(s, 'pagbabago') && !has(s, 'report'))],
    ['contacts', has(s, 'numero', 'barangayhall', 'opisina', 'office', 'enro', 'tanggapan')],
    ['truck_location', truck && has(s, 'nasaan', 'saan', 'malapit', 'darating', 'daan', 'nasa')],
    ['how_to_report', has(s, 'report') || category != null],
    ['segregation', has(s, 'hiwalay', 'nabubulok', 'dinabubulok', 'recycle') || item != null],
    [
      'next_collection',
      has(s, 'kailan', 'iskedyul', 'koleksyon', 'kuha') ||
        (has(s, 'araw', 'oras', 'day', 'time') && has(s, 'basura', 'truck')) ||
        (day != null && has(s, 'basura', 'truck')),
    ],
    ['truck_location', truck],
    ['greeting', has(s, 'hello', 'kolek')],
    ['thanks', has(s, 'salamat', 'ok', 'okay', 'sige')],
  ];
  const hit = rules.find(([, when]) => when);
  if (hit) return { ...base, intent: hit[0] };

  // A follow-up that only names a place or a day ("e sa Mabuhay?", "bukas?") keeps the topic.
  const followUps: KolekIntent[] = [
    'next_collection',
    'truck_location',
    'schedule_change',
    'contacts',
  ];
  if ((barangayId || day) && previous && followUps.includes(previous)) {
    return { ...base, intent: previous };
  }
  return { ...base, intent: 'fallback' };
}
