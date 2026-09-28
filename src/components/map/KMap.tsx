import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { View } from 'react-native';

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

/** Native map (MapLibre Native, Android dev build). Keep in sync with KMap.web.tsx. */
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
      <Map
        style={{ flex: 1 }}
        mapStyle={MAP_STYLE_URL}
        touchRotate={false}
        touchPitch={false}
        attribution
      >
        <Camera
          initialViewState={{
            bounds: [west, south, east, north],
            padding: { top: 24, right: 24, bottom: 24, left: 24 },
          }}
        />
        <GeoJSONSource id={SOURCE_IDS.zones} data={barangays}>
          <Layer {...zoneFillLayer(highlightBarangayId)} />
          <Layer {...zoneLineLayer} />
        </GeoJSONSource>
        <GeoJSONSource id={SOURCE_IDS.routes} data={lines}>
          <Layer {...routeLineLayer} />
        </GeoJSONSource>
        <GeoJSONSource id={SOURCE_IDS.zoneLabels} data={labels}>
          <Layer {...zoneLabelLayer} />
        </GeoJSONSource>
        {trucks.map((truck) => (
          <Marker
            key={truck.id}
            id={`truck-${truck.id}`}
            lngLat={truck.position}
            anchor="bottom"
            onPress={() => onTruckPress?.(truck.id)}
          >
            <TruckPin truck={truck} />
          </Marker>
        ))}
      </Map>
    </View>
  );
}
