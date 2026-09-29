import type { StyleProp, ViewStyle } from 'react-native';

import type { RoutePreview } from '@/features/tracking/routePreview';
import type { Bounds } from '@/lib/geo';
import type { BarangayCollection, CityMeta, LngLat, Route, TruckStatus } from '@/services/types';

export interface MapTruck {
  id: string;
  code: string;
  name: string;
  status: TruckStatus;
  position: LngLat;
}

/** Props shared by KMap.tsx (native) and KMap.web.tsx: both must render the same picture. */
export interface KMapProps {
  barangays: BarangayCollection;
  meta: CityMeta;
  trucks: MapTruck[];
  /** Routes drawn as thin dashed lines (e.g. all of today's routes on the demo screen). */
  routes?: Route[];
  /** One truck's route split into collected (solid) and upcoming (dashed) with time labels. */
  routePreview?: RoutePreview | null;
  /** GPS recorded by a driver's phone, drawn as a dotted line. */
  trace?: LngLat[] | null;
  highlightBarangayId?: string | null;
  selectedTruckId?: string | null;
  /** Moves the camera whenever `key` changes. */
  fitBounds?: { bounds: Bounds; key: string } | null;
  onTruckPress?: (truckId: string) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}
