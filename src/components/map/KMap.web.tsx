import 'maplibre-gl/dist/maplibre-gl.css';

import { setWorkerUrl } from 'maplibre-gl';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Layer, Map as MapLibreMap, Marker, Source } from 'react-map-gl/maplibre';

import {
  MAP_STYLE_URL,
  routeLineLayer,
  routeLines,
  SOURCE_IDS,
  zoneFillLayer,
  zoneLabelLayer,
  zoneLabelPoints,
  zoneLineLayer,
} from './layers';
import { TruckPin } from './TruckPin';
import type { KMapProps } from './types';

// Metro doesn't serve maplibre-gl's worker files; scripts/copy-maplibre-worker.mjs puts them in public/.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

/** Web map (maplibre-gl). Keep in sync with KMap.tsx (native). */
export function KMap({
  barangays,
  meta,
  trucks,
  routes,
  highlightBarangayId,
  onTruckPress,
  style,
  accessibilityLabel,
}: KMapProps) {
  const labels = useMemo(() => zoneLabelPoints(barangays), [barangays]);
  const lines = useMemo(() => routeLines(routes ?? []), [routes]);
  const [[west, south], [east, north]] = meta.bounds;

  return (
    <View style={style} accessibilityLabel={accessibilityLabel}>
      <MapLibreMap
        initialViewState={{
          bounds: [west, south, east, north],
          fitBoundsOptions: { padding: 24 },
        }}
        mapStyle={MAP_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        dragRotate={false}
        pitchWithRotate={false}
        cooperativeGestures
        attributionControl={{ compact: true }}
      >
        <Source id={SOURCE_IDS.zones} type="geojson" data={barangays}>
          <Layer {...zoneFillLayer(highlightBarangayId)} />
          <Layer {...zoneLineLayer} />
        </Source>
        <Source id={SOURCE_IDS.routes} type="geojson" data={lines}>
          <Layer {...routeLineLayer} />
        </Source>
        <Source id={SOURCE_IDS.zoneLabels} type="geojson" data={labels}>
          <Layer {...zoneLabelLayer} />
        </Source>
        {trucks.map((truck) => (
          <Marker
            key={truck.id}
            longitude={truck.position[0]}
            latitude={truck.position[1]}
            anchor="bottom"
          >
            <TruckPin truck={truck} onPress={() => onTruckPress?.(truck.id)} />
          </Marker>
        ))}
      </MapLibreMap>
    </View>
  );
}
