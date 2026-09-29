import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

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

const PADDING = { top: 40, right: 40, bottom: 40, left: 40 };

/** Native map (MapLibre Native, Android dev build). Keep in sync with KMap.web.tsx. */
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
  const cameraRef = useRef<CameraRef>(null);
  const labels = useMemo(() => zoneLabelPoints(barangays), [barangays]);
  const lines = useMemo(() => routeLines(routes ?? []), [routes]);
  const traceData = useMemo(() => (trace ? traceLine(trace) : null), [trace]);
  const [[west, south], [east, north]] = meta.bounds;

  const fitKey = fitBounds?.key;
  useEffect(() => {
    if (!fitBounds) return;
    cameraRef.current?.fitBounds(fitBounds.bounds, { padding: PADDING, duration: 600 });
    // Only move when the caller asks (key changes), not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

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
          ref={cameraRef}
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
        {routePreview ? (
          <>
            <GeoJSONSource id={SOURCE_IDS.previewDone} data={routePreview.done}>
              <Layer {...previewDoneLayer} />
            </GeoJSONSource>
            <GeoJSONSource id={SOURCE_IDS.previewNext} data={routePreview.next}>
              <Layer {...previewNextLayer} />
            </GeoJSONSource>
          </>
        ) : null}
        {traceData ? (
          <GeoJSONSource id={SOURCE_IDS.trace} data={traceData}>
            <Layer {...traceLineLayer} />
          </GeoJSONSource>
        ) : null}
        <GeoJSONSource id={SOURCE_IDS.zoneLabels} data={labels}>
          <Layer {...zoneLabelLayer} />
        </GeoJSONSource>
        {routePreview ? (
          <GeoJSONSource id={SOURCE_IDS.previewTimes} data={routePreview.timeLabels}>
            <Layer {...previewTimeDotLayer} />
            <Layer {...previewTimeLabelLayer} />
          </GeoJSONSource>
        ) : null}
        {trucks.map((truck) => (
          <Marker
            key={truck.id}
            id={`truck-${truck.id}`}
            lngLat={truck.position}
            anchor="bottom"
            selected={truck.id === selectedTruckId}
            onPress={() => onTruckPress?.(truck.id)}
          >
            <TruckPin truck={truck} selected={truck.id === selectedTruckId} />
          </Marker>
        ))}
      </Map>
    </View>
  );
}
