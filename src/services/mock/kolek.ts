/**
 * Mock KolekProvider: the rule-based Kolek, answering from the same data and functions as the
 * app screens. An LLM with retrieval can implement KolekProvider later without UI changes.
 */
import { BARANGAYS, ROUTES, SCHEDULE_EXCEPTIONS, TRUCKS } from '@/data/carmona';
import { answerKolek, type KolekFacts } from '@/features/kolek/answer';
import { understand } from '@/features/kolek/understand';
import { withAutoClose } from '@/features/reports/lifecycle';
import { DAY, manilaParts, manilaStartOfDay } from '@/lib/time';
import { simulateFleet } from '@/simulator/truckSimulator';

import type {
  CityConfig,
  DailyStats,
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
  /** Per-day collection figures (the City ENRO statistics source). */
  dailyStats: (fromDay: number, toDay: number) => Promise<DailyStats>;
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
      // Statistics questions ("ngayong buwan", "sa Milagrosa") need the period's figures.
      const asked = understand(question, BARANGAY_NAMES, previous ?? null);
      let periodStats: KolekFacts['periodStats'] = null;
      if (asked.intent === 'stats') {
        const today = manilaStartOfDay(now);
        const { day, weekday } = manilaParts(now);
        const from =
          asked.period === 'month' ? today - (day - 1) * DAY : today - ((weekday + 6) % 7) * DAY;
        periodStats = { from, daily: await deps.dailyStats(from, today) };
      }
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
        periodStats,
        myTickets: deps
          .getTickets()
          .filter((t) => context.myTicketIds.includes(t.id))
          .map((t) => withAutoClose(t, now)),
      };
      return answerKolek(question, previous ?? null, context, facts);
    },
  };
}
