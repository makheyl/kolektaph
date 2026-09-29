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
}

export interface TruckIncident {
  kind: 'breakdown';
  since: number;
  /** Expected time the truck moves again (estimate reported by the crew). */
  until: number;
}

/**
 * Something that happens to a truck. Drivers report these in the driver app (Sprint S4);
 * in the demo they are triggered from the demo controls.
 */
export interface ScenarioEvent {
  id: string;
  kind: 'breakdown';
  truckId: string;
  at: number;
  minutes: number;
}

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

export type MissedReason = 'truck_full' | 'not_passed';

export interface MissedStreet {
  id: string;
  routeId: string;
  truckId: string;
  barangayId: string;
  name: string | null;
  segmentIds: string[];
  lengthM: number;
  reason: MissedReason;
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

export interface OpsSnapshot {
  at: number;
  states: TruckState[];
  missed: MissedStreet[];
  suggestions: BackupSuggestion[];
  weekly: WeeklyStats;
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
}

export interface Services {
  geo: GeoService;
  fleet: FleetService;
  schedule: ScheduleService;
  alerts: AlertsService;
  ops: OpsService;
}
