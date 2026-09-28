/**
 * Map layers shared by web (maplibre-gl) and native (MapLibre Native). Both accept the same
 * MapLibre style-spec layer objects, so the city looks identical on every platform.
 */
// Type-only import (erased at runtime, safe on web). maplibre-gl bundles a newer style-spec
// copy; the native package's types are the stricter subset, which both platforms accept.
import type {
  FillLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';
import type { FeatureCollection, LineString, Point } from 'geojson';

import type { BarangayCollection, Route } from '@/services/types';
import { colors } from '@/theme/tokens';

/** Free vector tiles, no API key. Self-host PMTiles before production (OSM tile policy). */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const SOURCE_IDS = {
  zones: 'kph-zones',
  zoneLabels: 'kph-zone-labels',
  routes: 'kph-routes',
} as const;

type SourcelessLayer<T> = Omit<T, 'source'>;

export function zoneFillLayer(
  highlightId: string | null | undefined,
): SourcelessLayer<FillLayerSpecification> {
  const id = highlightId ?? '';
  return {
    id: 'kph-zone-fill',
    type: 'fill',
    paint: {
      'fill-color': ['case', ['==', ['get', 'id'], id], colors.green, colors.navy],
      'fill-opacity': ['case', ['==', ['get', 'id'], id], 0.22, 0.05],
    },
  };
}

export const zoneLineLayer: SourcelessLayer<LineLayerSpecification> = {
  id: 'kph-zone-line',
  type: 'line',
  paint: { 'line-color': colors.navy, 'line-width': 1.5, 'line-opacity': 0.7 },
};

export const zoneLabelLayer: SourcelessLayer<SymbolLayerSpecification> = {
  id: 'kph-zone-label',
  type: 'symbol',
  layout: {
    'text-field': ['get', 'name'],
    'text-font': ['Noto Sans Bold'],
    'text-size': 13,
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': colors.navy,
    'text-halo-color': '#FFFFFF',
    'text-halo-width': 1.5,
  },
};

export const routeLineLayer: SourcelessLayer<LineLayerSpecification> = {
  id: 'kph-route-line',
  type: 'line',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': colors.navy,
    'line-width': 2.5,
    'line-opacity': 0.55,
    'line-dasharray': [1.5, 1.5],
  },
};

/** One label point per barangay (pre-computed inside the polygon, so both platforms match). */
export function zoneLabelPoints(barangays: BarangayCollection): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: barangays.features.map((f) => ({
      type: 'Feature',
      properties: { id: f.properties.id, name: f.properties.name },
      geometry: { type: 'Point', coordinates: f.properties.labelPoint },
    })),
  };
}

export function routeLines(routes: Route[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((r) =>
      r.segments.map((s) => ({
        type: 'Feature' as const,
        properties: { routeId: r.id, segmentId: s.id, collect: s.collect },
        geometry: { type: 'LineString' as const, coordinates: s.coordinates },
      })),
    ),
  };
}
