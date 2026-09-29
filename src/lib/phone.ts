/**
 * Philippine mobile numbers: accepts "0917 123 4567", "09171234567", "+63 917 123 4567" or
 * "639171234567" and normalises to E.164 "+639171234567". Returns null when invalid.
 */
export function normalizePhMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  const m = /^(?:\+?63|0)?(9\d{9})$/.exec(digits);
  return m ? `+63${m[1]}` : null;
}

/** "+639171234567" → "0917 ••• 4567", shown back to the resident without exposing it in full. */
export function maskPhMobile(e164: string): string {
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 4)} ••• ${local.slice(-4)}`;
}
