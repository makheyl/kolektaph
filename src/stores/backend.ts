import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { GpsFix, GpsSource, TruckEvent, UploadBatch } from '@/services/types';

export interface ReceivedTrace {
  truckId: string;
  source: GpsSource;
  fixes: GpsFix[];
}

interface BackendState {
  /** Truck events received from driver phones. */
  events: TruckEvent[];
  /** GPS fixes received per shift. */
  traces: Record<string, ReceivedTrace>;
  receive: (batch: UploadBatch) => void;
  reset: () => void;
}

const MAX_TRACES = 12;
const MAX_EVENT_AGE_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * Stand-in for the backend's truck-event and GPS tables. Only the mock services read and write
 * it. Receiving is idempotent: an event id or a GPS index already stored is skipped, so a
 * phone that retries after a lost reply never creates duplicates.
 *
 * On web it lives in localStorage and is shared by every tab (see tabSync), so a driver tab and
 * a City ENRO tab behave like two devices talking to one server.
 */
export const useBackend = create<BackendState>()(
  persist(
    (set, get) => ({
      events: [],
      traces: {},
      receive: (batch) => {
        const { events, traces } = get();
        const known = new Set(events.map((e) => e.id));
        const fresh = batch.events.filter((e) => !known.has(e.id));
        const newest = Math.max(0, ...events.map((e) => e.at), ...fresh.map((e) => e.at));
        const nextEvents = [...events, ...fresh].filter((e) => e.at > newest - MAX_EVENT_AGE_MS);

        let nextTraces = traces;
        if (batch.gps) {
          const { shiftId, source, fromIndex, fixes } = batch.gps;
          const current = traces[shiftId]?.fixes ?? [];
          // Only the part of the batch the server does not have yet.
          const skip = Math.max(0, current.length - fromIndex);
          const added = fromIndex <= current.length ? fixes.slice(skip) : [];
          nextTraces = {
            ...traces,
            [shiftId]: { truckId: batch.truckId, source, fixes: [...current, ...added] },
          };
          const ids = Object.keys(nextTraces);
          if (ids.length > MAX_TRACES) {
            for (const id of ids.slice(0, ids.length - MAX_TRACES)) delete nextTraces[id];
          }
        }
        if (!fresh.length && nextTraces === traces) return;
        set({ events: nextEvents, traces: nextTraces });
      },
      reset: () => set({ events: [], traces: {} }),
    }),
    { name: 'kolektaph.backend', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
