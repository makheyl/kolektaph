/**
 * Alert engine: decides which SMS / in-app alerts go out, to which barangay, and when.
 *
 * Rules (pitch slide 12 + Q&A):
 * - Night-before reminder at 6:00 PM for every barangay collected the next day.
 * - Vicinity alert once the truck is VICINITY_MINUTES (15) or less from a barangay, sent to that
 *   barangay only, once per barangay per day. If the truck is already collecting there when
 *   first observed, a "nandiyan na" variant goes out instead.
 * - Delay alerts: truck breakdown (with the new estimated time) and truck full with the
 *   barangay unfinished. Once per barangay per incident.
 *
 * `AlertEngine` is the stateful evaluator a backend would run on every GPS update. The
 * prototype replays it over the deterministic simulation (`operationalAlerts`), so the alert
 * log is the same whenever the demo clock jumps around.
 */
import { routeRunsOnDay } from '@/features/schedule/collections';
import { barangayVisit, VICINITY_MINUTES } from '@/features/tracking/eta';
import { atManilaTime, DAY, formatClock, manilaDateKey, manilaParts, MINUTE } from '@/lib/time';
import type {
  OutboundAlert,
  Route,
  RouteSchedule,
  ScenarioEvent,
  ScheduleException,
  Truck,
  TruckState,
} from '@/services/types';
import { simulateTruck } from '@/simulator/truckSimulator';

import { smsInfo, smsTimeRange } from './sms';
import { sms } from './templates';

export interface EngineContext {
  schedules: RouteSchedule[];
  routes: Route[];
  exceptions: ScheduleException[];
  trucks: Truck[];
  events: ScenarioEvent[];
  registrations: Record<string, number>;
  barangayName: (id: string) => string;
  /** Filipino weekday names, 0 = Linggo. */
  weekdayFil: (weekday: number) => string;
}

const NIGHT_BEFORE_AT = '18:00';
const REPLAY_STEP_MS = 10_000;

/**
 * SMS quote arrival to the nearest 5 minutes ("~7:40 AM"): residents don't need minute
 * precision in a text, and the "~" signals an estimate. The app shows exact minutes.
 */
export const roundToFiveMinutes = (t: number) => Math.round(t / (5 * MINUTE)) * 5 * MINUTE;

function alert(
  ctx: EngineContext,
  a: Omit<OutboundAlert, 'recipients' | 'segments'>,
): OutboundAlert {
  return {
    ...a,
    recipients: a.barangayIds.reduce((sum, b) => sum + (ctx.registrations[b] ?? 0), 0),
    segments: smsInfo(a.text).segments,
  };
}

/** 6:00 PM reminders on `day` for collections on the next day. */
export function nightBeforeAlerts(ctx: EngineContext, day: number): OutboundAlert[] {
  const tomorrow = day + DAY;
  const out: OutboundAlert[] = [];
  for (const s of ctx.schedules) {
    const run = routeRunsOnDay(s, tomorrow, ctx.exceptions);
    if (!run.runs) continue;
    const route = ctx.routes.find((r) => r.id === s.routeId);
    const range = smsTimeRange(
      atManilaTime(tomorrow, s.start),
      atManilaTime(tomorrow, s.windowEnd),
    );
    const weekday = ctx.weekdayFil(manilaParts(tomorrow).weekday);
    for (const b of route?.barangayIds ?? []) {
      const barangay = ctx.barangayName(b);
      out.push(
        alert(ctx, {
          id: `night|${manilaDateKey(tomorrow)}|${b}`,
          kind: 'night_before',
          barangayIds: [b],
          sentAt: atManilaTime(day, NIGHT_BEFORE_AT),
          text:
            run.kind === 'moved_in'
              ? sms.nightBeforeMoved({ weekday, range, barangay, reason: run.exception.reason.fil })
              : sms.nightBefore({ weekday, range, barangay }),
          routeId: s.routeId,
          truckId: s.truckId,
        }),
      );
    }
  }
  return out;
}

/** Stateful evaluator: feed it truck observations in time order; it returns new alerts. */
export class AlertEngine {
  private sent = new Set<string>();

  constructor(private ctx: EngineContext) {}

  observe(now: number, truck: TruckState, route: Route): OutboundAlert[] {
    const out: OutboundAlert[] = [];
    const dateKey = manilaDateKey(now);
    const send = (key: string, a: Omit<OutboundAlert, 'recipients' | 'segments' | 'id'>) => {
      if (this.sent.has(key)) return;
      this.sent.add(key);
      out.push(alert(this.ctx, { ...a, id: key }));
    };

    for (const b of route.barangayIds) {
      const visit = barangayVisit(route, truck, b, now);
      if (!visit || visit.state === 'passed') continue;
      const barangay = this.ctx.barangayName(b);
      const base = { barangayIds: [b], sentAt: now, truckId: truck.truckId, routeId: route.id };

      // Vicinity: once per barangay per day.
      const vKey = `vicinity|${dateKey}|${b}`;
      const moving = truck.status === 'on_route' || truck.status === 'not_started';
      if (moving && visit.state === 'upcoming' && visit.arriveAt != null) {
        const minutes = Math.ceil((visit.arriveAt - now) / MINUTE);
        if (minutes <= VICINITY_MINUTES) {
          send(vKey, {
            ...base,
            kind: 'vicinity',
            etaAt: visit.arriveAt,
            text: sms.vicinity({
              barangay,
              minutes: Math.max(1, minutes),
              eta: formatClock(roundToFiveMinutes(visit.arriveAt)),
            }),
          });
        }
      } else if (truck.status === 'on_route' && visit.state === 'in_progress') {
        send(vKey, { ...base, kind: 'vicinity_now', text: sms.vicinityNow({ barangay }) });
      }

      // Delay: truck full before finishing this barangay.
      if (truck.status === 'full') {
        send(`full|${dateKey}|${b}`, {
          ...base,
          kind: 'delay_full',
          text: sms.delayFull({ barangay }),
        });
      }

      // Delay: breakdown, quoting when the truck should reach (or resume in) the barangay.
      if (truck.status === 'breakdown' && truck.incident) {
        const time =
          visit.state === 'upcoming' && visit.arriveAt != null
            ? visit.arriveAt
            : truck.incident.until;
        send(`breakdown|${dateKey}|${b}|${truck.incident.since}`, {
          ...base,
          kind: 'delay_breakdown',
          text: sms.delayBreakdown({ barangay, time: formatClock(time) }),
        });
      }
    }
    return out;
  }
}

/**
 * Replays a whole collection day through the engine, returning every operational alert
 * (vicinity + delays) with the time it would be sent. Deterministic for a given context.
 */
export function operationalAlerts(ctx: EngineContext, day: number): OutboundAlert[] {
  const running = ctx.schedules.filter((s) => routeRunsOnDay(s, day, ctx.exceptions).runs);
  if (!running.length) return [];
  const engine = new AlertEngine(ctx);
  const out: OutboundAlert[] = [];

  for (const s of running) {
    const truck = ctx.trucks.find((t) => t.id === s.truckId);
    const route = ctx.routes.find((r) => r.id === s.routeId);
    if (!truck || !route) continue;
    // From 30 minutes before departure until the truck is finished (or late evening).
    const from = atManilaTime(day, s.departAt ?? s.start) - 30 * MINUTE;
    const until = atManilaTime(day, '21:00');
    for (let t = from; t <= until; t += REPLAY_STEP_MS) {
      const state = simulateTruck(truck, ctx.schedules, ctx.routes, t, ctx.exceptions, ctx.events);
      out.push(...engine.observe(t, state, route));
      if (state.status === 'done' || state.status === 'full') break;
    }
  }
  return out;
}

/** Every automatic alert sent on Manila days [fromDay, toDay], oldest first. */
export function alertLog(ctx: EngineContext, fromDay: number, toDay: number): OutboundAlert[] {
  const out: OutboundAlert[] = [];
  for (let d = fromDay; d <= toDay; d += DAY) {
    out.push(...nightBeforeAlerts(ctx, d), ...operationalAlerts(ctx, d));
  }
  return out.sort((a, b) => a.sentAt - b.sentAt);
}
