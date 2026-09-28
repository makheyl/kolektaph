import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { type ClockConfig, jumpTo, LIVE_CLOCK, simNow, withSpeed } from '@/simulator/clock';

interface DemoState {
  clock: ClockConfig;
  /** Shows "Sample data" badges. On for the whole prototype phase. */
  demoMode: boolean;
  jumpTo: (simMs: number) => void;
  setSpeed: (speed: number) => void;
  goLive: () => void;
}

export const useDemo = create<DemoState>()(
  persist(
    (set, get) => ({
      clock: LIVE_CLOCK,
      demoMode: true,
      jumpTo: (simMs) => set({ clock: jumpTo(get().clock, simMs) }),
      setSpeed: (speed) => set({ clock: withSpeed(get().clock, speed) }),
      goLive: () => set({ clock: LIVE_CLOCK }),
    }),
    {
      name: 'kolektaph.demo',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ clock: s.clock, demoMode: s.demoMode }),
    },
  ),
);

/** Current simulated time, readable outside React (services, simulator). */
export function getSimTime(): number {
  return simNow(useDemo.getState().clock);
}
