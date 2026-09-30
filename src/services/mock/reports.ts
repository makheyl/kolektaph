/**
 * Mock ReportsService: tickets live in the backend store (stand-in for the server). Claims are
 * checked against the simulated truck, its GPS trace and the crew's street log, exactly the way
 * a backend would check them against real GPS.
 */
import { BARANGAYS, ROUTES, SCHEDULE_EXCEPTIONS, TRUCKS } from '@/data/carmona';
import { judgeClaim, nearestStreet } from '@/features/claims/missed';
import { driverStreets, streetMarks } from '@/features/driver/streets';
import { applyAction, newTicket, ticketNumber, withAutoClose } from '@/features/reports/lifecycle';
import {
  collectionsForBarangay,
  nextCollectionAfterToday,
  todaysCollection,
} from '@/features/schedule/collections';
import { barangayAt } from '@/lib/geo';
import { manilaDateKey, manilaParts, manilaStartOfDay } from '@/lib/time';
import { simulateTruck } from '@/simulator/truckSimulator';

import { OfflineError } from '../errors';
import type {
  ClaimResult,
  LngLat,
  MissedStreet,
  NewReport,
  ReportsService,
  RouteSchedule,
  Ticket,
  TruckEvent,
  TruckState,
} from '../types';

const TICK_MS = 2000;
const NETWORK_MS = 300;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ReportsDeps {
  getSimTime: () => number;
  getEvents: () => TruckEvent[];
  getTickets: () => Ticket[];
  saveTicket: (t: Ticket) => void;
  nextTicketSeq: () => number;
  isOnline: () => boolean;
  /** The route schedules in force (City ENRO edits included). */
  getSchedules: () => RouteSchedule[];
  /** GPS the server has for a truck today (simulated trace in the prototype). */
  traceFor: (state: TruckState) => LngLat[];
}

export function createMockReports(deps: ReportsDeps): ReportsService {
  const current = () => {
    const now = deps.getSimTime();
    return deps.getTickets().map((t) => withAutoClose(t, now));
  };
  const find = (id: string) => current().find((t) => t.id === id);
  const nextId = (now: number) => ticketNumber(manilaParts(now).year, deps.nextTicketSeq());

  /** A missed-collection ticket for a street and day, created once. */
  const missedTicket = (input: {
    barangayId: string;
    routeId: string;
    streetKey: string | null;
    streetName: string | null;
    location: LngLat;
    day: number;
    source: Ticket['source'];
    verified: boolean;
    note: string;
  }): Ticket => {
    const dayKey = manilaDateKey(input.day);
    const existing = current().find(
      (t) =>
        t.category === 'MISSED' &&
        t.barangayId === input.barangayId &&
        t.missed?.day === dayKey &&
        t.missed.streetKey === input.streetKey,
    );
    if (existing) return existing;
    const now = deps.getSimTime();
    const report: NewReport = {
      category: 'MISSED',
      size: 'bags',
      photos: [],
      location: input.location,
      accuracyM: null,
      landmark: input.streetName ?? '',
      nearWaterway: false,
      nearSensitive: false,
      note: input.note,
      contact: null,
    };
    const id = nextId(now);
    let t: Ticket = {
      ...newTicket(id, report, { at: now, barangayId: input.barangayId, source: input.source }),
      missed: {
        routeId: input.routeId,
        streetKey: input.streetKey,
        streetName: input.streetName,
        day: dayKey,
      },
    };
    if (input.verified) {
      t = applyAction(t, { type: 'verify' }, { at: now, by: 'system', eventId: `${id}|verify` });
    }
    deps.saveTicket(t);
    return t;
  };

  return {
    async submit(report) {
      await wait(NETWORK_MS);
      if (!deps.isOnline()) throw new OfflineError();
      const now = deps.getSimTime();
      const barangayId = barangayAt(report.location, BARANGAYS)?.properties.id ?? null;
      const ticket = newTicket(nextId(now), report, { at: now, barangayId });
      deps.saveTicket(ticket);
      return ticket;
    },

    subscribeTickets(listener) {
      let last = '';
      const emit = () => {
        const tickets = current().sort((a, b) => b.createdAt - a.createdAt);
        const signature = tickets.map((t) => `${t.id}:${t.history.length}`).join(',');
        if (signature === last) return;
        last = signature;
        listener(tickets);
      };
      emit();
      const timer = setInterval(emit, TICK_MS);
      return () => clearInterval(timer);
    },

    async act(ticketId, action, by) {
      await wait(NETWORK_MS / 2);
      const ticket = find(ticketId);
      if (!ticket) throw new Error(`unknown ticket ${ticketId}`);
      const now = deps.getSimTime();
      const updated = applyAction(ticket, action, {
        at: now,
        by,
        eventId: `${ticketId}|${action.type}|${now}`,
      });
      deps.saveTicket(updated);
      if (action.type === 'merge') {
        // The surviving ticket records the duplicate (all reporters get its updates).
        const into = find(action.into);
        if (into) {
          deps.saveTicket({
            ...into,
            history: [
              ...into.history,
              {
                id: `${action.into}|merged-from|${ticketId}`,
                kind: 'merged',
                status: into.status,
                at: now,
                by,
                note: ticketId,
              },
            ],
          });
        }
      }
      return updated;
    },

    async checkMissed(place): Promise<ClaimResult> {
      await wait(NETWORK_MS);
      const now = deps.getSimTime();
      const occ = collectionsForBarangay(
        place.barangayId,
        deps.getSchedules(),
        ROUTES,
        SCHEDULE_EXCEPTIONS,
        now,
        14,
      );
      const today = todaysCollection(occ, now);
      if (!today) {
        return {
          kind: 'no_collection_today',
          nextStart: nextCollectionAfterToday(occ, now)?.start ?? null,
        };
      }
      const truckDef = TRUCKS.find((t) => t.id === today.truckId);
      const route = ROUTES.find((r) => r.id === today.routeId);
      const events = deps.getEvents();
      const truck = truckDef
        ? simulateTruck(truckDef, deps.getSchedules(), ROUTES, now, SCHEDULE_EXCEPTIONS, events)
        : undefined;
      const streets = route
        ? driverStreets(route).filter((s) => s.barangayId === place.barangayId)
        : [];
      const street =
        (place.streetKey ? streets.find((s) => s.key === place.streetKey) : null) ??
        (place.point && route ? nearestStreet(streets, route, place.point) : null);
      const dayEvents = events.filter(
        (e) => e.truckId === today.truckId && manilaStartOfDay(e.at) === today.day,
      );
      const mark =
        street && route ? (streetMarks(dayEvents, route.id).get(street.key) ?? null) : null;
      const trace =
        truck && truck.routeId && truck.status !== 'not_started' ? deps.traceFor(truck) : [];

      const verdict = judgeClaim({
        now,
        today,
        truck,
        route,
        street,
        point: place.point,
        trace,
        mark,
      });

      const location: LngLat =
        place.point ??
        (street && route
          ? (route.segments.find((s) => s.id === street.segmentIds[0])?.coordinates[0] ??
            BARANGAYS.features.find((f) => f.properties.id === place.barangayId)!.properties
              .labelPoint)
          : BARANGAYS.features.find((f) => f.properties.id === place.barangayId)!.properties
              .labelPoint);
      const ticketFor = (verified: boolean, note: string) =>
        missedTicket({
          barangayId: place.barangayId,
          routeId: today.routeId,
          streetKey: street?.key ?? null,
          streetName: street?.name ?? null,
          location,
          day: today.day,
          source: 'claim',
          verified,
          note,
        });

      switch (verdict.kind) {
        case 'no_collection_today':
          return { kind: 'no_collection_today', nextStart: null };
        case 'not_yet':
          return { kind: 'not_yet', arriveAt: verdict.arriveAt, truckId: today.truckId };
        case 'not_segregated':
          return verdict;
        case 'crew_not_at_fault':
          return {
            kind: 'crew_not_at_fault',
            reason: verdict.reason,
            ticketId: ticketFor(true, verdict.reason).id,
          };
        case 'verified_miss':
          return { kind: 'verified_miss', ticketId: ticketFor(true, 'gps').id };
        case 'no_gps':
          // Needs an eco-aide check: not verified yet; the data gap is visible to staff.
          return { kind: 'no_gps', ticketId: ticketFor(false, 'no_gps').id };
        case 'please_photo':
          return verdict;
      }
    },

    async scheduleRecollection(missed: MissedStreet, day: number) {
      await wait(NETWORK_MS / 2);
      const route = ROUTES.find((r) => r.id === missed.routeId);
      const seg = route?.segments.find((s) => s.id === missed.segmentIds[0]);
      const location =
        seg?.coordinates[0] ??
        BARANGAYS.features.find((f) => f.properties.id === missed.barangayId)!.properties
          .labelPoint;
      const streetKey = route
        ? (driverStreets(route).find((s) => s.segmentIds.includes(missed.segmentIds[0]))?.key ??
          null)
        : null;
      return missedTicket({
        barangayId: missed.barangayId,
        routeId: missed.routeId,
        streetKey,
        streetName: missed.name,
        location,
        day,
        source: 'enro',
        verified: true,
        note: missed.skipReason ?? missed.reason,
      });
    },
  };
}
