/**
 * Database rows → the app's own types (and the driver's queue → what `driver_upload` takes).
 * Pure, so the tests can check every rule here without a server.
 *
 * The database stores each fact once (see supabase/README.md); what the app shows is put back
 * together here: a ticket's timeline from its creation time and its actions, a schedule's last
 * day from the next record's first day, a shift's start and end as the two events the simulator
 * expects.
 */
import { shiftEndId, shiftStartId } from '@/features/driver/outbox';
import { driverStreets } from '@/features/driver/streets';
import { REOPEN_WINDOW_MS } from '@/features/reports/lifecycle';
import { DAY, manilaDateKey, parseDateKey } from '@/lib/time';

import type {
  Announcement,
  CityConfig,
  DispatchMode,
  DriverStatus,
  GpsFix,
  GpsSource,
  IncidentKind,
  LngLat,
  PhotoRef,
  ReportCategory,
  ResidentProfile,
  ReportSize,
  Route,
  RouteSchedule,
  SamplePhotoId,
  SkipReason,
  StaffRole,
  StaffUser,
  StreetOutcome,
  SuggestionDecision,
  Ticket,
  TicketActor,
  TicketEvent,
  TicketStatus,
  TruckEvent,
  WasteType,
  Weekday,
} from '../types';
import type { PhotoArg } from './storage';

// ---------- Time ----------

/** "2026-10-01T16:13:07.804807+00:00" → epoch ms (any engine: at most 3 decimals are kept). */
export function parseTime(value: string): number {
  return Date.parse(value.replace(/(\.\d{3})\d+/, '$1'));
}

const parseTimeOrNull = (value: string | null | undefined) =>
  value == null ? null : parseTime(value);

/** "07:00:00" → "07:00" */
const hhmm = (value: string) => value.slice(0, 5);

// ---------- Schedules ----------

export interface ScheduleRow {
  id: number;
  route_id: string;
  truck_id: string;
  days: number[];
  start_time: string;
  window_end: string;
  depart_at: string | null;
  waste_type: WasteType;
  expected_load: number;
  valid_from: string | null;
}

export const SCHEDULE_COLUMNS =
  'id,route_id,truck_id,days,start_time,window_end,depart_at,waste_type,expected_load,valid_from';

/**
 * The database keeps only the day a record starts; it is in force until the route's next record
 * starts. The app's `validUntil` is that next start minus one day.
 */
export function mapSchedules(rows: ScheduleRow[]): RouteSchedule[] {
  const starts = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.valid_from) continue;
    starts.set(r.route_id, [...(starts.get(r.route_id) ?? []), r.valid_from].sort());
  }
  return [...rows]
    .sort((a, b) => a.id - b.id)
    .map((r) => {
      const next = (starts.get(r.route_id) ?? []).find((d) => !r.valid_from || d > r.valid_from);
      return {
        routeId: r.route_id,
        truckId: r.truck_id,
        days: [...r.days].sort() as Weekday[],
        start: hhmm(r.start_time),
        windowEnd: hhmm(r.window_end),
        wasteType: r.waste_type,
        expectedLoad: Number(r.expected_load),
        ...(r.depart_at ? { departAt: hhmm(r.depart_at) } : {}),
        ...(r.valid_from ? { validFrom: r.valid_from } : {}),
        ...(next ? { validUntil: manilaDateKey(parseDateKey(next) - DAY) } : {}),
      };
    });
}

// ---------- Shifts and truck events ----------

export interface ShiftRow {
  id: string;
  truck_id: string;
  route_id: string | null;
  crew: number;
  gps_source: GpsSource | null;
  started_at: string;
  ended_at: string | null;
}

export const SHIFT_COLUMNS = 'id,truck_id,route_id,crew,gps_source,started_at,ended_at';

export interface Shift {
  id: string;
  truckId: string;
  routeId: string | null;
  crew: number;
  gpsSource: GpsSource | null;
  startedAt: number;
  endedAt: number | null;
}

export const mapShift = (r: ShiftRow): Shift => ({
  id: r.id,
  truckId: r.truck_id,
  routeId: r.route_id,
  crew: r.crew,
  gpsSource: r.gps_source,
  startedAt: parseTime(r.started_at),
  endedAt: parseTimeOrNull(r.ended_at),
});

/** A truck event as `pulse` sends it: only the columns of its kind, time in epoch ms. */
export interface EventRow {
  seq: number;
  id: string;
  truck_id: string;
  shift_id?: string;
  at: number;
  kind: 'status' | 'load' | 'disposal' | 'incident' | 'incident_end' | 'street';
  status?: DriverStatus;
  load?: number;
  disposal_action?: 'arrive' | 'leave';
  incident?: IncidentKind;
  incident_minutes?: number;
  street_key?: string;
  street_outcome?: StreetOutcome;
  skip_reason?: SkipReason;
}

const streetCache = new Map<string, Map<string, { name: string | null; segmentIds: string[] }>>();

/** A route's streets by key (the same keys the driver app and the database use). */
function streetsOf(route: Route) {
  let byKey = streetCache.get(route.id);
  if (!byKey) {
    byKey = new Map(
      driverStreets(route).map((s) => [s.key, { name: s.name, segmentIds: s.segmentIds }]),
    );
    streetCache.set(route.id, byKey);
  }
  return byKey;
}

/**
 * Everything the simulator replays, oldest first: shift starts and ends (stored as columns of
 * the shift), the crew's taps and demo incidents, and crew work on pickups (stored as ticket
 * actions). A street tap whose shift is not known yet is left out until the shift arrives.
 */
export function buildTruckEvents(
  rows: EventRow[],
  shifts: Shift[],
  routes: Route[],
  tasks: TruckEvent[],
): TruckEvent[] {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const out: TruckEvent[] = [];

  for (const s of shifts) {
    const base = { truckId: s.truckId, source: 'driver' as const, shiftId: s.id };
    out.push({
      ...base,
      id: shiftStartId(s.id),
      at: s.startedAt,
      kind: 'shift_start',
      routeId: s.routeId,
      crew: s.crew,
    });
    if (s.endedAt != null) {
      out.push({ ...base, id: shiftEndId(s.id), at: s.endedAt, kind: 'shift_end' });
    }
  }

  for (const r of rows) {
    const base = {
      id: r.id,
      truckId: r.truck_id,
      at: r.at,
      // A row with no shift is an incident triggered from the demo controls.
      source: r.shift_id ? ('driver' as const) : ('demo' as const),
      ...(r.shift_id ? { shiftId: r.shift_id } : {}),
    };
    switch (r.kind) {
      case 'status':
        if (r.status) out.push({ ...base, kind: 'status', status: r.status });
        break;
      case 'load':
        if (r.load != null) out.push({ ...base, kind: 'load', load: Number(r.load) });
        break;
      case 'disposal':
        if (r.disposal_action) out.push({ ...base, kind: 'disposal', action: r.disposal_action });
        break;
      case 'incident':
        if (r.incident && r.incident_minutes != null) {
          out.push({
            ...base,
            kind: 'incident',
            incident: r.incident,
            minutes: r.incident_minutes,
          });
        }
        break;
      case 'incident_end':
        out.push({ ...base, kind: 'incident_end' });
        break;
      case 'street': {
        const routeId = r.shift_id ? shiftById.get(r.shift_id)?.routeId : null;
        const route = routes.find((x) => x.id === routeId);
        const street = route && r.street_key ? streetsOf(route).get(r.street_key) : undefined;
        if (!route || !street || !r.street_key || !r.street_outcome) break;
        out.push({
          ...base,
          kind: 'street',
          routeId: route.id,
          streetKey: r.street_key,
          segmentIds: street.segmentIds,
          outcome: r.street_outcome,
          reason: r.skip_reason ?? null,
        });
        break;
      }
    }
  }

  out.push(...tasks);
  // Stable: events of the same moment keep the order above (a shift start before its taps).
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map((x) => x.e);
}

// ---------- Tickets ----------

export interface TicketEventRow {
  id: number;
  kind:
    | 'verified'
    | 'dispatched'
    | 'started'
    | 'collected'
    | 'education'
    | 'rejected'
    | 'merged'
    | 'reopened'
    | 'rated';
  at: string;
  actor: TicketActor;
  truck_id: string | null;
  note: string | null;
  client_event_id: string | null;
}

export interface TicketPhotoRow {
  event_id: number | null;
  slot: 'wide' | 'close' | 'before' | 'after';
  storage_path: string | null;
  sample_id: SamplePhotoId | null;
}

export interface TicketRow {
  id: string;
  category: ReportCategory;
  size: ReportSize;
  location: { coordinates: [number, number] };
  accuracy_m: number | null;
  barangay_id: string;
  landmark: string | null;
  near_waterway: boolean;
  near_sensitive: boolean;
  note: string | null;
  notify: boolean;
  created_at: string;
  status: TicketStatus;
  dispatch_mode: DispatchMode | null;
  dispatch_truck_id: string | null;
  dispatch_due: string | null;
  merged_into: string | null;
  rating: number | null;
  missed_route_id: string | null;
  missed_street_key: string | null;
  missed_day: string | null;
  missed_basis: string | null;
  is_sample: boolean;
  source: Ticket['source'];
  ticket_events: TicketEventRow[];
  ticket_photos: TicketPhotoRow[];
}

/** Named columns only: the "who did it" columns are not readable through the API. */
export const TICKET_SELECT =
  'id,category,size,location,accuracy_m,barangay_id,landmark,near_waterway,near_sensitive,note,' +
  'notify,created_at,status,dispatch_mode,dispatch_truck_id,dispatch_due,merged_into,rating,' +
  'missed_route_id,missed_street_key,missed_day,missed_basis,is_sample,source,' +
  'ticket_events(id,kind,at,actor,truck_id,note,client_event_id),' +
  'ticket_photos(event_id,slot,storage_path,sample_id)';

const photoRef = (p: TicketPhotoRow): PhotoRef | null =>
  p.sample_id
    ? { kind: 'sample', id: p.sample_id }
    : p.storage_path
      ? { kind: 'remote', path: p.storage_path }
      : null;

const byTimeThenId = (a: TicketEventRow, b: TicketEventRow) =>
  parseTime(a.at) - parseTime(b.at) || a.id - b.id;

/**
 * One ticket as the app knows it. The timeline is rebuilt from what is stored:
 * "submitted" is the ticket's own creation time; a dispatch of an unverified ticket also
 * verified it; a rating after the 48-hour window means the ticket had closed on its own.
 */
export function mapTicket(row: TicketRow, routes: Route[]): Ticket {
  const createdAt = parseTime(row.created_at);
  const events = [...row.ticket_events].sort(byTimeThenId);
  const history: TicketEvent[] = [
    {
      id: `${row.id}|submitted`,
      kind: 'submitted',
      status: 'submitted',
      at: createdAt,
      by: row.source === 'enro' ? 'enro' : 'resident',
      note: null,
    },
  ];
  // (Typed loosely on purpose: `add` below changes it, which flow analysis cannot follow.)
  let status = 'submitted' as TicketStatus;
  let collectedAt: number | null = null;
  let rejectReason: string | null = null;
  let proofEvent: TicketEventRow | null = null;

  for (const e of events) {
    const at = parseTime(e.at);
    const id = e.client_event_id ?? `${row.id}|${e.id}`;
    const add = (kind: TicketEvent['kind'], next: TicketStatus, note: string | null = null) => {
      status = next;
      history.push({ id, kind, status: next, at, by: e.actor, note });
    };
    switch (e.kind) {
      case 'verified':
        add('verified', 'verified');
        break;
      case 'dispatched':
        if (status === 'submitted') add('verified', 'verified');
        status = 'scheduled';
        history.push({
          id: `${id}|dispatch`,
          kind: 'dispatched',
          status,
          at,
          by: e.actor,
          note: row.dispatch_mode,
        });
        break;
      case 'started':
        add('started', 'in_progress');
        break;
      case 'collected':
        add('collected', 'collected');
        collectedAt = at;
        proofEvent = e;
        break;
      case 'education':
        add('education', 'closed', e.note);
        break;
      case 'rejected':
        add('rejected', 'rejected', e.note);
        rejectReason = e.note;
        break;
      case 'merged':
        add('merged', 'merged', row.merged_into);
        break;
      case 'reopened':
        add('reopened', 'scheduled', e.note);
        break;
      case 'rated':
        if (status === 'collected' && collectedAt != null && at - collectedAt > REOPEN_WINDOW_MS) {
          history.push({
            id: `${row.id}|auto_close|${collectedAt}`,
            kind: 'closed',
            status: 'closed',
            at: collectedAt + REOPEN_WINDOW_MS + 1,
            by: 'system',
            note: null,
          });
        }
        add('rated', 'closed', row.rating == null ? null : String(row.rating));
        break;
    }
  }

  const ticketPhotos = row.ticket_photos.filter((p) => p.event_id == null);
  const photos = (['wide', 'close'] as const).flatMap((slot) => {
    const ref = ticketPhotos.find((p) => p.slot === slot);
    const photo = ref ? photoRef(ref) : null;
    return photo ? [photo] : [];
  });

  let proof: Ticket['proof'] = null;
  const lastCollected = proofEvent as TicketEventRow | null;
  if (lastCollected) {
    const of = (slot: 'before' | 'after') => {
      const p = row.ticket_photos.find((x) => x.event_id === lastCollected.id && x.slot === slot);
      return p ? photoRef(p) : null;
    };
    const after = of('after');
    if (after) proof = { before: of('before'), after, by: lastCollected.actor };
  }

  const route = routes.find((r) => r.id === row.missed_route_id);
  const streetName =
    route && row.missed_street_key
      ? (streetsOf(route).get(row.missed_street_key)?.name ?? null)
      : null;
  const missed =
    row.missed_day && row.missed_route_id
      ? {
          routeId: row.missed_route_id,
          streetKey: row.missed_street_key,
          streetName,
          day: row.missed_day,
        }
      : null;

  return {
    id: row.id,
    category: row.category,
    size: row.size,
    photos,
    location: [row.location.coordinates[0], row.location.coordinates[1]] as LngLat,
    accuracyM: row.accuracy_m,
    barangayId: row.barangay_id,
    // A missed-collection ticket is about a street: show it where a landmark would be.
    landmark: row.landmark ?? (missed ? (streetName ?? '') : ''),
    nearWaterway: row.near_waterway,
    nearSensitive: row.near_sensitive,
    // For a missed-collection ticket: why it was filed (the same codes the sample data uses).
    note: row.note ?? row.missed_basis ?? '',
    source: row.source,
    contact: null,
    notify: row.notify,
    createdAt,
    // The stored status is the truth; the rebuilt timeline always ends on it.
    status: row.status,
    history,
    dispatch: row.dispatch_mode
      ? {
          mode: row.dispatch_mode,
          truckId: row.dispatch_truck_id,
          due: parseTimeOrNull(row.dispatch_due),
        }
      : null,
    proof,
    mergedInto: row.merged_into,
    rejectReason,
    rating: row.rating,
    missed,
    sample: row.is_sample,
  };
}

/** A crew's work on a pickup, as the truck event the City ENRO timeline shows. */
function taskEvents(row: TicketRow): TruckEvent[] {
  if (row.is_sample) return [];
  return row.ticket_events.flatMap((e): TruckEvent[] => {
    if (e.actor !== 'driver' || !e.truck_id || (e.kind !== 'started' && e.kind !== 'collected')) {
      return [];
    }
    const photo = (slot: 'before' | 'after') => {
      const p = row.ticket_photos.find((x) => x.event_id === e.id && x.slot === slot);
      return p ? photoRef(p) : null;
    };
    const done = e.kind === 'collected';
    return [
      {
        id: e.client_event_id ?? `${row.id}|${e.id}`,
        truckId: e.truck_id,
        at: parseTime(e.at),
        source: 'driver',
        kind: 'task',
        ticketId: row.id,
        action: done ? 'done' : 'start',
        before: done ? photo('before') : null,
        after: done ? photo('after') : null,
      },
    ];
  });
}

/**
 * Every visible ticket, newest first, plus the crew task events found in them. A ticket that
 * duplicates were merged into gets a line for each of them (the merge itself is stored once,
 * on the duplicate).
 */
export function mapTickets(
  rows: TicketRow[],
  routes: Route[],
): { tickets: Ticket[]; tasks: TruckEvent[] } {
  const tickets = rows.map((r) => mapTicket(r, routes));
  const byId = new Map(tickets.map((t) => [t.id, t]));
  for (const dup of tickets) {
    const into = dup.mergedInto ? byId.get(dup.mergedInto) : undefined;
    const merge = dup.history.find((h) => h.kind === 'merged');
    if (!into || !merge) continue;
    const before = into.history.filter((h) => h.at <= merge.at);
    const line: TicketEvent = {
      id: `${into.id}|merged-from|${dup.id}`,
      kind: 'merged',
      // The surviving ticket's status does not change: the line carries the status it had.
      status: before[before.length - 1]?.status ?? 'submitted',
      at: merge.at,
      by: merge.by,
      note: dup.id,
    };
    into.history = [...before, line, ...into.history.slice(before.length)];
  }
  return {
    tickets: tickets.sort((a, b) => b.createdAt - a.createdAt),
    tasks: rows.flatMap(taskEvents).sort((a, b) => a.at - b.at),
  };
}

// ---------- City settings ----------

export interface AnnouncementRow {
  id: number;
  body: string;
  sent_at: string;
  recipient_count: number;
  announcement_barangays: { barangay_id: string }[];
}

export const ANNOUNCEMENT_SELECT =
  'id,body,sent_at,recipient_count,announcement_barangays(barangay_id)';

export const announcementId = (id: number | string) => `announcement|${id}`;

export const mapAnnouncement = (r: AnnouncementRow): Announcement => ({
  id: announcementId(r.id),
  barangayIds: r.announcement_barangays.map((b) => b.barangay_id).sort(),
  text: r.body,
  sentAt: parseTime(r.sent_at),
  recipients: r.recipient_count,
});

export interface LeadRow {
  effective_at: string;
  minutes: number;
}

export const mapLeadChanges = (rows: LeadRow[]) =>
  rows
    .map((r) => ({ at: parseTime(r.effective_at), minutes: r.minutes }))
    .sort((a, b) => a.at - b.at);

export interface ContactRow {
  barangay_id: string | null;
  phone: string | null;
  hours: string | null;
}

/** A row exists only when an office has something to show; the rest are simply empty. */
export function mapContacts(rows: ContactRow[]): CityConfig['contacts'] {
  const contacts: CityConfig['contacts'] = { enro: { phone: null, hours: null }, barangays: {} };
  for (const r of rows) {
    const info = { phone: r.phone, hours: r.hours };
    if (r.barangay_id == null) contacts.enro = info;
    else contacts.barangays[r.barangay_id] = info;
  }
  return contacts;
}

export interface DecisionRow {
  service_day: string;
  route_id: string;
  decision: SuggestionDecision;
  decided_at: string;
}

/** Keyed like the app's suggestion ids ("backup|<day>|<route>", see features/load/backup.ts). */
export const suggestionId = (day: string, routeId: string) => `backup|${day}|${routeId}`;

export function mapDecisions(
  rows: DecisionRow[],
): Record<string, { decision: SuggestionDecision; at: number }> {
  return Object.fromEntries(
    rows.map((r) => [
      suggestionId(r.service_day, r.route_id),
      { decision: r.decision, at: parseTime(r.decided_at) },
    ]),
  );
}

export interface StaffRow {
  user_id: string;
  name: string;
  role: StaffRole;
  barangay_id: string | null;
  active: boolean;
}

export const STAFF_COLUMNS = 'user_id,name,role,barangay_id,active';

export const mapStaff = (r: StaffRow): StaffUser => ({
  id: r.user_id,
  name: r.name,
  role: r.role,
  barangayId: r.barangay_id,
  active: r.active,
});

// ---------- GPS ----------

export interface GpsBatchRow {
  from_index: number;
  t0: string;
  dt_ms: number[];
  lng_e6: number[];
  lat_e6: number[];
  acc_m: (number | null)[];
}

export const GPS_COLUMNS = 'from_index,t0,dt_ms,lng_e6,lat_e6,acc_m';

/** One upload is stored as packed arrays: fix i is at t0 + dt_ms[i], position / 1e6. */
export function unpackGps(rows: GpsBatchRow[]): GpsFix[] {
  return [...rows]
    .sort((a, b) => a.from_index - b.from_index)
    .flatMap((b) => {
      const t0 = parseTime(b.t0);
      return b.dt_ms.map((dt, i) => ({
        t: t0 + dt,
        lng: b.lng_e6[i] / 1e6,
        lat: b.lat_e6[i] / 1e6,
        acc: b.acc_m[i] ?? null,
      }));
    });
}

// ---------- The driver's queue → driver_upload ----------

/**
 * One queued event as `driver_upload` takes it (see supabase/migrations/…_driver_upload.sql).
 * `photos` holds the already-uploaded pictures of a task event.
 */
export function toUploadEvent(
  e: TruckEvent,
  shiftId: string | null,
  photos: { before: PhotoArg | null; after: PhotoArg | null } | null = null,
): Record<string, unknown> {
  const base = { id: e.id, kind: e.kind, at: Math.round(e.at), shift_id: e.shiftId ?? shiftId };
  switch (e.kind) {
    case 'shift_start':
      return { ...base, route_id: e.routeId, crew: e.crew };
    case 'shift_end':
    case 'incident_end':
      return base;
    case 'status':
      return { ...base, status: e.status };
    case 'load':
      return { ...base, load: e.load };
    case 'disposal':
      return { ...base, action: e.action };
    case 'incident':
      return { ...base, incident: e.incident, minutes: e.minutes };
    case 'street':
      return { ...base, street_key: e.streetKey, outcome: e.outcome, reason: e.reason };
    case 'task':
      return {
        ...base,
        ticket_id: e.ticketId,
        action: e.action,
        before: photos?.before ?? null,
        after: photos?.after ?? null,
      };
  }
}

/** The profile the server answers for a registered resident; null for a guest or no answer. */
export function profileFromRpc(raw: unknown): ResidentProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const nullable = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    fullName: text(r.fullName),
    mobile: text(r.mobile),
    email: nullable(r.email),
    barangayId: nullable(r.barangayId),
    area: text(r.area),
  };
}
