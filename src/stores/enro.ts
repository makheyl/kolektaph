import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SuggestionDecision = 'dispatched' | 'dismissed';

interface EnroState {
  /** What staff decided on each backup-truck suggestion (AI/rules suggest, people decide). */
  decisions: Record<string, { decision: SuggestionDecision; at: number }>;
  decide: (suggestionId: string, decision: SuggestionDecision, at: number) => void;
  reset: () => void;
}

export const useEnro = create<EnroState>()(
  persist(
    (set, get) => ({
      decisions: {},
      decide: (id, decision, at) =>
        set({ decisions: { ...get().decisions, [id]: { decision, at } } }),
      reset: () => set({ decisions: {} }),
    }),
    { name: 'kolektaph.enro', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
