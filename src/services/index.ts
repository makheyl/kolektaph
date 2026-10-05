import { ROUTE_SCHEDULES } from '@/data/carmona';
import { isOnline } from '@/lib/network';
import { useAnnouncements } from '@/stores/announcements';
import { useBackend } from '@/stores/backend';
import { useCityAdmin } from '@/stores/cityAdmin';
import { getDemoEvents, getSimTime, useDemo } from '@/stores/demo';
import { useEnro } from '@/stores/enro';

import { createMockServices } from './mock';
import { createSupabaseServices } from './supabase';
import { SUPABASE } from './supabase/config';
import type { Services } from './types';

/**
 * The sample services: everything lives on this device (the stores below stand in for the
 * server's tables), so the prototype runs with no backend at all.
 */
const createSampleServices = () =>
  createMockServices({
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
    getDecisions: () => useEnro.getState().decisions,
    saveDecision: (id, decision, at) => useEnro.getState().decide(id, decision, at),
    demo: {
      jumpTo: (simMs) => useDemo.getState().jumpTo(simMs),
      setSpeed: (speed) => useDemo.getState().setSpeed(speed),
      goLive: () => useDemo.getState().goLive(),
      addIncident: (event) => useDemo.getState().addEvent(event),
      reset: () => {
        useDemo.getState().clearEvents();
        useBackend.getState().reset();
        useEnro.getState().reset();
        useCityAdmin.getState().reset();
        useAnnouncements.getState().clear();
      },
    },
  });

/**
 * The single place that decides which implementation the app uses: the pilot database when the
 * build is given its address (EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY, see
 * .env.example), otherwise the sample services.
 */
export const services: Services = SUPABASE
  ? createSupabaseServices(SUPABASE)
  : createSampleServices();

export { OfflineError, ServerError, SignInError } from './errors';
export type * from './types';
