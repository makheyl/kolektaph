import { DAY, nextWeekdayAt } from '@/lib/time';

export const DEMO_PRESET_IDS = [
  'nightBefore',
  'beforeStart',
  'approaching',
  'truckFull',
  'afterRoute',
] as const;

export type DemoPresetId = (typeof DEMO_PRESET_IDS)[number];

/**
 * Demo moments around the next Tuesday collection (Milagrosa, Lantic, Mabuhay, Poblacion and
 * Maduya are collected Tue/Fri in the sample schedule). Follows the pitch's Aling Rosa story.
 */
export function demoPresetTime(id: DemoPresetId, realNow: number): number {
  const tuesday = (hhmm: string) => nextWeekdayAt(realNow, 2, hhmm);
  switch (id) {
    case 'nightBefore':
      return tuesday('18:00') - DAY;
    case 'beforeStart':
      return tuesday('06:55');
    case 'approaching':
      return tuesday('07:25');
    case 'truckFull':
      return tuesday('07:55');
    case 'afterRoute':
      return tuesday('11:30');
  }
}
