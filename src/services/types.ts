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

export interface OpsSnapshot {
  at: number;
  states: TruckState[];
  missed: MissedStreet[];
  suggestions: BackupSuggestion[];
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
}

export interface DriverService {
  /** Truck code + 4-digit PIN (sample accounts in the prototype). Rejects with SignInError. */
  signIn(truckId: string, pin: string): Promise<DriverSession>;
  /** Rejects with OfflineError when the server cannot be reached; the phone keeps the batch. */
  upload(batch: UploadBatch): Promise<void>;
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

export interface Services {
  geo: GeoService;
  fleet: FleetService;
  schedule: ScheduleService;
  alerts: AlertsService;
  ops: OpsService;
  driver: DriverService;
}
