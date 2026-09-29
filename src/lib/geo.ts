import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { distance } from '@turf/distance';

import type { BarangayCollection, BarangayFeature, LngLat } from '@/services/types';

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

export const metresBetween = (a: LngLat, b: LngLat) => distance(a, b) * 1000;

/**
 * Splits a polyline at `metres` from its start, returning the part before and after the cut.
 * Both parts include the cut point, so they join seamlessly when drawn.
 */
export function splitLineAt(coords: LngLat[], metres: number): [LngLat[], LngLat[]] {
  if (metres <= 0) return [[coords[0]], coords];
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const step = metresBetween(coords[i - 1], coords[i]);
    if (walked + step >= metres) {
      const f = step === 0 ? 0 : (metres - walked) / step;
      const [ax, ay] = coords[i - 1];
      const [bx, by] = coords[i];
      const cut: LngLat = [ax + (bx - ax) * f, ay + (by - ay) * f];
      return [
        [...coords.slice(0, i), cut],
        [cut, ...coords.slice(i)],
      ];
    }
    walked += step;
  }
  return [coords, [coords[coords.length - 1]]];
}

export function boundsOf(feature: BarangayFeature): Bounds {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}

/** The barangay containing `point`, or null when outside Carmona. */
export function barangayAt(point: LngLat, barangays: BarangayCollection): BarangayFeature | null {
  return barangays.features.find((f) => booleanPointInPolygon(point, f)) ?? null;
}
