import { ROUTE_SCHEDULES } from '@/data/carmona';
import { isOnline } from '@/lib/network';
import { useAnnouncements } from '@/stores/announcements';
import { useBackend } from '@/stores/backend';
import { useCityAdmin } from '@/stores/cityAdmin';
import { getDemoEvents, getSimTime } from '@/stores/demo';

import { createMockServices } from './mock';
import type { Services } from './types';

/**
 * The single place that decides which implementation the app uses.
 * Swap in a Supabase/FastAPI implementation of `Services` here when the backend exists.
 */
export const services: Services = createMockServices({
  getSimTime,
  getEvents: () => [...getDemoEvents(), ...useBackend.getState().events],
  getAnnouncements: () => useAnnouncements.getState().items,
  addAnnouncement: (a) => useAnnouncements.getState().add(a),
  receiveUpload: (batch) => useBackend.getState().receive(batch),
  getTraces: () => useBackend.getState().traces,
  isOnline,
  getTickets: () => useBackend.getState().tickets,
  saveTicket: (t) => useBackend.getState().saveTicket(t),
  nextTicketSeq: () => useBackend.getState().nextTicketSeq(),
  getSchedules: () => useCityAdmin.getState().schedules ?? ROUTE_SCHEDULES,
  saveSchedules: (schedules) => useCityAdmin.getState().setSchedules(schedules),
  getLeadChanges: () => useCityAdmin.getState().leadChanges,
  addLeadChange: (at, minutes) => useCityAdmin.getState().addLeadChange(at, minutes),
  getContacts: () => useCityAdmin.getState().contacts,
  setContact: (target, info) => useCityAdmin.getState().setContact(target, info),
  getStaff: () => useCityAdmin.getState().staff,
  saveStaff: (user) => useCityAdmin.getState().saveStaff(user),
});

export { OfflineError, SignInError } from './errors';
export type * from './types';
