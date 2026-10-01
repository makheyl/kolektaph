#!/usr/bin/env node
/**
 * maplibre-gl v6 ships as ES modules: maplibre-gl.mjs (main thread) and maplibre-gl-worker.mjs
 * (tile parsing in a Web Worker), both importing maplibre-gl-shared.mjs. On the web the app
 * loads them at runtime from public/maplibre (served as static files, included by
 * `expo export`) instead of bundling them: see KMapMapLibre.web.tsx and metro.config.js.
 * Runs on postinstall so the copies always match the installed maplibre-gl version.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/maplibre-gl/dist');
const dest = path.join(root, 'public/maplibre');

await mkdir(dest, { recursive: true });
for (const file of ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(path.join(src, file), path.join(dest, file));
}
console.log('Copied maplibre-gl module files to public/maplibre/');
