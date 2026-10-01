/**
 * Builds every app icon from one drawing: a garbage truck in the KolektaPH colours (navy, green,
 * yellow). Neutral branding on purpose: no city seal or logos (pitch guide §5).
 *
 *   node scripts/brand/build-icons.mjs
 *
 * Needs `rsvg-convert` (macOS: `brew install librsvg`). Writes the PWA icons to public/ and the
 * native icons to assets/images/.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NAVY = '#15314B';
const GREEN = '#157347';
const GREEN_LIGHT = '#1E8C57';
const YELLOW = '#F2B600';
const WHITE = '#FFFFFF';

/** The truck, drawn on a 512 × 512 canvas around (262, 270). */
function truck({ mono = false } = {}) {
  const body = mono ? WHITE : GREEN;
  const rib = mono ? 'none' : GREEN_LIGHT;
  const wheel = mono ? WHITE : YELLOW;
  const hub = mono ? 'none' : NAVY;
  return `
    <rect x="72" y="150" width="232" height="180" rx="18" fill="${body}"/>
    ${[128, 184, 240].map((x) => `<rect x="${x}" y="176" width="12" height="128" rx="6" fill="${rib}"/>`).join('')}
    <path d="M300 200 H392 Q404 200 412 210 L446 256 Q452 264 452 274 V330 H300 Z" fill="${WHITE}"/>
    ${mono ? '' : `<path d="M322 222 H386 L414 262 H322 Z" fill="${NAVY}"/>`}
    <rect x="72" y="318" width="380" height="22" rx="8" fill="${WHITE}"/>
    <circle cx="150" cy="352" r="40" fill="${wheel}"/>
    <circle cx="380" cy="352" r="40" fill="${wheel}"/>
    <circle cx="150" cy="352" r="16" fill="${hub}"/>
    <circle cx="380" cy="352" r="16" fill="${hub}"/>`;
}

/** An SVG with an optional background and the truck scaled about the canvas centre. */
function svg({ background, scale, mono = false }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${background ? `<rect width="512" height="512" fill="${background}"/>` : ''}
  <g transform="translate(256 256) scale(${scale}) translate(-262 -270)">${truck({ mono })}</g>
</svg>`;
}

const dir = mkdtempSync(join(tmpdir(), 'kph-icons-'));
function render(name, spec, size, out) {
  const file = join(dir, `${name}.svg`);
  writeFileSync(file, svg(spec));
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', out, file]);
  console.log(`${out} (${size}px)`);
}

const full = { background: NAVY, scale: 1 };
// Maskable icons are cropped to a circle of 80% of the width: keep the truck inside it.
const maskable = { background: NAVY, scale: 0.8 };
// Android adaptive icons show about the middle 61%; the background colour is set in app.json.
const adaptive = { scale: 0.62 };

render('icon', full, 1024, 'assets/images/icon.png');
render('favicon', full, 48, 'assets/images/favicon.png');
render('splash', { scale: 1 }, 512, 'assets/images/splash-icon.png');
render('adaptive', adaptive, 1024, 'assets/images/android-icon-foreground.png');
render('mono', { ...adaptive, mono: true }, 1024, 'assets/images/android-icon-monochrome.png');
render('logo192', full, 192, 'public/logo192.png');
render('logo512', full, 512, 'public/logo512.png');
render('maskable512', maskable, 512, 'public/maskable512.png');
render('apple', full, 180, 'public/apple-touch-icon.png');
