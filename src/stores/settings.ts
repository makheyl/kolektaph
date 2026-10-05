import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Language = 'fil' | 'en';
export type Role = 'resident' | 'driver' | 'enro';

/** SMS alert opt-in, as this device knows it (the server keeps the sign-up when there is one). */
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
  /** The number and barangay the server last confirmed (see smsKey), so a change is sent on. */
  smsSyncedKey: string | null;
  /** Alerts sent after this time show as unread in "Mga abiso". */
  alertsSeenAt: number;
  setLanguage: (language: Language) => void;
  setLargeText: (largeText: boolean) => void;
  setRole: (role: Role | null) => void;
  setBarangayId: (barangayId: string | null) => void;
  completeOnboarding: () => void;
  setSms: (sms: SmsSubscription | null) => void;
  markSmsSynced: (key: string | null) => void;
  markAlertsSeen: (at: number) => void;
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
  smsSyncedKey: null,
  alertsSeenAt: 0,
};

/** What a text sign-up is, for telling whether the server already has this exact one. */
export const smsKey = (sms: SmsSubscription | null) =>
  sms ? `${sms.mobile}|${sms.barangayId}` : null;

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
      markSmsSynced: (smsSyncedKey) => set({ smsSyncedKey }),
      markAlertsSeen: (at) => set({ alertsSeenAt: Math.max(get().alertsSeenAt, at) }),
      deleteMyData: () => set({ ...DEFAULTS, language: get().language }),
    }),
    {
      name: 'kolektaph.settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        language,
        largeText,
        role,
        barangayId,
        onboarded,
        sms,
        smsSyncedKey,
        alertsSeenAt,
      }) => ({
        language,
        largeText,
        role,
        barangayId,
        onboarded,
        sms,
        smsSyncedKey,
        alertsSeenAt,
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
