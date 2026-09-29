import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ScenarioEvent } from '@/services/types';
import { type ClockConfig, jumpTo, LIVE_CLOCK, simNow, withSpeed } from '@/simulator/clock';

interface DemoState {
  clock: ClockConfig;
  /** Shows "Sample data" badges. On for the whole prototype phase. */
  demoMode: boolean;
  /** Scripted incidents (e.g. a breakdown) that the simulator applies. */
  events: ScenarioEvent[];
  jumpTo: (simMs: number) => void;
  setSpeed: (speed: number) => void;
  goLive: () => void;
  addEvent: (event: ScenarioEvent) => void;
  clearEvents: () => void;
}

export const useDemo = create<DemoState>()(
  persist(
    (set, get) => ({
      clock: LIVE_CLOCK,
      demoMode: true,
      events: [],
      jumpTo: (simMs) => set({ clock: jumpTo(get().clock, simMs) }),
      setSpeed: (speed) => set({ clock: withSpeed(get().clock, speed) }),
      goLive: () => set({ clock: LIVE_CLOCK }),
      addEvent: (event) => set({ events: [...get().events, event] }),
      clearEvents: () => set({ events: [] }),
    }),
    {
      name: 'kolektaph.demo',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ clock: s.clock, demoMode: s.demoMode, events: s.events }),
      migrate: (persisted) => ({ events: [], ...(persisted as object) }),
    },
  ),
);

/** Current simulated time, readable outside React (services, simulator). */
export function getSimTime(): number {
  return simNow(useDemo.getState().clock);
}

export function getScenarioEvents(): ScenarioEvent[] {
  return useDemo.getState().events;
}
