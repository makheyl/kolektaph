#!/usr/bin/env node
/**
 * maplibre-gl v6 runs its tile parsing in a module Web Worker loaded from separate files
 * (maplibre-gl-worker.mjs, which imports maplibre-gl-shared.mjs). Metro bundles the main
 * library but does not serve those files, so we copy them into public/ (served as static
 * files on web, and included by `expo export`). KMap.web.tsx points setWorkerUrl() here.
 * Runs on postinstall so the copies always match the installed maplibre-gl version.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/maplibre-gl/dist');
const dest = path.join(root, 'public/maplibre');

await mkdir(dest, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(path.join(src, file), path.join(dest, file));
}
console.log('Copied maplibre-gl worker files to public/maplibre/');
