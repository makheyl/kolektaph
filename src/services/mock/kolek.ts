/**
 * Mock KolekProvider: the rule-based Kolek, answering from the same data and functions as the
 * app screens. An LLM with retrieval can implement KolekProvider later without UI changes.
 */
import { BARANGAYS, ROUTES, SCHEDULE_EXCEPTIONS, TRUCKS } from '@/data/carmona';
import { answerKolek, type KolekFacts } from '@/features/kolek/answer';
import { withAutoClose } from '@/features/reports/lifecycle';
import { simulateFleet } from '@/simulator/truckSimulator';

import type {
  CityConfig,
  KolekProvider,
  RouteSchedule,
  Ticket,
  TruckEvent,
  WeeklyStats,
} from '../types';

/** A short pause so the answer doesn't appear before the question has settled on screen. */
const THINK_MS = 350;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface KolekDeps {
  getSimTime: () => number;
  getEvents: () => TruckEvent[];
  getSchedules: () => RouteSchedule[];
  getTickets: () => Ticket[];
  getContacts: () => CityConfig['contacts'];
  leadAt: (at: number) => number;
  /** This week's figures (computed only when someone asks). */
  weekly: () => WeeklyStats;
}

const BARANGAY_NAMES = BARANGAYS.features.map(({ properties: p }) => ({
  id: p.id,
  name: p.name,
  altNames: p.altNames,
}));

export function createMockKolek(deps: KolekDeps): KolekProvider {
  return {
    async reply(history, context) {
      await wait(THINK_MS);
      const latestFirst = [...history].reverse();
      const question = latestFirst.find((m) => m.from === 'resident')?.text ?? '';
      const previous = latestFirst.find((m) => m.from === 'kolek' && m.reply)?.reply?.intent;
      const now = deps.getSimTime();
      const schedules = deps.getSchedules();
      const facts: KolekFacts = {
        now,
        barangays: BARANGAY_NAMES,
        schedules,
        routes: ROUTES,
        exceptions: SCHEDULE_EXCEPTIONS,
        states: simulateFleet(
          TRUCKS,
          schedules,
          ROUTES,
          now,
          SCHEDULE_EXCEPTIONS,
          deps.getEvents(),
        ),
        leadMinutes: deps.leadAt(now),
        get weekly() {
          return deps.weekly();
        },
        contacts: deps.getContacts(),
        myTickets: deps
          .getTickets()
          .filter((t) => context.myTicketIds.includes(t.id))
          .map((t) => withAutoClose(t, now)),
      };
      return answerKolek(question, previous ?? null, context, facts);
    },
  };
}
