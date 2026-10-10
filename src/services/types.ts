import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/** [longitude, latitude] */
export type LngLat = [number, number];

// ---------- Geography ----------

export interface BarangayProperties {
  id: string;
  name: string;
  altNames: string[];
  population: number | null;
  populationSource: string;
  labelPoint: LngLat;
  osmRelationId: number;
}

export type BarangayFeature = Feature<Polygon | MultiPolygon, BarangayProperties>;
export type BarangayCollection = FeatureCollection<Polygon | MultiPolygon, BarangayProperties>;

export interface CityMeta {
  bounds: [LngLat, LngLat];
  center: LngLat;
  depot: { name: string; coordinates: LngLat };
  sources: string[];
}

// ---------- Fleet and routes ----------

export interface RouteSegment {
  id: string;
  /** Street name from OpenStreetMap; null for unnamed roads. */
  name: string | null;
  barangayId: string | null;
  /** false = transit (e.g. from the depot); only `collect` segments are served. */
  collect: boolean;
  lengthM: number;
  coordinates: LngLat[];
}

export interface Route {
  id: string;
  barangayIds: string[];
  lengthM: number;
  segments: RouteSegment[];
}

export interface Truck {
  id: string;
  /** Short label shown on the map, e.g. "T2". */
  code: string;
  name: string;
}

/** 0 = Sunday … 6 = Saturday (Asia/Manila). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WasteType = 'mixed' | 'biodegradable' | 'residual' | 'recyclable';

/** When a truck runs a route. Times are Asia/Manila "HH:mm". */
export interface RouteSchedule {
  routeId: string;
  truckId: string;
  days: Weekday[];
  start: string;
  windowEnd: string;
  wasteType: WasteType;
  /** Sample simulation parameter: load fraction the route would generate (>1 means it overflows). */
  expectedLoad: number;
  /**
   * When the truck leaves the depot, if later than the window start (residents still see the
   * window, e.g. 7:00–10:00 AM, while the truck may serve other streets first).
   */
  departAt?: string;
  /**
   * First and last Manila day ("YYYY-MM-DD", inclusive) this schedule applies. Missing = no
   * limit. A schedule change ends the old record the day before and starts a new one, so past
   * days keep the schedule they actually had.
   */
  validFrom?: string;
  validUntil?: string;
}

/** A City ENRO change to a route's regular schedule, from a given day on. */
export interface ScheduleChange {
  routeId: string;
  /** First Manila day ("YYYY-MM-DD") of the new schedule. */
  from: string;
  truckId: string;
  days: Weekday[];
  start: string;
  windowEnd: string;
  wasteType: WasteType;
}

/** A holiday or one-off change to the regular schedule, on a Manila calendar date. */
export interface ScheduleException {
  /** "YYYY-MM-DD" (Asia/Manila) of the regular collection that changes. */
  date: string;
  /** Affected routes, or 'all'. */
  routeIds: string[] | 'all';
  action: 'cancel' | 'move';
  /** For 'move': the replacement date "YYYY-MM-DD". */
  moveTo?: string;
  reason: { fil: string; en: string };
}

export type TruckStatus =
  | 'off_duty'
  | 'not_started'
  | 'on_route'
  | 'full'
  | 'to_disposal'
  | 'break'
  | 'breakdown'
  | 'no_signal'
  | 'done';

export interface BarangayVisitLog {
  startedAt: number | null;
  finishedAt: number | null;
}

export interface TruckState {
  truckId: string;
  routeId: string | null;
  status: TruckStatus;
  position: LngLat | null;
  /** Index into route.segments of the segment the truck is on (or last completed). */
  segmentIndex: number;
  barangayId: string | null;
  streetName: string | null;
  /** Metres travelled along the route. */
  progressM: number;
  routeLengthM: number;
  /** 0..1 */
  load: number;
  /** Simulated time this state describes (epoch ms). */
  at: number;
  /**
   * Service log for today's route: when the truck started and finished collecting in each
   * barangay. A backend derives this from GPS; the simulator derives it from its timeline.
   */
  visits: Record<string, BarangayVisitLog>;
  /** Departure time from the depot for today's route (null when off duty). */
  departAt: number | null;
  /** Current incident, e.g. a breakdown, with its expected end. */
  incident: TruckIncident | null;
  /** Since when the truck has had its current status (departure time when on route). */
  statusSince: number | null;
  /** When the crew last reported the load (null = estimated from the distance collected). */
  loadReportedAt: number | null;
  /** Trips to the disposal site completed today. */
  trips: number;
  shift: TruckShiftInfo | null;
}

export interface TruckIncident {
  kind: IncidentKind;
  since: number;
  /** Expected time the truck moves again (estimate reported by the crew). */
  until: number;
}

/** A driver on shift in the driver app (null when the simulator stands in for the crew). */
export interface TruckShiftInfo {
  shiftId: string;
  startedAt: number;
  endedAt: number | null;
  crew: number;
}

// ---------- Truck events (driver app + demo controls) ----------

/** Statuses the driver sets with the big buttons. */
export type DriverStatus = 'on_route' | 'full' | 'to_disposal' | 'break';

/** Aberya: Sira · Flat · Baha · Sarado ang daan. */
export type IncidentKind = 'breakdown' | 'flat_tire' | 'flood' | 'road_blocked';

/** Why the crew skipped a street (HAKOT skip reasons). */
export type SkipReason = 'no_garbage' | 'not_segregated' | 'road_blocked' | 'truck_full' | 'other';

export type StreetOutcome = 'collected' | 'skipped';

interface TruckEventBase {
  /** Unique and stable, so a retried upload is never counted twice. */
  id: string;
  truckId: string;
  /** When it happened (simulated/demo time, epoch ms). */
  at: number;
  /** Reported from the driver app, or triggered from the demo controls. */
  source: 'driver' | 'demo';
  /** The driver shift it was reported in (none for a demo incident). */
  shiftId?: string;
}

/**
 * Something a truck crew reports. The simulator replays these on top of the schedule, so the
 * resident app, the alerts and the City ENRO dashboard all react to the driver's taps.
 */
export type TruckEvent = TruckEventBase &
  (
    | { kind: 'shift_start'; shiftId: string; routeId: string | null; crew: number }
    | { kind: 'shift_end'; shiftId: string }
    | { kind: 'status'; status: DriverStatus }
    /** Load the crew reports: 0.25, 0.5 or 0.75 (full is the 'full' status). */
    | { kind: 'load'; load: number }
    | { kind: 'disposal'; action: 'arrive' | 'leave' }
    | { kind: 'incident'; incident: IncidentKind; minutes: number }
    | { kind: 'incident_end' }
    /** Crew work on a special pickup (report ticket) assigned to this truck. */
    | {
        kind: 'task';
        ticketId: string;
        action: 'start' | 'done';
        before: PhotoRef | null;
        after: PhotoRef | null;
      }
    | {
        kind: 'street';
        routeId: string;
        /** Street key from driverStreets(): one entry per street, not per OSM segment. */
        streetKey: string;
        segmentIds: string[];
        outcome: StreetOutcome;
        reason: SkipReason | null;
      }
  );

export type TruckEventKind = TruckEvent['kind'];

/** A TruckEvent before the id/time/source are stamped. */
export type TruckEventInput = TruckEvent extends infer E
  ? E extends TruckEvent
    ? Omit<E, 'id' | 'at' | 'source' | 'truckId'>
    : never
  : never;

/** One GPS fix from the driver's phone (or the demo stand-in). */
export interface GpsFix {
  /** Device time of the fix (epoch ms). */
  t: number;
  lng: number;
  lat: number;
  /** Horizontal accuracy in metres, when the device reports it. */
  acc: number | null;
}

export type GpsSource = 'phone' | 'demo';

// ---------- Alerts (SMS + in-app) ----------

export type AlertKind =
  'night_before' | 'vicinity' | 'vicinity_now' | 'delay_breakdown' | 'delay_full' | 'announcement';

export interface OutboundAlert {
  /** Deterministic id, so the same alert is never sent twice. */
  id: string;
  kind: AlertKind;
  barangayIds: string[];
  sentAt: number;
  /** Exact SMS text (Filipino, like the pitch samples). */
  text: string;
  /** Registered numbers the SMS goes to (sample counts in the prototype). */
  recipients: number;
  /** SMS segments per message (1 = cheapest). */
  segments: number;
  truckId?: string;
  routeId?: string;
  /** For vicinity alerts: the estimated arrival quoted in the SMS. */
  etaAt?: number;
}

/** A message the City ENRO writes by hand in the SMS center. */
export interface Announcement {
  id: string;
  barangayIds: string[];
  text: string;
  sentAt: number;
  /** Numbers it went to, when the server recorded that at send time. */
  recipients?: number;
}

// ---------- Operations (City ENRO) ----------

/** truck_full / not_passed come from the GPS check; skipped = the crew reported a skip. */
export type MissedReason = 'truck_full' | 'not_passed' | 'skipped';

export interface MissedStreet {
  id: string;
  routeId: string;
  truckId: string;
  barangayId: string;
  name: string | null;
  segmentIds: string[];
  lengthM: number;
  reason: MissedReason;
  /** The crew's reason, when they logged the street as skipped in the driver app. */
  skipReason: SkipReason | null;
}

export interface BackupSuggestion {
  id: string;
  fullTruckId: string;
  routeId: string;
  barangayId: string;
  streetsLeft: number;
  candidateTruckId: string;
  candidateLoad: number;
  distanceM: number;
}

export interface WeeklyStats {
  /** Estimated tonnes collected this week (sample: load × truck capacity). */
  tonnes: number;
  trips: number;
  /** Share of scheduled collection streets served (0..1). */
  servedRate: number;
}

/** A driver shift as the server knows it (from uploads). */
export interface ShiftSummary {
  shiftId: string;
  truckId: string;
  routeId: string | null;
  startedAt: number;
  endedAt: number | null;
  crew: number;
  gps: { points: number; lastFixAt: number | null; source: GpsSource | null };
}

/** What staff decided on a backup-truck suggestion (the system suggests; people decide). */
export type SuggestionDecision = 'dispatched' | 'dismissed';

export interface OpsSnapshot {
  at: number;
  states: TruckState[];
  missed: MissedStreet[];
  suggestions: BackupSuggestion[];
  /** Staff decisions on suggestions, by suggestion id. */
  decisions: Record<string, { decision: SuggestionDecision; at: number }>;
  weekly: WeeklyStats;
  /** Today's truck events received so far (all trucks), oldest first. */
  events: TruckEvent[];
  /** Today's driver shifts. */
  shifts: ShiftSummary[];
}

// ---------- Driver app ----------

export interface DriverSession {
  truckId: string;
  signedInAt: number;
}

/** What the driver's phone uploads when it has signal. Uploads are idempotent. */
export interface UploadBatch {
  truckId: string;
  events: TruckEvent[];
  gps: {
    shiftId: string;
    source: GpsSource;
    /** Index of the first fix in the shift's trace, so a retried upload never duplicates. */
    fromIndex: number;
    fixes: GpsFix[];
  } | null;
}

/** What the server did with an upload. */
export interface UploadResult {
  /** Events the server now has (stored now, or already had from an earlier try). */
  accepted: string[];
  /** Events the server refused for good; the phone drops them instead of retrying. */
  rejected: { id: string; reason: string }[];
  gps: {
    /** The server holds fixes [0, nextIndex) of the shift's trace: the phone continues there. */
    nextIndex: number;
    /** Set when the server refuses this shift's GPS for good (no further GPS is sent for it). */
    blocked: string | null;
  } | null;
}

// ---------- Reports (Snap & Report, HAKOT Appendix B) ----------

/** HAKOT B.1 category codes used in KolektaPH. */
export type ReportCategory =
  | 'MISSED'
  | 'OVERFLOW'
  | 'DUMPING'
  | 'WATERWAY'
  | 'EVENT'
  | 'BULKY'
  | 'DEBRIS'
  | 'HAZARD'
  | 'ANIMAL'
  | 'BURNING';

/** 1–2 bags · pile · truckload. */
export type ReportSize = 'bags' | 'pile' | 'truckload';

/** HAKOT Figure 4 (without the AI screening step). */
export type TicketStatus =
  | 'submitted'
  | 'verified'
  | 'scheduled'
  | 'in_progress'
  | 'collected'
  | 'closed'
  | 'merged'
  | 'rejected';

/** Bundled sample pictures (labelled as samples) for sample tickets and the web demo. */
export type SamplePhotoId =
  | 'overflow'
  | 'dumping'
  | 'waterway'
  | 'event'
  | 'bulky'
  | 'animal'
  | 'hazard'
  | 'debris'
  | 'street'
  | 'clean';

/**
 * A photo: a compressed file/data URI from the camera, a bundled sample picture, or a photo
 * already stored on the server (shown through a short-lived link from the photo service).
 */
export type PhotoRef =
  | { kind: 'uri'; uri: string }
  | { kind: 'sample'; id: SamplePhotoId }
  | { kind: 'remote'; path: string };

export type TicketActor = 'resident' | 'enro' | 'driver' | 'system';

export type TicketEventKind =
  | 'submitted'
  | 'verified'
  | 'dispatched'
  | 'started'
  | 'collected'
  | 'reopened'
  | 'rated'
  | 'closed'
  | 'education'
  | 'merged'
  | 'rejected';

/** One line of a ticket's timeline: every change is time-stamped and attributed. */
export interface TicketEvent {
  id: string;
  kind: TicketEventKind;
  status: TicketStatus;
  at: number;
  by: TicketActor;
  note: string | null;
}

/** HAKOT dispatch options that lead to a pickup. */
export type DispatchMode = 'add_to_route' | 'special_pickup' | 'next_schedule';

export interface Ticket {
  /** "KPH-2026-000123" */
  id: string;
  category: ReportCategory;
  size: ReportSize;
  photos: PhotoRef[];
  location: LngLat;
  accuracyM: number | null;
  barangayId: string | null;
  landmark: string;
  nearWaterway: boolean;
  /** Within about 50 m of a school, market or health facility. */
  nearSensitive: boolean;
  note: string;
  /** resident = Snap & Report; claim = "Hindi nadaanan"; enro = re-collection from the dashboard. */
  source: 'resident' | 'claim' | 'enro';
  /** Optional mobile for status texts (E.164); shown masked. The server never returns it. */
  contact: string | null;
  /** The reporter asked for status texts (the server keeps the number with the sign-up only). */
  notify: boolean;
  createdAt: number;
  status: TicketStatus;
  history: TicketEvent[];
  dispatch: { mode: DispatchMode; truckId: string | null; due: number | null } | null;
  proof: { before: PhotoRef | null; after: PhotoRef; by: TicketActor } | null;
  mergedInto: string | null;
  rejectReason: string | null;
  rating: number | null;
  /** For missed-collection tickets: the street and day it is about. */
  missed: {
    routeId: string;
    streetKey: string | null;
    streetName: string | null;
    day: string;
  } | null;
  /** Sample ticket shipped with the prototype. */
  sample: boolean;
}

export interface NewReport {
  category: ReportCategory;
  size: ReportSize;
  photos: PhotoRef[];
  location: LngLat;
  accuracyM: number | null;
  landmark: string;
  nearWaterway: boolean;
  nearSensitive: boolean;
  note: string;
  contact: string | null;
  /**
   * A reference made on the device when the report is written, so a report sent twice (a retry
   * after a lost reply) is filed once.
   */
  clientRef?: string;
}

export type TicketAction =
  | { type: 'verify' }
  | { type: 'dispatch'; mode: DispatchMode; truckId: string | null; due: number | null }
  | { type: 'start' }
  | { type: 'collect'; before: PhotoRef | null; after: PhotoRef }
  | { type: 'education'; note: string }
  | { type: 'reject'; reason: string }
  | { type: 'merge'; into: string }
  | { type: 'reopen'; note: string }
  | { type: 'rate'; stars: number }
  | { type: 'auto_close' };

/** Where the resident lives, for "Hindi nadaanan" (kept on the device only). */
export interface ClaimPlace {
  barangayId: string;
  /** A street picked from the route list, or a point from "use my location". */
  streetKey: string | null;
  point: LngLat | null;
}

/** HAKOT §10.2 outcomes, plus "not yet" (the route is still running). */
export type ClaimResult =
  | { kind: 'no_collection_today'; nextStart: number | null }
  | { kind: 'not_yet'; arriveAt: number | null; truckId: string }
  | { kind: 'verified_miss'; ticketId: string }
  | { kind: 'not_segregated'; at: number }
  | { kind: 'crew_not_at_fault'; reason: 'truck_full' | 'road_blocked'; ticketId: string }
  | { kind: 'please_photo'; passedFrom: number | null; passedTo: number | null }
  | { kind: 'no_gps'; ticketId: string };

// ---------- City settings (City ENRO) ----------

export interface ContactInfo {
  /** As staff typed it (landline or mobile); null until the office gives one. */
  phone: string | null;
  /** Office hours or a short note, e.g. "Lunes–Biyernes, 8 AM–5 PM". */
  hours: string | null;
}

export interface CityConfig {
  /** Minutes before the truck arrives that the "ilabas na" SMS goes out (pitch: 15). */
  smsLeadMinutes: number;
  contacts: { enro: ContactInfo; barangays: Record<string, ContactInfo> };
}

export type ContactTarget = { kind: 'enro' } | { kind: 'barangay'; barangayId: string };

export type StaffRole = 'admin' | 'dispatcher' | 'viewer' | 'barangay';

/** A dashboard account (sample accounts on the sample data; City ENRO logins on the server). */
export interface StaffUser {
  id: string;
  name: string;
  role: StaffRole;
  /** For barangay focal persons: their barangay. */
  barangayId: string | null;
  active: boolean;
}

// ---------- Statistics (City ENRO) ----------

/** One route run on one day (estimated from the simulation; real data: trip logs). */
export interface RunDayStat {
  /** Manila midnight. */
  day: number;
  routeId: string;
  truckId: string;
  trips: number;
  tonnes: number;
}

/** One barangay's collection on one day. */
export interface BarangayDayStat {
  day: number;
  barangayId: string;
  routeId: string;
  truckId: string;
  /**
   * Collection street length due so far (the whole barangay once the run or its window has
   * ended; during the run, only streets the truck has reached) and the part the GPS check
   * counts as served.
   */
  collectM: number;
  servedM: number;
  /** Estimated tonnes (the run's tonnes split by served street length). */
  tonnes: number;
  windowEnd: number;
  /** When the truck started and finished collecting in the barangay (null = never). */
  arrivedAt: number | null;
  finishedAt: number | null;
  /** When the "malapit na ang truck" SMS went out (null = none). */
  smsAt: number | null;
}

export interface DailyStats {
  runs: RunDayStat[];
  barangays: BarangayDayStat[];
}

// ---------- Ask Kolek ----------

export type KolekIntent =
  | 'greeting'
  | 'thanks'
  | 'next_collection'
  | 'truck_location'
  | 'how_to_report'
  | 'emergency'
  | 'missed'
  | 'segregation'
  | 'stats'
  | 'sms_on'
  | 'sms_off'
  | 'contacts'
  | 'schedule_change'
  | 'report_status'
  | 'fees'
  | 'fallback';

/**
 * A fact inside a Kolek answer. The app formats it (times, days, names), so every number in an
 * answer comes from data and none is written into the answer texts.
 */
export type KolekValue =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'percent'; value: number }
  | { kind: 'time'; at: number }
  | { kind: 'day'; at: number }
  /** Always a calendar date ("Martes, Set 1"), never "today". */
  | { kind: 'date'; at: number }
  | { kind: 'window'; start: number; end: number }
  | { kind: 'minutes'; value: number }
  /** A barangay's name; null = a road outside any barangay. */
  | { kind: 'barangay'; id: string | null }
  | { kind: 'weekdays'; days: Weekday[] }
  | { kind: 'i18n'; key: string }
  /** Text that exists in both languages in the data (e.g. a holiday's name). */
  | { kind: 'localized'; fil: string; en: string };

export interface KolekLine {
  key: string;
  values?: Record<string, KolekValue>;
}

/** A button under an answer that opens a screen (deep link). */
export interface KolekAction {
  labelKey: string;
  href: string;
  icon: string;
}

export interface KolekReply {
  intent: KolekIntent;
  lines: KolekLine[];
  actions: KolekAction[];
  /** Follow-up suggestion chips (ids of `kolek.chips.*`). */
  suggestions: string[];
}

export interface KolekMessage {
  id: string;
  from: 'resident' | 'kolek';
  at: number;
  /** What the resident typed. */
  text?: string;
  reply?: KolekReply;
}

/** What Kolek may know about the resident: only what the app already keeps on the device. */
export interface KolekContext {
  barangayId: string | null;
  smsOn: boolean;
  /** Ticket numbers of the resident's own reports. */
  myTicketIds: string[];
}

// ---------- Newer features (accounts, private hauling, Eco Points, scanner) ----------

/**
 * Which newer features this build offers. All are on with the sample data; with the pilot
 * database each turns on once its tables and entry points exist. Screens hide what is off.
 */
export interface FeatureFlags {
  accounts: boolean;
  hauling: boolean;
  rewards: boolean;
  scanner: boolean;
}

/** What a registered resident told the City about themselves. */
export interface ResidentProfile {
  fullName: string;
  /** E.164, e.g. "+639171234567". */
  mobile: string;
  email: string | null;
  barangayId: string | null;
  /** Zone, block, phase or purok, as the resident wrote it. */
  area: string;
}

/** A device is a guest (no account, as before) or signed in to a registered account. */
export type AccountState = { status: 'guest' } | { status: 'registered'; profile: ResidentProfile };

export interface NewAccount {
  fullName: string;
  mobile: string;
  password: string;
  barangayId: string | null;
  area: string;
  email: string | null;
}

/** What the guest identity on a device holds, offered to the account it signs in to. */
export interface GuestTransferOffer {
  reports: number;
  /** The points the device holds, in total. */
  points: number;
}

export type HaulingRequester = 'resident' | 'business';
export type HaulingSlot = 'morning' | 'afternoon';
/** Small = 1 to 5 sacks, medium = half a truck, large = a full truck, unsure = the City assesses. */
export type HaulingVolume = 'small' | 'medium' | 'large' | 'unsure';
export type HaulingLoadType = 'garden' | 'construction' | 'furniture' | 'appliances' | 'general';

export type HaulingStatus =
  | 'requested'
  | 'quoted'
  | 'accepted'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'declined'
  | 'cancelled';

export type PaymentMethod = 'gcash' | 'maya' | 'card' | 'cash';

/** What the City answered: the slot it confirms and the fee, in whole pesos. */
export interface HaulingQuote {
  /** Manila midnight of the confirmed day (it may differ from the day asked for). */
  day: number;
  slot: HaulingSlot;
  volume: Exclude<HaulingVolume, 'unsure'>;
  baseFee: number;
  distanceFee: number;
  disposalFee: number;
  quotedAt: number;
  /** The quotation stands until then (24 hours). */
  validUntil: number;
}

export interface HaulingPayment {
  method: PaymentMethod;
  /** Eco Points spent on this booking and the pesos they took off. */
  pointsUsed: number;
  pointsDiscount: number;
  total: number;
  at: number;
  /** "paid" = the online payment went through; "due" = cash, handed to the crew at pickup. */
  state: 'paid' | 'due';
  /** No real money moved (every payment is a sample until a payment provider is connected). */
  sample: boolean;
}

export interface HaulingEvent {
  id: string;
  status: HaulingStatus;
  at: number;
  by: TicketActor;
  note: string | null;
}

export interface NewHaulingRequest {
  requester: HaulingRequester;
  /** For a business: its name. The contact below is then its contact person. */
  businessName: string | null;
  contactName: string;
  /** E.164. */
  contactMobile: string;
  location: LngLat;
  landmark: string;
  /** Manila midnight of the day asked for. */
  day: number;
  slot: HaulingSlot;
  volume: HaulingVolume;
  loadTypes: HaulingLoadType[];
  description: string;
  photos: PhotoRef[];
  /** A reference made on the device, so a request sent twice is filed once. */
  clientRef?: string;
}

export interface HaulingRequest extends Omit<NewHaulingRequest, 'clientRef'> {
  /** "HR-2026-000012" */
  id: string;
  barangayId: string | null;
  createdAt: number;
  status: HaulingStatus;
  quote: HaulingQuote | null;
  payment: HaulingPayment | null;
  history: HaulingEvent[];
  /** Sample request shipped with the prototype. */
  sample: boolean;
}

export type PointsEarnKind =
  'valid_report' | 'pickup_confirmed' | 'segregation_check' | 'cleanup_drive' | 'week_complete';
export type PointsSpendKind = 'redeemed' | 'hauling_discount';

/** One line of a resident's Eco Points: earned (positive) or spent (negative). */
export interface PointsEntry {
  id: string;
  kind: PointsEarnKind | PointsSpendKind;
  points: number;
  at: number;
  /** What it was for: a ticket number, a perk, a booking number. */
  ref: string | null;
}

export interface PointsTier {
  id: 'bronze' | 'silver' | 'gold';
  /** Lifetime points from which the tier is reached. */
  from: number;
}

/** What the City set (sample values until it does). */
/** The City's fees for a private-hauling booking, in whole pesos. Sample figures until it sets them. */
export interface HaulingRates {
  /** The base fee for each load size. */
  base: Record<Exclude<HaulingVolume, 'unsure'>, number>;
  /** Charged per trip, for the distance from the depot. */
  distanceFee: number;
  /** Charged per trip, for the disposal at the City's facility. */
  disposalFee: number;
  sample: boolean;
}

export interface PointsRules {
  earn: Record<PointsEarnKind, number>;
  tiers: PointsTier[];
  /** Pesos taken off a hauling fee for every 100 points spent. */
  pesosPer100: number;
}

/** One collection day of this week in the resident's barangay. */
export interface StreakDay {
  /** Manila midnight. */
  day: number;
  state: 'confirmed' | 'missed' | 'upcoming';
}

export interface PointsSummary {
  balance: number;
  /** Everything ever earned, which decides the tier. */
  lifetime: number;
  /** Newest first. */
  entries: PointsEntry[];
  week: StreakDay[];
  rules: PointsRules;
}

export type PerkGroup = 'bills' | 'stores' | 'city';

/** Something Eco Points can be exchanged for, entered by City ENRO. */
export interface Perk {
  id: string;
  title: Record<'fil' | 'en', string>;
  partner: string;
  group: PerkGroup;
  cost: number;
  /** Sample perk shipped with the prototype: not a real offer of the City or a partner. */
  sample: boolean;
}

export interface Voucher {
  id: string;
  perkId: string;
  /** Shown at the counter, e.g. "KPH-7F3K-2QXM". */
  code: string;
  issuedAt: number;
  validUntil: number;
  status: 'issued' | 'used' | 'expired';
}

/** A clean-up drive the City holds: residents who join earn points for it. */
export interface CleanupDrive {
  id: string;
  barangayId: string;
  /** The place, as the City writes it. */
  place: string;
  /** Manila time the drive starts. */
  startsAt: number;
  /** Residents who have joined so far. */
  attendees: number;
  /** A sample drive: not one the City has announced. */
  sample: boolean;
}

/** What the scanner says a photo shows, in the classes of RA 9003. */
export interface ScanResult {
  /** A common household item the guide knows, e.g. "plastic_bottle". */
  item: string;
  sortClass: 'biodegradable' | 'recyclable' | 'residual' | 'special';
  /** A sample answer, not a reading of the photo (no recognition is connected yet). */
  sample: boolean;
}

// ---------- Services (screens only talk to these) ----------

export interface GeoService {
  getBarangays(): Promise<BarangayCollection>;
  getCityMeta(): Promise<CityMeta>;
}

export interface FleetService {
  getTrucks(): Promise<Truck[]>;
  getRoutes(): Promise<Route[]>;
  /** Pushes the current state of every truck whenever it changes. Returns an unsubscribe function. */
  subscribeTruckStates(listener: (states: TruckState[]) => void): () => void;
}

export interface ScheduleService {
  getRouteSchedules(): Promise<RouteSchedule[]>;
  getExceptions(): Promise<ScheduleException[]>;
  /** City ENRO: change a route's regular schedule from a given day on. */
  updateRouteSchedule(change: ScheduleChange): Promise<RouteSchedule[]>;
}

export interface AlertsService {
  /** Every alert sent so far (automatic + announcements), newest first. */
  subscribeAlerts(listener: (alerts: OutboundAlert[]) => void): () => void;
  sendAnnouncement(input: { barangayIds: string[]; text: string }): Promise<OutboundAlert>;
  /** Registered SMS numbers per barangay. */
  getSmsRegistrations(): Promise<Record<string, number>>;
}

export interface OpsService {
  /** Live operations picture for the City ENRO dashboard. */
  subscribeOps(listener: (snapshot: OpsSnapshot) => void): () => void;
  /** GPS fixes received for a shift. */
  getTrace(shiftId: string): Promise<GpsFix[]>;
  /** Missed streets for a Manila day (by the end of that day, or up to now for today). */
  getMissedStreets(day: number): Promise<MissedStreet[]>;
  /** Records what staff decided on a backup-truck suggestion. */
  decideSuggestion(suggestion: BackupSuggestion, decision: SuggestionDecision): Promise<void>;
}

export interface ReportsService {
  /** Rejects with OfflineError without signal (the app keeps the report and retries). */
  submit(report: NewReport): Promise<Ticket>;
  /** Every ticket, newest first (staff view; residents filter to their own ids). */
  subscribeTickets(listener: (tickets: Ticket[]) => void): () => void;
  act(ticketId: string, action: TicketAction, by: TicketActor): Promise<Ticket>;
  /** "Hindi nadaanan": checks the claim against GPS and the crew's log (HAKOT §10.2). */
  checkMissed(place: ClaimPlace): Promise<ClaimResult>;
  /** City ENRO: turn a missed street into a pickup ticket (idempotent per street and day). */
  scheduleRecollection(missed: MissedStreet, day: number): Promise<Ticket>;
}

export interface AdminService {
  subscribeConfig(listener: (config: CityConfig) => void): () => void;
  setSmsLeadMinutes(minutes: number): Promise<CityConfig>;
  setContact(target: ContactTarget, info: ContactInfo): Promise<CityConfig>;
  subscribeStaff(listener: (users: StaffUser[]) => void): () => void;
  saveStaff(user: StaffUser): Promise<void>;
}

export interface StatsService {
  /** Collections from `fromDay` to `toDay` (Manila midnights, inclusive), up to now. */
  getDailyStats(fromDay: number, toDay: number): Promise<DailyStats>;
}

/** Ask Kolek. Rule-based today; an LLM with retrieval can implement the same interface. */
export interface KolekProvider {
  /** Answers the last resident message in `history`. */
  reply(history: KolekMessage[], context: KolekContext): Promise<KolekReply>;
}

export interface DriverService {
  /** Truck code + 4-digit PIN (sample accounts in the prototype). Rejects with SignInError. */
  signIn(truckId: string, pin: string): Promise<DriverSession>;
  /** Ends the phone's sign-in to its truck. Never blocks leaving: failures are ignored. */
  signOut(): Promise<void>;
  /**
   * Rejects with OfflineError when the server cannot be reached (the phone keeps the batch), or
   * with SignInError('expired') when the truck sign-in has ended (the crew enters the PIN again).
   */
  upload(batch: UploadBatch): Promise<UploadResult>;
  /**
   * The truck as the driver's phone sees it: what the server knows plus the phone's own
   * reports that are not uploaded yet, so the driver app keeps working without signal.
   */
  subscribeOwnTruck(
    truckId: string,
    getLocalEvents: () => TruckEvent[],
    listener: (state: TruckState) => void,
  ): () => void;
}

/** What a resident's device keeps on the server: only its text-alert sign-up. */
export interface ResidentService {
  /** Signs this device's number up for its barangay's texts (or moves it to a new barangay). */
  subscribeSms(mobile: string, barangayId: string): Promise<void>;
  unsubscribeSms(): Promise<void>;
  /** "Burahin ang data ko": the server forgets this device. Its reports stay, unlinked. */
  forgetMe(): Promise<void>;
}

/** The City ENRO staff member using the dashboard. */
export interface StaffSession {
  id: string;
  name: string;
  role: StaffRole;
  barangayId: string | null;
}

export type StaffAuthState =
  { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; staff: StaffSession };

export interface AuthService {
  /** False on the sample data, where the dashboard opens without a login. */
  required: boolean;
  /** Pushes the current state at once and on every change. Returns an unsubscribe function. */
  subscribe(listener: (state: StaffAuthState) => void): () => void;
  /** Rejects with ServerError ('invalid_credentials', 'not_staff') or OfflineError. */
  signIn(email: string, password: string): Promise<StaffSession>;
  signOut(): Promise<void>;
}

/** The demo controls (prototype only): the demo clock, a sample breakdown, and the reset. */
export interface DemoService {
  /** True when the clock is one shared clock on the server, which only an admin may set. */
  shared: boolean;
  jumpTo(simMs: number): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  goLive(): Promise<void>;
  /** A sample two-hour breakdown of a truck, starting now. */
  breakdown(truckId: string): Promise<void>;
  /** Back to the sample data: truck reports, tickets, announcements and City settings. */
  reset(): Promise<void>;
}

export interface PhotoService {
  /** A link (valid for a short while) to a photo stored on the server. */
  getUrl(path: string): Promise<string>;
}

/** Resident accounts. A device works without one; registering keeps what it already owns. */
export interface AccountService {
  /** Pushes the current state at once and on every change. Returns an unsubscribe function. */
  subscribe(listener: (state: AccountState) => void): () => void;
  /** Turns this device's identity into a registered account. Rejects with ServerError('mobile_taken'). */
  register(input: NewAccount): Promise<void>;
  /** Rejects with ServerError('invalid_credentials'). */
  logIn(mobile: string, password: string): Promise<void>;
  /** Back to this device's own guest identity. */
  logOut(): Promise<void>;
  saveProfile(profile: ResidentProfile): Promise<void>;
  /** Rejects with ServerError('invalid_credentials') when the current password is wrong. */
  changePassword(current: string, next: string): Promise<void>;
  /**
   * What the device held as a guest, offered once after signing in to an account. Null when
   * there is nothing to offer.
   */
  subscribeTransfer(listener: (offer: GuestTransferOffer | null) => void): () => void;
  /** Moves the offered reports, points and vouchers into the signed-in account. */
  acceptTransfer(): Promise<void>;
  /** Leaves them on the device: they come back when the account is signed out. */
  declineTransfer(): Promise<void>;
  /**
   * Sends a one-time code to the account's number. On the sample data nothing is sent: the code
   * comes back to be shown on screen. Rejects with ServerError('unknown_account').
   */
  requestRecovery(mobile: string): Promise<{ sampleCode: string | null }>;
  /** Rejects with ServerError('wrong_code'). */
  confirmRecovery(mobile: string, code: string, password: string): Promise<void>;
}

export interface HaulingService {
  /** This resident's hauling requests, newest first. */
  subscribeMine(listener: (requests: HaulingRequest[]) => void): () => void;
  /** Every request the City holds, newest first (City ENRO). A sample list in the prototype. */
  subscribeAll(listener: (requests: HaulingRequest[]) => void): () => void;
  /** The City's fees for a booking; null until the City sets them (the pilot starts empty). */
  subscribeRates(listener: (rates: HaulingRates | null) => void): () => void;
  /** Rejects with OfflineError without signal. */
  submit(request: NewHaulingRequest): Promise<HaulingRequest>;
  /** Accepts the quotation and pays, or chooses cash on pickup. */
  pay(id: string, method: PaymentMethod, pointsUsed: number): Promise<HaulingRequest>;
  /** The requester calls it off, any time before the crew sets out. */
  cancel(id: string): Promise<HaulingRequest>;
}

export interface RewardsService {
  subscribeSummary(listener: (summary: PointsSummary) => void): () => void;
  subscribePerks(listener: (perks: Perk[]) => void): () => void;
  /** This resident's vouchers, newest first. */
  subscribeVouchers(listener: (vouchers: Voucher[]) => void): () => void;
  /** The City's clean-up drives, newest first (City ENRO). Sample drives in the prototype. */
  subscribeCleanups(listener: (drives: CleanupDrive[]) => void): () => void;
  /** Looks a voucher up by its code, as the counter does. Null when there is none like it. */
  findVoucher(code: string): Promise<Voucher | null>;
  /** Exchanges points for a perk. Rejects with ServerError('not_enough_points'). */
  redeem(perkId: string): Promise<Voucher>;
}

/** The segregation scanner. A sample today; a vision model can implement the same interface. */
export interface ScannerProvider {
  /** What the photo shows and how it is segregated; null when it cannot tell. */
  classify(photo: PhotoRef): Promise<ScanResult | null>;
}

export interface Services {
  geo: GeoService;
  fleet: FleetService;
  schedule: ScheduleService;
  alerts: AlertsService;
  ops: OpsService;
  driver: DriverService;
  reports: ReportsService;
  admin: AdminService;
  stats: StatsService;
  kolek: KolekProvider;
  resident: ResidentService;
  auth: AuthService;
  demo: DemoService;
  photos: PhotoService;
  features: FeatureFlags;
  account: AccountService;
  hauling: HaulingService;
  rewards: RewardsService;
  scanner: ScannerProvider;
}
