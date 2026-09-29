/**
 * Carmona sample data. Boundaries and populations are real (OpenStreetMap / PSA 2024);
 * trucks, routes and schedules are SAMPLE data until validated with the City ENRO.
 * Regenerate the JSON fixtures with `node scripts/data/build-carmona-data.mjs`.
 */
import type {
  BarangayCollection,
  CityMeta,
  Route,
  RouteSchedule,
  ScheduleException,
  Truck,
} from '@/services/types';

import barangaysJson from './barangays.json';
import metaJson from './meta.json';
import routesJson from './routes.json';

export const BARANGAYS = barangaysJson as unknown as BarangayCollection;
export const CITY_META = metaJson as unknown as CityMeta;
export const ROUTES = routesJson as unknown as Route[];

export const TRUCKS: Truck[] = [
  { id: 't1', code: 'T1', name: 'Truck 1' },
  { id: 't2', code: 'T2', name: 'Truck 2' },
  { id: 't3', code: 'T3', name: 'Truck 3' },
  { id: 't4', code: 'T4', name: 'Truck 4' },
];

/**
 * SAMPLE schedule: every barangay is collected twice a week, following the 2013 Cavite
 * provincial profile ("twice-a-week collection"). Replace with the ENRO schedule.
 * Mabuhay's expectedLoad > 1 is intentional: it drives the "truck full with streets left" demo.
 */
export const ROUTE_SCHEDULES: RouteSchedule[] = [
  {
    routeId: 'r-lantic',
    truckId: 't1',
    days: [2, 5],
    start: '07:00',
    windowEnd: '11:00',
    wasteType: 'mixed',
    expectedLoad: 0.9,
  },
  {
    routeId: 'r-milagrosa',
    truckId: 't2',
    days: [2, 5],
    start: '07:00',
    windowEnd: '10:00',
    wasteType: 'mixed',
    expectedLoad: 0.85,
  },
  {
    routeId: 'r-mabuhay',
    truckId: 't3',
    days: [2, 5],
    start: '07:00',
    windowEnd: '10:00',
    wasteType: 'mixed',
    expectedLoad: 1.25,
  },
  {
    routeId: 'r-poblacion-maduya',
    truckId: 't4',
    days: [2, 5],
    start: '07:00',
    windowEnd: '10:30',
    wasteType: 'mixed',
    expectedLoad: 0.8,
  },
  {
    routeId: 'r-bancal',
    truckId: 't1',
    days: [1, 4],
    start: '07:00',
    windowEnd: '10:00',
    wasteType: 'mixed',
    expectedLoad: 0.8,
  },
  {
    routeId: 'r-cabilang-baybay',
    truckId: 't2',
    days: [1, 4],
    start: '07:00',
    windowEnd: '10:00',
    wasteType: 'mixed',
    expectedLoad: 0.6,
  },
];

/**
 * SAMPLE holiday changes. The holidays are real 2026 Philippine regular holidays that fall on
 * collection days; the replacement dates are illustrative until the ENRO sets its policy.
 */
export const SCHEDULE_EXCEPTIONS: ScheduleException[] = [
  {
    date: '2026-11-30',
    routeIds: ['r-bancal', 'r-cabilang-baybay'],
    action: 'move',
    moveTo: '2026-12-02',
    reason: { fil: 'Araw ni Bonifacio', en: 'Bonifacio Day' },
  },
  {
    date: '2026-12-25',
    routeIds: ['r-lantic', 'r-milagrosa', 'r-mabuhay', 'r-poblacion-maduya'],
    action: 'move',
    moveTo: '2026-12-26',
    reason: { fil: 'Pasko', en: 'Christmas Day' },
  },
  {
    date: '2027-01-01',
    routeIds: ['r-lantic', 'r-milagrosa', 'r-mabuhay', 'r-poblacion-maduya'],
    action: 'move',
    moveTo: '2027-01-02',
    reason: { fil: 'Bagong Taon', en: "New Year's Day" },
  },
];
