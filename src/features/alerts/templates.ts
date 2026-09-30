import type { IncidentKind } from '@/services/types';

/**
 * SMS texts, in Filipino like the pitch samples (the language residents asked for). Every
 * template is tested to fit one GSM-7 segment (160 characters) with the longest barangay name.
 */

/** "Brgy. Milagrosa", and "Brgy. 1" for Poblacion's "Barangay 1". */
export const brgyLong = (name: string) =>
  name.startsWith('Barangay ') ? `Brgy. ${name.slice('Barangay '.length)}` : `Brgy. ${name}`;

/** "Milagrosa" (as in the pitch sample), and "Brgy. 1" for Poblacion. */
export const brgyShort = (name: string) => (name.startsWith('Barangay ') ? brgyLong(name) : name);

/** Incident names in the delay SMS ("dahil sa ..."). */
export const INCIDENT_FIL: Record<IncidentKind, string> = {
  breakdown: 'sira',
  flat_tire: 'flat na gulong',
  flood: 'baha',
  road_blocked: 'saradong daan',
};

export const sms = {
  nightBefore: (p: { weekday: string; range: string; barangay: string }) =>
    `KolektaPH: Paalala! Bukas, ${p.weekday}, ${p.range} ang koleksyon ng basura sa ${brgyLong(p.barangay)}. Ihiwalay po ang nabubulok at di-nabubulok.`,

  nightBeforeMoved: (p: { weekday: string; range: string; barangay: string; reason: string }) =>
    `KolektaPH: Paalala! Bukas, ${p.weekday}, ${p.range} ang koleksyon sa ${brgyLong(p.barangay)} (inilipat dahil sa ${p.reason}). Ihiwalay po ang basura.`,

  vicinity: (p: { barangay: string; minutes: number; eta: string }) =>
    `KolektaPH: ${brgyShort(p.barangay)}, ${p.minutes} min na lang bago dumating ang garbage truck (~${p.eta}). Ilabas na po ang basura. Salamat!`,

  vicinityNow: (p: { barangay: string }) =>
    `KolektaPH: ${brgyShort(p.barangay)}, nandiyan na ang garbage truck. Ilabas na po ang basura ngayon. Salamat!`,

  delayIncident: (p: { barangay: string; incident: IncidentKind; time: string }) =>
    `KolektaPH: Naantala ang truck para sa ${brgyLong(p.barangay)} dahil sa ${INCIDENT_FIL[p.incident]}. Bagong tantiyang oras: ${p.time}. Paumanhin po.`,

  delayFull: (p: { barangay: string }) =>
    `KolektaPH: Naantala ang koleksyon sa ${brgyLong(p.barangay)}: puno na ang truck. Magpapadala ng ibang truck. Huwag munang ilabas ang basura.`,

  scheduleChange: (p: { barangay: string; from: string; days: string; range: string }) =>
    `KolektaPH: Bagong iskedyul ng koleksyon sa ${brgyLong(p.barangay)} simula ${p.from}: tuwing ${p.days}, ${p.range}. Salamat po!`,

  welcome: (p: { barangay: string }) =>
    `KolektaPH: Salamat! Ite-text ka namin tungkol sa koleksyon ng basura sa ${brgyLong(p.barangay)}. I-reply ang STOP para itigil.`,
};

/** SMS always go out in Filipino (pitch); weekday names for the reminders. */
export const WEEKDAYS_FIL = [
  'Linggo',
  'Lunes',
  'Martes',
  'Miyerkoles',
  'Huwebes',
  'Biyernes',
  'Sabado',
];

const WEEKDAYS_FIL_SHORT = ['Lin', 'Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab'];
const MONTHS_FIL_SHORT = [
  'Ene',
  'Peb',
  'Mar',
  'Abr',
  'May',
  'Hun',
  'Hul',
  'Ago',
  'Set',
  'Okt',
  'Nob',
  'Dis',
];

/** "Martes at Biyernes"; "Lun, Miy at Biy" for three or more; "araw-araw" for every day. */
export function smsDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return 'araw-araw';
  const names = sorted.map((d) => (sorted.length > 2 ? WEEKDAYS_FIL_SHORT : WEEKDAYS_FIL)[d]);
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} at ${names[names.length - 1]}`
    : names[0];
}

/** "Okt 12" (month and day, Filipino). */
export const smsDate = (month: number, day: number) => `${MONTHS_FIL_SHORT[month - 1]} ${day}`;
