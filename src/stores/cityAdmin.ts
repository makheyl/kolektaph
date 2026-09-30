import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  CityConfig,
  ContactInfo,
  ContactTarget,
  RouteSchedule,
  StaffUser,
} from '@/services/types';

/**
 * SAMPLE dashboard accounts (no real people). Real accounts and sign-in come with the backend.
 */
export const SAMPLE_STAFF: StaffUser[] = [
  { id: 'u-admin', name: 'ENRO Admin', role: 'admin', barangayId: null, active: true },
  { id: 'u-disp-1', name: 'Dispatcher 1', role: 'dispatcher', barangayId: null, active: true },
  { id: 'u-disp-2', name: 'Dispatcher 2', role: 'dispatcher', barangayId: null, active: true },
  { id: 'u-viewer', name: 'Viewer', role: 'viewer', barangayId: null, active: true },
  {
    id: 'u-brgy-milagrosa',
    name: 'Milagrosa focal person',
    role: 'barangay',
    barangayId: 'milagrosa',
    active: true,
  },
];

/** No phone numbers until the City and barangays give them (never invent contact numbers). */
const EMPTY_CONTACTS: CityConfig['contacts'] = {
  enro: { phone: null, hours: null },
  barangays: {},
};

interface CityAdminState {
  /** The route schedules as edited by the City ENRO; null = the sample schedule. */
  schedules: RouteSchedule[] | null;
  /** SMS lead time changes, oldest first (the default applies before the first one). */
  leadChanges: { at: number; minutes: number }[];
  contacts: CityConfig['contacts'];
  staff: StaffUser[];
  setSchedules: (schedules: RouteSchedule[]) => void;
  addLeadChange: (at: number, minutes: number) => void;
  setContact: (target: ContactTarget, info: ContactInfo) => void;
  saveStaff: (user: StaffUser) => void;
  reset: () => void;
}

/**
 * Stand-in for the backend's settings tables (schedules, SMS lead time, contacts, accounts).
 * Only the mock services read and write this store.
 */
export const useCityAdmin = create<CityAdminState>()(
  persist(
    (set, get) => ({
      schedules: null,
      leadChanges: [],
      contacts: EMPTY_CONTACTS,
      staff: SAMPLE_STAFF,
      setSchedules: (schedules) => set({ schedules }),
      addLeadChange: (at, minutes) =>
        set({
          leadChanges: [...get().leadChanges.filter((c) => c.at < at), { at, minutes }],
        }),
      setContact: (target, info) => {
        const { contacts } = get();
        set({
          contacts:
            target.kind === 'enro'
              ? { ...contacts, enro: info }
              : { ...contacts, barangays: { ...contacts.barangays, [target.barangayId]: info } },
        });
      },
      saveStaff: (user) => {
        const { staff } = get();
        set({
          staff: staff.some((u) => u.id === user.id)
            ? staff.map((u) => (u.id === user.id ? user : u))
            : [...staff, user],
        });
      },
      reset: () =>
        set({ schedules: null, leadChanges: [], contacts: EMPTY_CONTACTS, staff: SAMPLE_STAFF }),
    }),
    { name: 'kolektaph.admin', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
