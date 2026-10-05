/**
 * Identifiers made on the device. They are references, not secrets: a report's reference lets
 * the server recognise a retry, and a photo's name is unique inside the device's own folder.
 */

const HEX = '0123456789abcdef';

const format = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

/** A random version-4 UUID (from the platform's generator when there is one). */
export function randomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  let hex = '';
  for (let i = 0; i < 32; i++) hex += HEX[Math.floor(Math.random() * 16)];
  // Version 4, variant 1.
  hex = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${HEX[8 + (parseInt(hex[16], 16) % 4)]}${hex.slice(17)}`;
  return format(hex);
}

/** 32-bit FNV-1a of `text`, started from `seed`. */
function fnv1a(text: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The same UUID-shaped name for the same text, every time. Used for a photo's file name, so
 * sending a report again uploads to the same name instead of leaving a second copy.
 */
export function uuidFromText(text: string): string {
  let hex = '';
  for (const seed of [0x1f, 0x3d, 0x5b, 0x79])
    hex += fnv1a(text, seed).toString(16).padStart(8, '0');
  return format(hex);
}
