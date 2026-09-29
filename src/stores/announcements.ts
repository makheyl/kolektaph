import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Announcement } from '@/services/types';

interface AnnouncementsState {
  items: Announcement[];
  add: (a: Announcement) => void;
  clear: () => void;
}

/**
 * Stand-in for the backend's announcements table: messages the City ENRO sends from the SMS
 * center. Only the mock AlertsService reads and writes this store.
 */
export const useAnnouncements = create<AnnouncementsState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (a) => set({ items: [...get().items, a] }),
      clear: () => set({ items: [] }),
    }),
    { name: 'kolektaph.announcements', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
