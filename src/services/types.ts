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

export interface Services {
  geo: GeoService;
  fleet: FleetService;
  schedule: ScheduleService;
}
