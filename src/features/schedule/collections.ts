/**
 * Collection schedule logic: which routes run on which Manila days (including holiday moves
 * and cancellations), and the upcoming collections for a barangay. Pure and unit-tested; the
 * simulator uses the same rules so the map and the schedule never disagree.
 */
import { atManilaTime, DAY, manilaDateKey, manilaParts, manilaStartOfDay } from '@/lib/time';
import type { Route, RouteSchedule, ScheduleException, WasteType } from '@/services/types';

/** Days of schedule the resident screens (and Kolek) look ahead: two weeks. */
export const LOOKAHEAD_DAYS = 14;

const appliesTo = (e: ScheduleException, routeId: string) =>
  e.routeIds === 'all' || e.routeIds.includes(routeId);

/** Is the schedule record in force on this Manila date ("YYYY-MM-DD")? */
export const scheduleValidOn = (schedule: RouteSchedule, dateKey: string) =>
  (!schedule.validFrom || schedule.validFrom <= dateKey) &&
  (!schedule.validUntil || dateKey <= schedule.validUntil);

export type DayRunStatus =
  | { runs: true; kind: 'regular' }
  | { runs: true; kind: 'moved_in'; exception: ScheduleException }
  | { runs: false; kind: 'cancelled' | 'moved_out'; exception: ScheduleException }
  | { runs: false; kind: 'not_scheduled' };

/** Does `schedule`'s route run on the Manila day containing `dayMs`? */
export function routeRunsOnDay(
  schedule: RouteSchedule,
  dayMs: number,
  exceptions: ScheduleException[],
): DayRunStatus {
  const key = manilaDateKey(dayMs);
  if (!scheduleValidOn(schedule, key)) return { runs: false, kind: 'not_scheduled' };
  const movedIn = exceptions.find(
    (e) => e.action === 'move' && e.moveTo === key && appliesTo(e, schedule.routeId),
  );
  if (movedIn) return { runs: true, kind: 'moved_in', exception: movedIn };

  const regular = schedule.days.includes(manilaParts(dayMs).weekday);
  if (!regular) return { runs: false, kind: 'not_scheduled' };

  const changed = exceptions.find((e) => e.date === key && appliesTo(e, schedule.routeId));
  if (changed) {
    return {
      runs: false,
      kind: changed.action === 'cancel' ? 'cancelled' : 'moved_out',
      exception: changed,
    };
  }
  return { runs: true, kind: 'regular' };
}

export interface CollectionOccurrence {
  barangayId: string;
  routeId: string;
  truckId: string;
  wasteType: WasteType;
  /** Manila midnight of the day. */
  day: number;
  /** Collection window (epoch ms). */
  start: number;
  end: number;
  kind: 'regular' | 'moved_in' | 'cancelled' | 'moved_out';
  exception?: ScheduleException;
}

export const isRunning = (o: CollectionOccurrence) => o.kind === 'regular' || o.kind === 'moved_in';

/** Every collection (and holiday change) for a barangay over the next `days` days, in order. */
export function collectionsForBarangay(
  barangayId: string,
  schedules: RouteSchedule[],
  routes: Route[],
  exceptions: ScheduleException[],
  fromMs: number,
  days = 14,
): CollectionOccurrence[] {
  const served = schedules.filter((s) =>
    routes.find((r) => r.id === s.routeId)?.barangayIds.includes(barangayId),
  );
  const out: CollectionOccurrence[] = [];
  const firstDay = manilaStartOfDay(fromMs);
  for (let d = 0; d < days; d++) {
    const day = firstDay + d * DAY;
    for (const s of served) {
      const status = routeRunsOnDay(s, day, exceptions);
      if (status.kind === 'not_scheduled') continue;
      out.push({
        barangayId,
        routeId: s.routeId,
        truckId: s.truckId,
        wasteType: s.wasteType,
        day,
        start: atManilaTime(day, s.start),
        end: atManilaTime(day, s.windowEnd),
        kind: status.kind,
        exception: 'exception' in status ? status.exception : undefined,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The collection happening today (Manila), if any, even if its window has passed. */
export function todaysCollection(
  occurrences: CollectionOccurrence[],
  now: number,
): CollectionOccurrence | null {
  const today = manilaStartOfDay(now);
  return occurrences.find((o) => isRunning(o) && o.day === today) ?? null;
}

/** The next collection whose window has not yet ended. */
export function nextCollection(
  occurrences: CollectionOccurrence[],
  now: number,
): CollectionOccurrence | null {
  return occurrences.find((o) => isRunning(o) && o.end > now) ?? null;
}

/** The first running collection that starts on a later day than today. */
export function nextCollectionAfterToday(
  occurrences: CollectionOccurrence[],
  now: number,
): CollectionOccurrence | null {
  const today = manilaStartOfDay(now);
  return occurrences.find((o) => isRunning(o) && o.day > today) ?? null;
}
