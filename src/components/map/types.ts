import type { StyleProp, ViewStyle } from 'react-native';

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
  /** Routes drawn as thin dashed lines (today's routes). */
  routes?: Route[];
  highlightBarangayId?: string | null;
  onTruckPress?: (truckId: string) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
}
