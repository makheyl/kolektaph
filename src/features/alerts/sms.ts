/**
 * SMS length rules. Messages in the GSM-7 alphabet fit 160 characters in one SMS (153 per part
 * when split); any other character (emoji, curly quotes…) switches the whole message to UCS-2,
 * which fits only 70 (67 per part). Keeping alerts to one GSM-7 segment keeps them cheapest.
 */
import { manilaParts } from '@/lib/time';

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
/** Extension table characters cost two septets each. */
const GSM7_EXTENDED = '^{}\\[~]|€\f';

const basic = new Set(GSM7_BASIC);
const extended = new Set(GSM7_EXTENDED);

export interface SmsInfo {
  encoding: 'GSM-7' | 'UCS-2';
  /** Length in encoding units (septets for GSM-7, UTF-16 code units for UCS-2). */
  units: number;
  segments: number;
  /** Units left before another segment is needed. */
  remaining: number;
}

export function smsInfo(text: string): SmsInfo {
  let septets = 0;
  let gsm = true;
  for (const ch of text) {
    if (basic.has(ch)) septets += 1;
    else if (extended.has(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    const segments = septets <= 160 ? 1 : Math.ceil(septets / 153);
    const capacity = segments === 1 ? 160 : segments * 153;
    return {
      encoding: 'GSM-7',
      units: septets,
      segments: Math.max(1, segments),
      remaining: capacity - septets,
    };
  }
  const units = text.length;
  const segments = units <= 70 ? 1 : Math.ceil(units / 67);
  const capacity = segments === 1 ? 70 : segments * 67;
  return { encoding: 'UCS-2', units, segments, remaining: capacity - units };
}

/** "7AM", "7:30AM", "12PM" */
function shortTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute ? `${h12}:${String(minute).padStart(2, '0')}` : `${h12}`;
}

/** Compact time range for SMS, like the pitch: "7-10AM", "11AM-1PM", "7:30-10AM". */
export function smsTimeRange(startMs: number, endMs: number): string {
  const s = manilaParts(startMs);
  const e = manilaParts(endMs);
  const sm = s.hour < 12 ? 'AM' : 'PM';
  const em = e.hour < 12 ? 'AM' : 'PM';
  return sm === em
    ? `${shortTime(s.hour, s.minute)}-${shortTime(e.hour, e.minute)}${em}`
    : `${shortTime(s.hour, s.minute)}${sm}-${shortTime(e.hour, e.minute)}${em}`;
}
