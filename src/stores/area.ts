import { create } from 'zustand';

/** Which of the three apps is on screen: it decides whose view of the server the app reads. */
export type Area = 'resident' | 'driver' | 'enro';

export const areaOf = (pathname: string): Area =>
  pathname.startsWith('/enro') ? 'enro' : pathname.startsWith('/driver') ? 'driver' : 'resident';

const initial = (): Area => {
  const path = (globalThis as { location?: { pathname?: string } }).location?.pathname;
  return typeof path === 'string' ? areaOf(path) : 'resident';
};

/** Set by the root layout from the current route. Not persisted. */
export const useArea = create<{ area: Area }>()(() => ({ area: initial() }));
