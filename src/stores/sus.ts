import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SusResponse } from '@/features/usability/sus';

interface SusState {
  responses: SusResponse[];
  add: (response: SusResponse) => void;
  remove: (id: string) => void;
}

/** Usability-test answers, kept on the facilitator's device only (participant codes, no names). */
export const useSus = create<SusState>()(
  persist(
    (set, get) => ({
      responses: [],
      add: (response) => set({ responses: [...get().responses, response] }),
      remove: (id) => set({ responses: get().responses.filter((r) => r.id !== id) }),
    }),
    { name: 'kolektaph.sus', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
