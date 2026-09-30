import { create } from 'zustand';

import type { KolekMessage } from '@/services/types';

interface KolekChatState {
  messages: KolekMessage[];
  add: (message: KolekMessage) => void;
  clear: () => void;
}

/**
 * The conversation with Kolek. Kept in memory only (never saved): it lasts while the app is
 * open, so switching tabs keeps it, and nothing a resident typed stays on the device.
 */
export const useKolekChat = create<KolekChatState>()((set, get) => ({
  messages: [],
  add: (message) => set({ messages: [...get().messages, message] }),
  clear: () => set({ messages: [] }),
}));
