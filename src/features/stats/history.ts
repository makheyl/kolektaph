/**
 * City ENRO statistics from per-day collection figures (see StatsService): totals, tonnes per
 * barangay, on-time rate, coverage per day, "SMS before the truck", reports by type, and a CSV
 * export. Pure and unit-tested.
 *
 * Definitions shown on the page:
 * - served: planned collection street length the GPS check counts as served (≥ 60% within 30 m);
 * - on time: the truck finished the barangay before the end of its collection window;
 * - SMS before truck: the "malapit na" text went out before the truck started in the barangay.
 */
import { isOpen } from '@/features/reports/priority';
import { formatClock, manilaDateKey, MINUTE } from '@/lib/time';
import type { BarangayDayStat, DailyStats, ReportCategory, Ticket } from '@/services/types';

/** A collection counts toward on-time once it is finished or its window has ended. */
const decided = (r: BarangayDayStat, now: number) => r.finishedAt != null || now >= r.windowEnd;
const onTime = (r: BarangayDayStat) => r.finishedAt != null && r.finishedAt <= r.windowEnd;

export interface StatsSummary {
  tonnes: number;
  trips: number;
  /** Collections (barangay × day) in the range. */
  collections: number;
  servedRate: number | null;
  onTimeRate: number | null;
  smsBeforeRate: number | null;
  /** Average minutes between the SMS and the truck, when the SMS came first. */
  smsLeadMinutes: number | null;
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);
const round1 = (x: number) => Math.round(x * 10) / 10;

export function summarize(stats: DailyStats, now: number): StatsSummary {
  const rows = stats.barangays;
  const collectM = rows.reduce((s, r) => s + r.collectM, 0);
  const servedM = rows.reduce((s, r) => s + r.servedM, 0);
  const done = rows.filter((r) => decided(r, now));
  const withBoth = rows.filter((r) => r.smsAt != null && r.arrivedAt != null);
  const before = withBoth.filter((r) => r.smsAt! <= r.arrivedAt!);
  return {
    tonnes: round1(stats.runs.reduce((s, r) => s + r.tonnes, 0)),
    trips: stats.runs.reduce((s, r) => s + r.trips, 0),
    collections: rows.length,
    servedRate: ratio(servedM, collectM),
    onTimeRate: ratio(done.filter(onTime).length, done.length),
    smsBeforeRate: ratio(before.length, withBoth.length),
    smsLeadMinutes: before.length
      ? Math.round(
          before.reduce((s, r) => s + (r.arrivedAt! - r.smsAt!), 0) / before.length / MINUTE,
        )
      : null,
  };
}

export interface BarangayTotals {
  barangayId: string;
  tonnes: number;
  collections: number;
  servedRate: number | null;
  onTime: number;
  /** Collections that are finished or past their window (denominator of on-time). */
  decided: number;
}

/** Totals per barangay, most tonnes first. */
export function byBarangay(stats: DailyStats, now: number): BarangayTotals[] {
  const map = new Map<string, BarangayDayStat[]>();
  for (const r of stats.barangays) map.set(r.barangayId, [...(map.get(r.barangayId) ?? []), r]);
  return [...map.entries()]
    .map(([barangayId, rows]) => {
      const done = rows.filter((r) => decided(r, now));
      return {
        barangayId,
        tonnes: round1(rows.reduce((s, r) => s + r.tonnes, 0)),
        collections: rows.length,
        servedRate: ratio(
          rows.reduce((s, r) => s + r.servedM, 0),
          rows.reduce((s, r) => s + r.collectM, 0),
        ),
        onTime: done.filter(onTime).length,
        decided: done.length,
      };
    })
    .sort((a, b) => b.tonnes - a.tonnes || a.barangayId.localeCompare(b.barangayId));
}

/** Served share of planned streets per collection day, oldest first. */
export function coverageByDay(stats: DailyStats): { day: number; servedRate: number }[] {
  const map = new Map<number, { collect: number; served: number }>();
  for (const r of stats.barangays) {
    const d = map.get(r.day) ?? { collect: 0, served: 0 };
    map.set(r.day, { collect: d.collect + r.collectM, served: d.served + r.servedM });
  }
  return [...map.entries()]
    .filter(([, v]) => v.collect > 0)
    .map(([day, v]) => ({ day, servedRate: v.served / v.collect }))
    .sort((a, b) => a.day - b.day);
}

/** Reports received in [from, to] by category, most first. */
export function ticketsByCategory(
  tickets: Ticket[],
  from: number,
  to: number,
): { category: ReportCategory; total: number; open: number }[] {
  const map = new Map<ReportCategory, { total: number; open: number }>();
  for (const t of tickets) {
    if (t.createdAt < from || t.createdAt > to) continue;
    const c = map.get(t.category) ?? { total: 0, open: 0 };
    map.set(t.category, { total: c.total + 1, open: c.open + (isOpen(t) ? 1 : 0) });
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

const csvCell = (v: string | number | null) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const clock = (t: number | null) => (t == null ? '' : formatClock(t));

/** One row per barangay collection (spreadsheet-friendly; times in Manila). */
export function statsCsv(
  stats: DailyStats,
  now: number,
  names: { barangay: (id: string) => string; truck: (id: string) => string },
): string {
  const header = [
    'date',
    'barangay',
    'route',
    'truck',
    'planned_m',
    'served_m',
    'served_pct',
    'est_tonnes',
    'truck_arrived',
    'truck_finished',
    'window_end',
    'on_time',
    'sms_sent',
    'sample_data',
  ];
  const rows = [...stats.barangays]
    .sort(
      (a, b) =>
        a.day - b.day || names.barangay(a.barangayId).localeCompare(names.barangay(b.barangayId)),
    )
    .map((r) => [
      manilaDateKey(r.day),
      names.barangay(r.barangayId),
      r.routeId,
      names.truck(r.truckId),
      r.collectM,
      r.servedM,
      r.collectM ? Math.round((r.servedM / r.collectM) * 100) : '',
      r.tonnes,
      clock(r.arrivedAt),
      clock(r.finishedAt),
      clock(r.windowEnd),
      decided(r, now) ? (onTime(r) ? 'yes' : 'no') : '',
      clock(r.smsAt),
      'yes',
    ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}
