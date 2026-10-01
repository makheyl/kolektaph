#!/usr/bin/env node
/**
 * Makes the app's fonts small enough for 3G (plan §5.8, HAKOT NFR-01):
 * - Icons: MaterialCommunityIcons has ~7,000 icons (1.3 MB); keep only the ones the app uses.
 *   Every string in src/ that is an icon name counts as used, and src/components/ui/iconGlyphs.json
 *   becomes the list of valid icon names (so TypeScript rejects an icon missing from the font).
 * - Inter: keep Latin, Latin-1/Extended-A, common punctuation and every character that appears
 *   in the app's texts, instead of all scripts (~340 KB per weight).
 *
 *   npm run fonts    (run again after using a new icon or a new special character)
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import subsetFont from 'subset-font';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nm = (p) => path.join(root, 'node_modules', p);
const out = path.join(root, 'assets/fonts');
const ICONS = '@expo/vector-icons/build/vendor/react-native-vector-icons';

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|json)$/.test(entry.name)) yield p;
  }
}

const sources = [];
for await (const file of files(path.join(root, 'src'))) {
  if (file.endsWith('iconGlyphs.json')) continue;
  sources.push(await readFile(file, 'utf8'));
}

// ---------- Icons ----------
const glyphs = JSON.parse(await readFile(nm(`${ICONS}/glyphmaps/MaterialCommunityIcons.json`)));
const used = new Set();
for (const text of sources) {
  for (const m of text.matchAll(/['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g)) {
    if (glyphs[m[1]] !== undefined) used.add(m[1]);
  }
}
const iconMap = Object.fromEntries([...used].sort().map((name) => [name, glyphs[name]]));
const iconFont = await subsetFont(
  await readFile(nm(`${ICONS}/Fonts/MaterialCommunityIcons.ttf`)),
  String.fromCodePoint(...Object.values(iconMap)),
  { targetFormat: 'truetype' },
);
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'kph-icons.ttf'), iconFont);
await writeFile(
  path.join(root, 'src/components/ui/iconGlyphs.json'),
  `${JSON.stringify(iconMap, null, 2)}\n`,
);
console.log(`Icons: ${used.size} of ${Object.keys(glyphs).length} (${iconFont.length} bytes)`);

// ---------- Inter ----------
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const codepoints = new Set([
  ...range(0x20, 0x7e), // Basic Latin
  ...range(0xa0, 0x17f), // Latin-1 Supplement, Latin Extended-A (ñ, é…)
  ...range(0x2010, 0x2027), // dashes, quotes, bullet, ellipsis
  ...range(0x2030, 0x203a),
  0x20b1, // ₱
  ...range(0x2190, 0x2199), // arrows
  0x2212, // minus
]);
for (const text of sources) for (const ch of text) codepoints.add(ch.codePointAt(0));
const text = String.fromCodePoint(...[...codepoints].filter((c) => c >= 0x20));

for (const weight of ['400Regular', '600SemiBold', '700Bold', '800ExtraBold']) {
  const file = nm(`@expo-google-fonts/inter/${weight}/Inter_${weight}.ttf`);
  const font = await subsetFont(await readFile(file), text, { targetFormat: 'truetype' });
  await writeFile(path.join(out, `Inter_${weight}.ttf`), font);
  console.log(`Inter ${weight}: ${font.length} bytes`);
}
