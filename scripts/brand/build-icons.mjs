/**
 * Builds every brand picture from the originals in assets/brand/source/ (the logo and Kolek
 * from the Figma file, 2000 px with empty space around them):
 *
 * - the app icons, from the truck on the brand mint. The Android themed (monochrome) icon is a
 *   plain drawn truck instead, because a themed icon has to be a single-colour silhouette;
 * - the small pictures the app itself shows (assets/brand/*.webp), cut to their contents.
 *
 *   node scripts/brand/build-icons.mjs
 *
 * Needs `rsvg-convert` and `cwebp` (macOS: `brew install librsvg webp`). Writes the PWA icons
 * to public/, the native icons to assets/images/ and the app pictures to assets/brand/.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MINT = '#CBFFDA';
const WHITE = '#FFFFFF';

/** The logo file is 2000 × 2000 with empty space around the truck: where the truck is. */
const SOURCE = { size: 2000, box: { x: 0, y: 359, width: 1966, height: 1478 } };
const logo = readFileSync('assets/brand/source/logo-mark.png').toString('base64');

/** The logo mark, `scale` of the canvas wide and centred on a 512 × 512 canvas. */
function mark(scale) {
  const k = (scale * 512) / SOURCE.box.width;
  const cx = SOURCE.box.x + SOURCE.box.width / 2;
  const cy = SOURCE.box.y + SOURCE.box.height / 2;
  const side = SOURCE.size * k;
  return `<image href="data:image/png;base64,${logo}" x="${256 - cx * k}" y="${256 - cy * k}" width="${side}" height="${side}"/>`;
}

/** A plain truck for the themed icon, drawn on a 512 × 512 canvas around (262, 270). */
function monoTruck(scale) {
  return `<g transform="translate(256 256) scale(${scale}) translate(-262 -270)" fill="${WHITE}">
    <rect x="72" y="150" width="232" height="180" rx="18"/>
    <path d="M300 200 H392 Q404 200 412 210 L446 256 Q452 264 452 274 V330 H300 Z"/>
    <rect x="72" y="318" width="380" height="22" rx="8"/>
    <circle cx="150" cy="352" r="40"/>
    <circle cx="380" cy="352" r="40"/>
  </g>`;
}

function svg({ background, scale, mono = false }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${background ? `<rect width="512" height="512" fill="${background}"/>` : ''}
  ${mono ? monoTruck(scale) : mark(scale)}
</svg>`;
}

const dir = mkdtempSync(join(tmpdir(), 'kph-icons-'));
function render(name, spec, size, out) {
  const file = join(dir, `${name}.svg`);
  writeFileSync(file, svg(spec));
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', out, file]);
  console.log(`${out} (${size}px)`);
}

const full = { background: MINT, scale: 0.74 };
// Maskable icons are cropped to a circle of 80% of the width: keep the truck inside it.
const maskable = { background: MINT, scale: 0.58 };
// Android adaptive icons show about the middle 61%; the background colour is set in app.json.
const adaptive = { scale: 0.5 };
// The Android 12+ splash shows the image inside a circle two thirds of its width.
const splash = { scale: 0.56 };

render('icon', full, 1024, 'assets/images/icon.png');
render('favicon', { background: MINT, scale: 0.86 }, 48, 'assets/images/favicon.png');
render('splash', splash, 1024, 'assets/images/splash-icon.png');
render('adaptive', adaptive, 1024, 'assets/images/android-icon-foreground.png');
render('mono', { scale: 0.62, mono: true }, 1024, 'assets/images/android-icon-monochrome.png');
render('logo192', full, 192, 'public/logo192.png');
render('logo512', full, 512, 'public/logo512.png');
render('maskable512', maskable, 512, 'public/maskable512.png');
render('apple', full, 180, 'public/apple-touch-icon.png');

/** One app picture: `crop` = [x, y, width, height] of its contents in the original. */
function picture(name, crop, width, { quality = 84 } = {}) {
  const out = `assets/brand/${name}.webp`;
  execFileSync('cwebp', [
    '-quiet',
    ...['-q', String(quality), '-alpha_q', '100', '-m', '6'],
    ...(crop ? ['-crop', ...crop.map(String)] : []),
    ...['-resize', String(width), '0'],
    ...[`assets/brand/source/${name}.png`, '-o', out],
  ]);
  console.log(`${out} (${width}px wide)`);
}

// Widths keep each picture sharp at the size the app shows it, and small on a slow connection.
picture('logo-mark', [0, 345, 1980, 1505], 300);
picture('logo-lockup', [296, 272, 1384, 1277], 520);
picture('kolek', [80, 320, 1810, 1332], 240);
picture('ph-flag', null, 120, { quality: 80 });
// The web launch screen (public/index.html) shows the lockup before any JavaScript arrives.
mkdirSync('public/brand', { recursive: true });
copyFileSync('assets/brand/logo-lockup.webp', 'public/brand/logo-lockup.webp');
console.log('public/brand/logo-lockup.webp');
