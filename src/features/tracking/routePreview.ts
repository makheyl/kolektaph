/**
 * Route preview for the map: the part of a truck's route already driven (solid) and the part
 * still to come (dashed), plus arrival-time labels on upcoming streets (pitch slide 11).
 */
import type { FeatureCollection, LineString, Point } from 'geojson';

import { splitLineAt } from '@/lib/geo';
import { formatClock } from '@/lib/time';
import type { LngLat, Route, TruckState } from '@/services/types';

import { segmentStarts, upcomingStreets } from './eta';

export interface RoutePreview {
  done: FeatureCollection<LineString>;
  next: FeatureCollection<LineString>;
  timeLabels: FeatureCollection<Point>;
}

const line = (coordinates: LngLat[]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates },
});

export function buildRoutePreview(
  route: Route,
  truck: TruckState,
  now: number,
  maxLabels = 6,
): RoutePreview {
  const starts = segmentStarts(route);
  const done: LngLat[][] = [];
  const next: LngLat[][] = [];
  route.segments.forEach((seg, i) => {
    const start = starts[i];
    const end = start + seg.lengthM;
    if (end <= truck.progressM) done.push(seg.coordinates);
    else if (start >= truck.progressM) next.push(seg.coordinates);
    else {
      const [before, after] = splitLineAt(seg.coordinates, truck.progressM - start);
      if (before.length > 1) done.push(before);
      if (after.length > 1) next.push(after);
    }
  });

  // Labels only while the truck is actually moving along the route: a full or stopped truck
  // has no honest arrival time.
  const moving = truck.status === 'on_route' || truck.status === 'not_started';
  const labels = moving ? upcomingStreets(route, truck, now, maxLabels) : [];

  return {
    done: { type: 'FeatureCollection', features: done.filter((c) => c.length > 1).map(line) },
    next: { type: 'FeatureCollection', features: next.filter((c) => c.length > 1).map(line) },
    timeLabels: {
      type: 'FeatureCollection',
      features: labels.map((s) => ({
        type: 'Feature',
        properties: { label: formatClock(s.arriveAt), street: s.name ?? '' },
        geometry: { type: 'Point', coordinates: route.segments[s.segmentIndex].coordinates[0] },
      })),
    },
  };
}
