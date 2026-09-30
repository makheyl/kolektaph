import type { StyleProp, ViewStyle } from 'react-native';

import type { IconName } from '@/components/ui/Icon';
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

/** A report or task location. */
export interface MapPin {
  id: string;
  position: LngLat;
  color: string;
  icon: IconName;
  label: string;
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
  /** Start centred on a point (e.g. the resident's location) instead of the whole city. */
  initialCenter?: { center: LngLat; zoom: number } | null;
  /** Flies to a point whenever `key` changes. */
  flyTo?: { center: LngLat; zoom: number; key: string } | null;
  /** Called when the user stops moving the map (the "pin in the middle" location picker). */
  onCenterChange?: (center: LngLat) => void;
  /** Report or task locations. */
  pins?: MapPin[];
  /**
   * Web: require two fingers / ctrl+scroll to move the map, so the page scrolls normally
   * (default). Turn off for a full-screen picker.
   */
  cooperative?: boolean;
  onTruckPress?: (truckId: string) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}
