import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  markSynced,
  type OutboxItem,
  shiftEndId,
  shiftStartId,
  UNDO_MS,
} from '@/features/driver/outbox';
import type {
  DriverSession,
  GpsSource,
  TruckEvent,
  TruckEventInput,
  TruckState,
} from '@/services/types';

import { getSimTime } from './demo';

export interface ActiveShift {
  shiftId: string;
  truckId: string;
  routeId: string | null;
  crew: number;
  gpsSource: GpsSource;
  /** Simulated (demo) time, like every truck event. */
  startedAt: number;
  endedAt: number | null;
  /** The phone's own clock, for the GPS recording window (TC-09). */
  startedAtDevice: number;
  endedAtDevice: number | null;
}

export interface SyncStatus {
  lastOkAt: number | null;
  failures: number;
  /** Device time before which no retry is attempted (backoff). */
  nextTryAt: number;
  /** 'signin' = the truck sign-in has ended: the crew enters the PIN again, nothing is lost. */
  lastError: 'offline' | 'error' | 'signin' | null;
  /** Reports the server refused for good this shift (they are dropped, not retried). */
  refused?: number;
  lastRefusal?: string | null;
}

interface DriverState {
  session: DriverSession | null;
  shift: ActiveShift | null;
  /** This shift's reports, uploaded or not (the phone's own record). */
  outbox: OutboxItem[];
  sync: SyncStatus;
  signIn: (session: DriverSession) => void;
  signOut: () => void;
  startShift: (input: { routeId: string | null; crew: number; gpsSource: GpsSource }) => void;
  /** Records a report; undoable ones wait UNDO_MS before upload. Returns the event id. */
  report: (input: TruckEventInput, opts?: { undoable?: boolean }) => string;
  /** Takes back a report that has not been sent yet. */
  undo: (eventId: string) => boolean;
  endShift: () => void;
  /** Forgets a finished shift once everything is uploaded. */
  clearShift: () => void;
  markSynced: (eventIds: string[]) => void;
  /** Removes reports the server refused for good, and remembers how many and why. */
  dropRefused: (refused: { id: string; reason: string }[]) => void;
  setSync: (sync: Partial<SyncStatus>) => void;
}

const newId = (prefix: string) =>
  `${prefix}|${Date.now().toString(36)}|${Math.random().toString(36).slice(2, 8)}`;

const IDLE_SYNC: SyncStatus = {
  lastOkAt: null,
  failures: 0,
  nextTryAt: 0,
  lastError: null,
  refused: 0,
  lastRefusal: null,
};

/**
 * The driver phone's own state: who is signed in, the running shift and every report of it
 * (the offline queue). Persisted, so nothing is lost if the app is closed or the phone restarts.
 */
export const useDriver = create<DriverState>()(
  persist(
    (set, get) => ({
      session: null,
      shift: null,
      outbox: [],
      sync: IDLE_SYNC,
      signIn: (session) => set({ session }),
      signOut: () => set({ session: null }),
      startShift: ({ routeId, crew, gpsSource }) => {
        const { session } = get();
        if (!session) return;
        const at = getSimTime();
        const shift: ActiveShift = {
          shiftId: newId(`shift|${session.truckId}`),
          truckId: session.truckId,
          routeId,
          crew,
          gpsSource,
          startedAt: at,
          endedAt: null,
          startedAtDevice: Date.now(),
          endedAtDevice: null,
        };
        const event: TruckEvent = {
          id: shiftStartId(shift.shiftId),
          truckId: session.truckId,
          at,
          source: 'driver',
          kind: 'shift_start',
          shiftId: shift.shiftId,
          routeId,
          crew,
        };
        // Reports from an earlier, fully uploaded shift are no longer needed on the phone.
        const outbox = get().outbox.filter((o) => !o.synced);
        set({
          shift,
          outbox: [...outbox, { event, holdUntil: 0, synced: false }],
          sync: { ...get().sync, refused: 0, lastRefusal: null },
        });
      },
      report: (input, opts) => {
        const { shift } = get();
        if (!shift) return '';
        const event = {
          ...input,
          id: newId(`${shift.truckId}|${input.kind}`),
          truckId: shift.truckId,
          at: getSimTime(),
          source: 'driver',
          shiftId: shift.shiftId,
        } as TruckEvent;
        const holdUntil = opts?.undoable ? Date.now() + UNDO_MS : 0;
        set({ outbox: [...get().outbox, { event, holdUntil, synced: false }] });
        return event.id;
      },
      undo: (eventId) => {
        const item = get().outbox.find((o) => o.event.id === eventId);
        if (!item || item.synced) return false;
        set({ outbox: get().outbox.filter((o) => o.event.id !== eventId) });
        return true;
      },
      endShift: () => {
        const { shift } = get();
        if (!shift || shift.endedAt != null) return;
        const at = getSimTime();
        const event: TruckEvent = {
          id: shiftEndId(shift.shiftId),
          truckId: shift.truckId,
          at,
          source: 'driver',
          kind: 'shift_end',
          shiftId: shift.shiftId,
        };
        // Anything still held for undo is final now.
        const outbox = get().outbox.map((o) => (o.synced ? o : { ...o, holdUntil: 0 }));
        set({
          shift: { ...shift, endedAt: at, endedAtDevice: Date.now() },
          outbox: [...outbox, { event, holdUntil: 0, synced: false }],
        });
      },
      clearShift: () => {
        if (get().outbox.some((o) => !o.synced)) return;
        set({ shift: null, outbox: [] });
      },
      markSynced: (ids) => set({ outbox: markSynced(get().outbox, ids) }),
      dropRefused: (refused) => {
        if (!refused.length) return;
        const gone = new Set(refused.map((r) => r.id));
        const { sync } = get();
        set({
          outbox: get().outbox.filter((o) => !gone.has(o.event.id)),
          sync: {
            ...sync,
            refused: (sync.refused ?? 0) + refused.length,
            lastRefusal: refused[refused.length - 1].reason,
          },
        });
      },
      setSync: (sync) => set({ sync: { ...get().sync, ...sync } }),
    }),
    {
      name: 'kolektaph.driver',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ session: s.session, shift: s.shift, outbox: s.outbox, sync: s.sync }),
      // v2: every report names its shift. Reports queued by an older version get the shift
      // they were made in (the one running at the time).
      migrate: (persisted) => {
        const state = persisted as Pick<DriverState, 'session' | 'shift' | 'outbox' | 'sync'>;
        let current = state.shift?.shiftId;
        const outbox = (state.outbox ?? []).map((o) => {
          if (o.event.kind === 'shift_start') current = o.event.shiftId;
          return o.event.shiftId || !current
            ? o
            : { ...o, event: { ...o.event, shiftId: current } as TruckEvent };
        });
        return { ...state, outbox };
      },
    },
  ),
);

/** This shift's reports as the phone knows them (including ones not uploaded yet). */
export const localEvents = (): TruckEvent[] => useDriver.getState().outbox.map((o) => o.event);

/** Waits until the persisted driver state is loaded (e.g. when the GPS task wakes the app). */
export function driverHydrated(): Promise<void> {
  if (useDriver.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useDriver.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

interface DriverLiveState {
  /** The truck as this phone sees it (server state plus unsent reports). */
  truck: TruckState | null;
  /** Phone GPS is delivering fixes (always true for demo GPS or without a shift). */
  gpsOk: boolean;
  /** Bumped by "Buksan ulit ang GPS"; the GPS watchdog restarts recording. */
  gpsRestarts: number;
  requestGpsRestart: () => void;
}

/** Not persisted: fed by the driver layout (subscription and GPS watchdog). */
export const useDriverLive = create<DriverLiveState>()((set, get) => ({
  truck: null,
  gpsOk: true,
  gpsRestarts: 0,
  requestGpsRestart: () => set({ gpsRestarts: get().gpsRestarts + 1 }),
}));
