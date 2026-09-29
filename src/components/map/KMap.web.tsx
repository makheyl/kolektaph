import 'maplibre-gl/dist/maplibre-gl.css';

import { setWorkerUrl } from 'maplibre-gl';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Layer, Map as MapLibreMap, type MapRef, Marker, Source } from 'react-map-gl/maplibre';

import {
  MAP_STYLE_URL,
  previewDoneLayer,
  previewNextLayer,
  previewTimeDotLayer,
  previewTimeLabelLayer,
  routeLineLayer,
  routeLines,
  SOURCE_IDS,
  traceLine,
  traceLineLayer,
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
  routePreview,
  trace,
  highlightBarangayId,
  selectedTruckId,
  fitBounds,
  onTruckPress,
  style,
  accessibilityLabel,
}: KMapProps) {
  const mapRef = useRef<MapRef>(null);
  const labels = useMemo(() => zoneLabelPoints(barangays), [barangays]);
  const lines = useMemo(() => routeLines(routes ?? []), [routes]);
  const traceData = useMemo(() => (trace ? traceLine(trace) : null), [trace]);
  const [[west, south], [east, north]] = meta.bounds;

  const fitKey = fitBounds?.key;
  useEffect(() => {
    if (!fitBounds) return;
    const [w, s, e, n] = fitBounds.bounds;
    mapRef.current?.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 40, duration: 600 },
    );
    // Only move when the caller asks (key changes), not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <View style={style} accessibilityLabel={accessibilityLabel}>
      <MapLibreMap
        ref={mapRef}
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
        {routePreview ? (
          <>
            <Source id={SOURCE_IDS.previewDone} type="geojson" data={routePreview.done}>
              <Layer {...previewDoneLayer} />
            </Source>
            <Source id={SOURCE_IDS.previewNext} type="geojson" data={routePreview.next}>
              <Layer {...previewNextLayer} />
            </Source>
          </>
        ) : null}
        {traceData ? (
          <Source id={SOURCE_IDS.trace} type="geojson" data={traceData}>
            <Layer {...traceLineLayer} />
          </Source>
        ) : null}
        <Source id={SOURCE_IDS.zoneLabels} type="geojson" data={labels}>
          <Layer {...zoneLabelLayer} />
        </Source>
        {routePreview ? (
          <Source id={SOURCE_IDS.previewTimes} type="geojson" data={routePreview.timeLabels}>
            <Layer {...previewTimeDotLayer} />
            <Layer {...previewTimeLabelLayer} />
          </Source>
        ) : null}
        {trucks.map((truck) => (
          <Marker
            key={truck.id}
            longitude={truck.position[0]}
            latitude={truck.position[1]}
            anchor="bottom"
            style={{ zIndex: truck.id === selectedTruckId ? 2 : 1 }}
          >
            <TruckPin
              truck={truck}
              selected={truck.id === selectedTruckId}
              onPress={() => onTruckPress?.(truck.id)}
            />
          </Marker>
        ))}
      </MapLibreMap>
    </View>
  );
}
