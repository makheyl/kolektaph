#!/usr/bin/env node
/**
 * Builds the static Carmona map fixtures used by the app's mock services.
 *
 *   node scripts/data/build-carmona-data.mjs
 *
 * Sources (fetched once at build time, never at app runtime):
 *   - Barangay boundaries + population tags: OpenStreetMap via Overpass API (ODbL)
 *   - Road-following truck routes: OSRM public demo server (OpenStreetMap road data)
 *
 * Outputs (committed):
 *   src/data/carmona/barangays.json  FeatureCollection of the 14 barangays
 *   src/data/carmona/routes.json     Sample collection routes split into named street segments
 *   src/data/carmona/meta.json       Bounds, centre, depot and provenance
 *
 * Routes are SAMPLE data for the prototype. Replace them with the City ENRO's real routes.
 */
import along from '@turf/along';
import bbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import distance from '@turf/distance';
import { lineString, point } from '@turf/helpers';
import length from '@turf/length';
import pointOnFeature from '@turf/point-on-feature';
import simplify from '@turf/simplify';
import osmtogeojson from 'osmtogeojson';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/data/carmona',
);
const USER_AGENT = 'KolektaPH-data-builder/0.1 (student LGU prototype)';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const OSRM = 'https://router.project-osrm.org';
const CITY_AREA = 'area["name"~"^Carmona"]["boundary"="administrative"]["admin_level"="6"]->.a;';

// Sample routes: [barangayId, number of waypoints sampled inside it], visited in order.
const ROUTES = [
  { id: 'r-lantic', barangays: [['lantic', 14]] },
  { id: 'r-milagrosa', barangays: [['milagrosa', 12]] },
  { id: 'r-mabuhay', barangays: [['mabuhay', 12]] },
  {
    id: 'r-poblacion-maduya',
    barangays: [
      ['brgy-1', 2],
      ['brgy-2', 2],
      ['brgy-3', 2],
      ['brgy-4', 2],
      ['brgy-5', 2],
      ['brgy-6', 2],
      ['brgy-7', 2],
      ['brgy-8', 2],
      ['maduya', 8],
    ],
  },
  { id: 'r-bancal', barangays: [['bancal', 14]] },
  { id: 'r-cabilang-baybay', barangays: [['cabilang-baybay', 8]] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n) => Math.round(n * 1e5) / 1e5;
const roundCoords = (coords) => coords.map(([x, y]) => [round(x), round(y)]);

async function overpass(query) {
  // Public Overpass servers are often busy: retry with backoff, alternating with a mirror.
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: `[out:json][timeout:90];${query}` }),
      });
      if (res.ok) return await res.json();
      lastError = new Error(`Overpass ${res.status} from ${endpoint}`);
    } catch (err) {
      lastError = err;
    }
    console.log(`   ${lastError.message}; retrying…`);
    await sleep(5000 * (attempt + 1));
  }
  throw lastError;
}

async function osrmRoute(coords) {
  const list = coords.map(([x, y]) => `${x},${y}`).join(';');
  const url = `${OSRM}/route/v1/driving/${list}?steps=true&geometries=geojson&overview=false&continue_straight=true`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(`OSRM ${json.code}: ${json.message}`);
  await sleep(1100); // respect the demo server's 1 request/second policy
  return json.routes[0];
}

function slugFor(name) {
  const m = /^Barangay (\d)$/.exec(name);
  if (m) return `brgy-${m[1]}`;
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Farthest-point sampling: deterministic, spreads waypoints across the barangay. */
function samplePoints(candidates, n, start) {
  if (candidates.length <= n) return candidates;
  const picked = [];
  let first = candidates.reduce((best, c) =>
    distance(c, start) < distance(best, start) ? c : best,
  );
  picked.push(first);
  while (picked.length < n) {
    let bestC = null;
    let bestD = -1;
    for (const c of candidates) {
      const d = Math.min(...picked.map((p) => distance(c, p)));
      if (d > bestD) {
        bestD = d;
        bestC = c;
      }
    }
    picked.push(bestC);
  }
  return picked;
}

/** Greedy nearest-neighbour ordering so the truck sweeps the barangay instead of zig-zagging. */
function orderNearest(points, from) {
  const rest = [...points];
  const ordered = [];
  let cur = from;
  while (rest.length) {
    let bi = 0;
    for (let i = 1; i < rest.length; i++) {
      if (distance(cur, rest[i]) < distance(cur, rest[bi])) bi = i;
    }
    cur = rest.splice(bi, 1)[0];
    ordered.push(cur);
  }
  return ordered;
}

function barangayAt(coord, barangays) {
  const f = barangays.find((b) => booleanPointInPolygon(point(coord), b));
  return f ? f.properties.id : null;
}

async function main() {
  console.log('1/4 Fetching barangay boundaries from OpenStreetMap…');
  const boundaryData = await overpass(
    `${CITY_AREA}rel(area.a)["boundary"="administrative"]["admin_level"="10"];(._;>;);out body;`,
  );
  const geo = osmtogeojson(boundaryData);
  const barangays = geo.features
    .filter((f) => f.id.startsWith('relation/') && /Polygon/.test(f.geometry.type))
    .map((f) => {
      const t = f.properties;
      const id = slugFor(t.name);
      const simplified = simplify(f, { tolerance: 0.00003, highQuality: true });
      const label = pointOnFeature(simplified).geometry.coordinates;
      const coords =
        simplified.geometry.type === 'Polygon'
          ? simplified.geometry.coordinates.map(roundCoords)
          : simplified.geometry.coordinates.map((poly) => poly.map(roundCoords));
      return {
        type: 'Feature',
        id,
        properties: {
          id,
          name: t.name,
          altNames: (t.alt_name ?? '').split(';').filter(Boolean),
          population: t.population ? Number(t.population) : null,
          populationSource: 'PSA 2024 Census via OpenStreetMap population tag',
          labelPoint: roundCoords([label])[0],
          osmRelationId: Number(f.id.split('/')[1]),
        },
        geometry: { type: simplified.geometry.type, coordinates: coords },
      };
    })
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'en', { numeric: true }));
  if (barangays.length !== 14) throw new Error(`Expected 14 barangays, got ${barangays.length}`);
  console.log(`   ${barangays.length} barangays: ${barangays.map((b) => b.id).join(', ')}`);

  console.log('2/4 Fetching named residential streets and the city hall (depot)…');
  await sleep(2000);
  const streetData = await overpass(
    `${CITY_AREA}(way(area.a)["highway"~"^(residential|tertiary|unclassified|living_street)$"]["name"]["access"!~"^(private|no)$"];nwr(area.a)["amenity"="townhall"];);out center tags;`,
  );
  const streets = streetData.elements
    .filter((e) => e.type === 'way' && e.center)
    .map((e) => point([e.center.lon, e.center.lat], { name: e.tags.name }));
  const hall = streetData.elements.find((e) => e.tags?.amenity === 'townhall');
  const depot = hall
    ? [hall.lon ?? hall.center.lon, hall.lat ?? hall.center.lat]
    : barangays.find((b) => b.id === 'brgy-1').properties.labelPoint;
  console.log(
    `   ${streets.length} named streets; depot: ${hall?.tags?.name ?? 'Barangay 1 centre'}`,
  );

  console.log('3/4 Routing sample collection routes with OSRM…');
  const routes = [];
  for (const def of ROUTES) {
    let cursor = point(depot);
    const waypoints = [depot];
    for (const [bid, n] of def.barangays) {
      const poly = barangays.find((b) => b.id === bid);
      const inside = streets.filter((s) => booleanPointInPolygon(s, poly));
      if (!inside.length) throw new Error(`No named streets inside ${bid}`);
      const sampled = orderNearest(samplePoints(inside, n, cursor), cursor);
      waypoints.push(...sampled.map((p) => p.geometry.coordinates));
      cursor = sampled[sampled.length - 1];
    }
    const route = await osrmRoute(waypoints);
    const targetIds = new Set(def.barangays.map(([bid]) => bid));

    // Flatten OSRM steps into segments, then merge consecutive ones on the same street + barangay.
    const raw = [];
    for (const leg of route.legs) {
      for (const step of leg.steps) {
        const coords = step.geometry.coordinates;
        if (step.distance < 1 || coords.length < 2) continue;
        const line = lineString(coords);
        const mid = along(line, length(line) / 2).geometry.coordinates;
        raw.push({ name: step.name || null, barangayId: barangayAt(mid, barangays), coords });
      }
    }
    const merged = [];
    for (const s of raw) {
      const prev = merged[merged.length - 1];
      if (prev && prev.name === s.name && prev.barangayId === s.barangayId) {
        prev.coords.push(...s.coords.slice(1));
      } else {
        merged.push({ ...s, coords: [...s.coords] });
      }
    }
    // Everything before the first segment inside a target barangay is transit from the depot.
    const firstCollect = merged.findIndex((s) => targetIds.has(s.barangayId));
    const segments = merged.map((s, i) => {
      const lengthM = Math.round(length(lineString(s.coords)) * 1000);
      return {
        id: `${def.id}-s${String(i + 1).padStart(3, '0')}`,
        name: s.name,
        barangayId: s.barangayId,
        collect: i >= firstCollect && targetIds.has(s.barangayId),
        lengthM,
        coordinates: roundCoords(s.coords),
      };
    });
    const lengthM = segments.reduce((sum, s) => sum + s.lengthM, 0);
    routes.push({ id: def.id, barangayIds: [...targetIds], lengthM, segments });
    console.log(
      `   ${def.id}: ${(lengthM / 1000).toFixed(1)} km, ${segments.length} segments, ${segments.filter((s) => s.collect).length} collection segments`,
    );
  }

  console.log('4/4 Writing fixtures…');
  const fc = { type: 'FeatureCollection', features: barangays };
  const [minX, minY, maxX, maxY] = bbox(fc);
  const meta = {
    generatedAt: new Date().toISOString(),
    bounds: [
      [round(minX), round(minY)],
      [round(maxX), round(maxY)],
    ],
    center: [round((minX + maxX) / 2), round((minY + maxY) / 2)],
    depot: { name: hall?.tags?.name ?? 'Depot (sample)', coordinates: roundCoords([depot])[0] },
    sources: [
      'Barangay boundaries, names and population tags: © OpenStreetMap contributors (ODbL 1.0)',
      'Population figures: Philippine Statistics Authority, 2024 Census of Population (via OSM tags)',
      'Route geometry: OSRM routing on OpenStreetMap road data. Routes are SAMPLE data, not ENRO routes.',
    ],
  };
  await writeFile(path.join(OUT_DIR, 'barangays.json'), JSON.stringify(fc));
  await writeFile(path.join(OUT_DIR, 'routes.json'), JSON.stringify(routes));
  await writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
