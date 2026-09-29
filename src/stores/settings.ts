import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Language = 'fil' | 'en';
export type Role = 'resident' | 'driver' | 'enro';

/** SMS alert opt-in. Kept on this device only in the prototype (no backend yet). */
export interface SmsSubscription {
  /** E.164, e.g. "+639171234567" */
  mobile: string;
  barangayId: string;
  optedInAt: number;
}

interface SettingsState {
  language: Language;
  largeText: boolean;
  role: Role | null;
  barangayId: string | null;
  onboarded: boolean;
  sms: SmsSubscription | null;
  setLanguage: (language: Language) => void;
  setLargeText: (largeText: boolean) => void;
  setRole: (role: Role | null) => void;
  setBarangayId: (barangayId: string | null) => void;
  completeOnboarding: () => void;
  setSms: (sms: SmsSubscription | null) => void;
  /** "Burahin ang data ko": forget everything stored about this resident on this device. */
  deleteMyData: () => void;
}

const DEFAULTS = {
  language: 'fil' as Language,
  largeText: false,
  role: null,
  barangayId: null,
  onboarded: false,
  sms: null,
};

/**
 * Per-device preferences. Data minimisation (RA 10173): only a barangay and, if the resident
 * opts in, a mobile number. Never a name or home address.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      setLanguage: (language) => set({ language }),
      setLargeText: (largeText) => set({ largeText }),
      setRole: (role) => set({ role }),
      setBarangayId: (barangayId) => {
        const { sms } = get();
        // SMS alerts follow the resident's barangay.
        set({ barangayId, sms: sms && barangayId ? { ...sms, barangayId } : sms });
      },
      completeOnboarding: () => set({ onboarded: true }),
      setSms: (sms) => set({ sms }),
      deleteMyData: () => set({ ...DEFAULTS, language: get().language }),
    }),
    {
      name: 'kolektaph.settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, largeText, role, barangayId, onboarded, sms }) => ({
        language,
        largeText,
        role,
        barangayId,
        onboarded,
        sms,
      }),
      // v0 (Sprint S1) had no onboarding/SMS fields; keep the saved preferences.
      migrate: (persisted) => ({ ...DEFAULTS, ...(persisted as object) }),
    },
  ),
);

/** True once saved settings have been loaded from storage (avoids flashing defaults). */
export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useSettings.persist.onFinishHydration(onChange),
    () => useSettings.persist.hasHydrated(),
    () => false,
  );
}
