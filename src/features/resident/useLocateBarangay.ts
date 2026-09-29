import * as Location from 'expo-location';
import { useState } from 'react';

import { barangayAt } from '@/lib/geo';
import type { BarangayCollection, BarangayFeature } from '@/services/types';

export type LocateState =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'found'; barangay: BarangayFeature }
  | { kind: 'outside' }
  | { kind: 'denied' }
  | { kind: 'error' };

/**
 * One-off "which barangay am I in?" lookup. Foreground permission only; the coordinates are
 * used once and never stored (data minimisation).
 */
export function useLocateBarangay(barangays: BarangayCollection | undefined) {
  const [state, setState] = useState<LocateState>({ kind: 'idle' });

  async function locate() {
    if (!barangays) return;
    setState({ kind: 'locating' });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        setState({ kind: 'denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const found = barangayAt([pos.coords.longitude, pos.coords.latitude], barangays);
      setState(found ? { kind: 'found', barangay: found } : { kind: 'outside' });
    } catch {
      setState({ kind: 'error' });
    }
  }

  return { state, locate, reset: () => setState({ kind: 'idle' }) };
}
