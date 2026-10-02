/// <reference types="node" />
/**
 * Builds the pilot database's seed from the app's own data (src/data/carmona), so the database
 * and the app's bundled copy can never drift apart. Nothing is typed by hand.
 *
 *   npx tsx scripts/db/build-seed.ts <out.json>   writes the seed JSON for private.seed_load
 *   npx tsx scripts/db/build-seed.ts --expect     prints the checksums supabase/tests/02_seed.sql compares
 *
 * The sample tickets are turned back into a recipe (details + actions, with times relative to
 * "now"); the database rebuilds them through its own lifecycle functions.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import {
  BARANGAYS,
  CITY_META,
  ROUTE_SCHEDULES,
  ROUTES,
  SCHEDULE_EXCEPTIONS,
  TRUCK_CAPACITY_TONNES,
  TRUCKS,
} from '@/data/carmona';
import { sampleTickets } from '@/data/carmona/sampleTickets';
import { driverStreets } from '@/features/driver/streets';
import { routeRunsOnDay } from '@/features/schedule/collections';
import { barangayAt } from '@/lib/geo';
import { DAY, HOUR, manilaDateKey, parseDateKey } from '@/lib/time';
import type { LngLat, PhotoRef, Ticket } from '@/services/types';

/** A fixed moment to build the sample tickets at; only the offsets from it are kept. */
const NOW = Date.UTC(2026, 9, 1, 4, 0, 0);
/** The collection calendar the tests compare: these many days from this Manila date. */
const CALENDAR_FROM = '2026-10-01';
const CALENDAR_DAYS = 120;

const md5 = (text: string) => createHash('md5').update(text, 'utf8').digest('hex');
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const e5 = (v: number) => Math.round(v * 1e5);

/** Things in the app's sample data that the database stores differently (printed at the end). */
const warnings: string[] = [];

function sampleOf(photo: PhotoRef | null): { sample: string } | null {
  if (!photo) return null;
  if (photo.kind !== 'sample') throw new Error('a sample ticket must use sample photos');
  return { sample: photo.id };
}

/** A sample ticket as a recipe: what was reported, then each action taken on it. */
function recipe(t: Ticket) {
  const hoursAgo = (at: number) => (NOW - at) / HOUR;
  if (t.history.filter((h) => h.kind === 'collected').length > 1) {
    throw new Error(`${t.id}: collected twice; the recipe keeps one proof`);
  }
  const steps: Record<string, unknown>[] = [];
  t.history.forEach((h, i) => {
    const base = { by: h.by, hours_ago: hoursAgo(h.at) };
    const next = t.history[i + 1];
    switch (h.kind) {
      case 'submitted':
      case 'closed':
        // Not actions in the database: the ticket's own created_at, and the 48-hour rule.
        return;
      case 'verified':
        // Dispatching an unverified ticket verifies it on the way: one action in the database.
        if (next?.kind === 'dispatched' && next.id === `${h.id}|dispatch`) return;
        steps.push({ action: 'verify', ...base });
        return;
      case 'dispatched':
        if (!t.dispatch) throw new Error(`${t.id}: dispatched without a dispatch`);
        steps.push({
          action: 'dispatch',
          ...base,
          mode: t.dispatch.mode,
          truck_id: t.dispatch.truckId,
          ...(t.dispatch.due != null ? { due_hours_from_now: (t.dispatch.due - NOW) / HOUR } : {}),
        });
        return;
      case 'started':
        steps.push({ action: 'start', ...base });
        return;
      case 'collected':
        if (!t.proof) throw new Error(`${t.id}: collected without proof`);
        steps.push({
          action: 'collect',
          ...base,
          before: sampleOf(t.proof.before),
          after: sampleOf(t.proof.after),
        });
        return;
      case 'rated':
        steps.push({ action: 'rate', ...base, stars: Number(h.note) });
        return;
      case 'rejected':
        steps.push({ action: 'reject', ...base, note: h.note });
        return;
      case 'education':
        steps.push({ action: 'education', ...base, note: h.note ?? '' });
        return;
      case 'reopened':
        steps.push({ action: 'reopen', ...base, note: h.note ?? '' });
        return;
      case 'merged':
        steps.push({ action: 'merge', ...base, into: h.note });
        return;
    }
  });

  // The database files a report under the barangay its location is in, never under a label.
  const here = barangayAt(t.location, BARANGAYS)?.properties.id ?? null;
  if (!here) throw new Error(`${t.id}: its location is outside every barangay`);
  if (here !== t.barangayId) {
    warnings.push(
      `${t.id} is labelled ${t.barangayId} in sampleTickets.ts but its pin is in ${here}`,
    );
  }
  return {
    seq: Number(t.id.slice(-6)),
    category: t.category,
    size: t.size,
    lng: Number(t.location[0].toFixed(6)),
    lat: Number(t.location[1].toFixed(6)),
    accuracy_m: t.accuracyM == null ? null : Math.round(t.accuracyM),
    barangay_id: here,
    landmark: t.landmark,
    near_waterway: t.nearWaterway,
    near_sensitive: t.nearSensitive,
    note: t.note,
    photos: t.photos.map((p) => sampleOf(p)!.sample),
    created_hours_ago: hoursAgo(t.createdAt),
    steps,
  };
}

const tickets = sampleTickets(NOW);
const recipes = tickets.map(recipe);

const seed = {
  meta: {
    reference_version: (CITY_META as typeof CITY_META & { generatedAt: string }).generatedAt,
    bounds: CITY_META.bounds,
    center: CITY_META.center,
    depot: CITY_META.depot,
    sources: CITY_META.sources,
  },
  barangays: BARANGAYS.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    alt_names: f.properties.altNames,
    population: f.properties.population,
    osm_relation_id: f.properties.osmRelationId,
    label_point: f.properties.labelPoint,
    geometry: f.geometry,
  })),
  trucks: TRUCKS.map((t) => ({ ...t, capacity_tonnes: TRUCK_CAPACITY_TONNES })),
  routes: ROUTES.map((r) => ({
    id: r.id,
    barangay_ids: r.barangayIds,
    segments: r.segments.map((s) => ({
      id: s.id,
      name: s.name,
      barangay_id: s.barangayId,
      collect: s.collect,
      length_m: s.lengthM,
      coordinates: s.coordinates,
    })),
  })),
  schedules: ROUTE_SCHEDULES.map((s) => ({
    route_id: s.routeId,
    truck_id: s.truckId,
    days: s.days,
    start: s.start,
    window_end: s.windowEnd,
    depart_at: s.departAt ?? null,
    waste_type: s.wasteType,
    expected_load: s.expectedLoad,
  })),
  exceptions: SCHEDULE_EXCEPTIONS.map((e) => ({
    date: e.date,
    action: e.action,
    move_to: e.moveTo ?? null,
    reason_fil: e.reason.fil,
    reason_en: e.reason.en,
    route_ids: e.routeIds === 'all' ? ROUTES.map((r) => r.id) : e.routeIds,
  })),
  sample_tickets: recipes,
};

// ---------- Checksums: each is computed the same way in supabase/tests/02_seed.sql ----------

/** "points:sum of lng x 1e5:sum of lat x 1e5": exact integers, so both sides agree to the digit. */
function pointsSummary(points: LngLat[]): string {
  let x = 0;
  let y = 0;
  for (const [lng, lat] of points) {
    x += e5(lng);
    y += e5(lat);
  }
  return `${points.length}:${x}:${y}`;
}

const polygonPoints = (g: { type: string; coordinates: unknown }): LngLat[] =>
  g.type === 'Polygon'
    ? (g.coordinates as LngLat[][]).flat()
    : (g.coordinates as LngLat[][][]).flat(2);

function calendar(): string[] {
  const out: string[] = [];
  const first = parseDateKey(CALENDAR_FROM);
  const schedules = [...ROUTE_SCHEDULES].sort((a, b) => byCodeUnit(a.routeId, b.routeId));
  for (let d = 0; d < CALENDAR_DAYS; d++) {
    const day = first + d * DAY;
    for (const s of schedules) {
      if (routeRunsOnDay(s, day, SCHEDULE_EXCEPTIONS).runs) {
        out.push(`${s.routeId}@${manilaDateKey(day)}`);
      }
    }
  }
  return out;
}

/** Every "barangay|street" a route collects on; the street list of the driver app is a subset. */
function streetKeys(): string[] {
  const out: string[] = [];
  for (const r of ROUTES) {
    const keys = new Set(
      r.segments
        .filter((s) => s.collect && s.barangayId && r.barangayIds.includes(s.barangayId))
        .map((s) => `${s.barangayId}|${s.name ?? s.id}`),
    );
    for (const street of driverStreets(r)) {
      if (!keys.has(street.key)) throw new Error(`${r.id}: street key ${street.key} not derivable`);
    }
    for (const k of keys) out.push(`${r.id}>${k}`);
  }
  return out.sort(byCodeUnit);
}

const expected = {
  counts: {
    barangays: seed.barangays.length,
    trucks: seed.trucks.length,
    routes: seed.routes.length,
    route_barangays: seed.routes.reduce((n, r) => n + r.barangay_ids.length, 0),
    route_segments: seed.routes.reduce((n, r) => n + r.segments.length, 0),
    route_schedules: seed.schedules.length,
    schedule_exceptions: seed.exceptions.length,
    schedule_exception_routes: seed.exceptions.reduce((n, e) => n + e.route_ids.length, 0),
    tickets: recipes.length,
    ticket_events: recipes.reduce((n, t) => n + t.steps.length, 0),
    ticket_photos: recipes.reduce(
      (n, t) =>
        n +
        t.photos.length +
        t.steps.reduce((m, s) => m + (s.before ? 1 : 0) + (s.after ? 1 : 0), 0),
      0,
    ),
  },
  reference_version: seed.meta.reference_version,
  barangays: md5(
    [...seed.barangays]
      .sort((a, b) => byCodeUnit(a.id, b.id))
      .map(
        (b) =>
          `${b.id}:${b.name}:${b.population ?? ''}:${b.osm_relation_id}:${b.alt_names.join('/')}:` +
          `${e5(b.label_point[0])}:${e5(b.label_point[1])}:${pointsSummary(polygonPoints(b.geometry))}`,
      )
      .join(','),
  ),
  segments: md5(
    [...seed.routes]
      .sort((a, b) => byCodeUnit(a.id, b.id))
      .flatMap((r) =>
        r.segments.map(
          (s, i) =>
            `${s.id}:${r.id}:${i + 1}:${s.name ?? ''}:${s.barangay_id ?? ''}:${s.collect ? 1 : 0}:` +
            `${s.length_m}:${pointsSummary(s.coordinates)}`,
        ),
      )
      .join(','),
  ),
  route_lengths: [...seed.routes]
    .sort((a, b) => byCodeUnit(a.id, b.id))
    .map(
      (r) =>
        `${r.id}:${r.barangay_ids.join('+')}:${r.segments.reduce((n, s) => n + s.length_m, 0)}`,
    )
    .join(','),
  schedules: [...seed.schedules]
    .sort((a, b) => byCodeUnit(a.route_id, b.route_id))
    .map(
      (s) =>
        `${s.route_id}:${s.truck_id}:${s.days.join('')}:${s.start}:${s.window_end}:` +
        `${s.depart_at ?? ''}:${s.waste_type}:${s.expected_load.toFixed(2)}`,
    )
    .join(','),
  exceptions: [...seed.exceptions]
    .sort((a, b) => byCodeUnit(a.date, b.date))
    .map(
      (e) =>
        `${e.date}:${e.action}:${e.move_to ?? ''}:${e.reason_fil}:${e.reason_en}:` +
        [...e.route_ids].sort(byCodeUnit).join('+'),
    )
    .join(','),
  calendar: { from: CALENDAR_FROM, days: CALENDAR_DAYS, md5: md5(calendar().join(',')) },
  street_keys: md5(streetKeys().join(',')),
  samples: tickets
    .map((t, i) => {
      const r = recipes[i];
      const photos =
        r.photos.length + r.steps.reduce((m, s) => m + (s.before ? 1 : 0) + (s.after ? 1 : 0), 0);
      return (
        `${r.seq}:${t.status}:${r.barangay_id}:${t.dispatch?.mode ?? ''}:` +
        `${t.dispatch?.truckId ?? ''}:${t.rating ?? ''}:${r.steps.length}:${photos}`
      );
    })
    .join(','),
};

const arg = process.argv[2];
if (arg === '--expect') {
  console.log(JSON.stringify(expected, null, 2));
} else if (arg) {
  const json = JSON.stringify(seed);
  writeFileSync(arg, json);
  console.log(`seed written: ${arg} (${(json.length / 1024).toFixed(0)} KB)`);
  console.log(JSON.stringify(expected.counts));
} else {
  console.error('usage: npx tsx scripts/db/build-seed.ts <out.json> | --expect');
  process.exit(1);
}
for (const w of warnings) console.error(`note: ${w}`);
