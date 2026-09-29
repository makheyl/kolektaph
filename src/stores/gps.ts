import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { acceptFixes } from '@/features/driver/gpsLog';
import type { GpsQueue } from '@/features/driver/outbox';
import type { GpsFix, GpsSource } from '@/services/types';

import { useDriver } from './driver';

interface GpsState extends GpsQueue {
  /** Fixes dropped by the recording rules (outside the shift, too rough, standing still). */
  rejected: number;
  /** Device time the phone last delivered any fix (kept or not): the recording is alive. */
  lastDeliveredAt: number | null;
  begin: (shiftId: string, source: GpsSource) => void;
  /** Keeps the fixes the rules accept; returns how many were kept. */
  append: (fixes: GpsFix[]) => number;
  /** The server has fixes [0, upTo) of this shift. */
  markSent: (shiftId: string, upTo: number) => void;
  clear: () => void;
}

/**
 * The shift's GPS recording on the phone. Fixes stay here after upload (for the GPS log and
 * the shift summary) until the next shift starts.
 */
export const useGps = create<GpsState>()(
  persist(
    (set, get) => ({
      shiftId: null,
      source: 'phone',
      fixes: [],
      sentCount: 0,
      rejected: 0,
      lastDeliveredAt: null,
      begin: (shiftId, source) =>
        set({ shiftId, source, fixes: [], sentCount: 0, rejected: 0, lastDeliveredAt: null }),
      append: (incoming) => {
        const { shift } = useDriver.getState();
        const { fixes, shiftId, rejected } = get();
        const window = shift && shift.shiftId === shiftId ? shift : null;
        const { accepted, rejected: dropped } = acceptFixes(
          window,
          fixes[fixes.length - 1] ?? null,
          incoming,
        );
        set({
          fixes: accepted.length ? [...fixes, ...accepted] : fixes,
          rejected: rejected + dropped,
          lastDeliveredAt: Date.now(),
        });
        return accepted.length;
      },
      markSent: (shiftId, upTo) => {
        if (get().shiftId !== shiftId) return;
        set({ sentCount: Math.max(get().sentCount, Math.min(upTo, get().fixes.length)) });
      },
      clear: () => set({ shiftId: null, fixes: [], sentCount: 0, rejected: 0 }),
    }),
    {
      name: 'kolektaph.gps',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ shiftId, source, fixes, sentCount, rejected }) => ({
        shiftId,
        source,
        fixes,
        sentCount,
        rejected,
      }),
    },
  ),
);

export function gpsHydrated(): Promise<void> {
  if (useGps.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useGps.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
