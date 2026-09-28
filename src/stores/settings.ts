import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Language = 'fil' | 'en';
export type Role = 'resident' | 'driver' | 'enro';

interface SettingsState {
  language: Language;
  largeText: boolean;
  role: Role | null;
  barangayId: string | null;
  setLanguage: (language: Language) => void;
  setLargeText: (largeText: boolean) => void;
  setRole: (role: Role | null) => void;
  setBarangayId: (barangayId: string | null) => void;
}

/** Per-device preferences. Only a barangay is stored, never a home address (RA 10173). */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'fil',
      largeText: false,
      role: null,
      barangayId: null,
      setLanguage: (language) => set({ language }),
      setLargeText: (largeText) => set({ largeText }),
      setRole: (role) => set({ role }),
      setBarangayId: (barangayId) => set({ barangayId }),
    }),
    { name: 'kolektaph.settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
