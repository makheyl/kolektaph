import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ClaimPlace, NewReport } from '@/services/types';

export interface PendingReport {
  localId: string;
  report: NewReport;
  savedAt: number;
  /** Set when the server refused it for good (its reason): kept to show, not sent again. */
  refused?: string;
}

interface MyReportsState {
  /** Ticket numbers this device submitted or claimed. */
  ticketIds: string[];
  /** Reports written without signal, sent when signal returns. */
  pending: PendingReport[];
  /** Where the resident lives, for "Hindi nadaanan" (never sent except with a claim). */
  claimPlace: ClaimPlace | null;
  /** History length the resident last saw per ticket (for "May bago"). */
  seen: Record<string, number>;
  addTicket: (id: string) => void;
  queue: (report: NewReport, savedAt: number) => string;
  dequeue: (localId: string) => void;
  markRefused: (localId: string, reason: string) => void;
  setClaimPlace: (place: ClaimPlace | null) => void;
  markSeen: (id: string, historyLength: number) => void;
  clear: () => void;
}

/**
 * The resident's own reports, on this device only. Data minimisation (RA 10173): no name or
 * address, just ticket numbers and (for claims) the street they chose.
 */
export const useMyReports = create<MyReportsState>()(
  persist(
    (set, get) => ({
      ticketIds: [],
      pending: [],
      claimPlace: null,
      seen: {},
      addTicket: (id) => {
        if (get().ticketIds.includes(id)) return;
        set({ ticketIds: [id, ...get().ticketIds] });
      },
      queue: (report, savedAt) => {
        const localId = `local|${savedAt}|${Math.random().toString(36).slice(2, 8)}`;
        set({ pending: [...get().pending, { localId, report, savedAt }] });
        return localId;
      },
      dequeue: (localId) => set({ pending: get().pending.filter((p) => p.localId !== localId) }),
      markRefused: (localId, reason) =>
        set({
          pending: get().pending.map((p) =>
            p.localId === localId ? { ...p, refused: reason } : p,
          ),
        }),
      setClaimPlace: (claimPlace) => set({ claimPlace }),
      markSeen: (id, historyLength) => set({ seen: { ...get().seen, [id]: historyLength } }),
      clear: () => set({ ticketIds: [], pending: [], claimPlace: null, seen: {} }),
    }),
    { name: 'kolektaph.myreports', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
