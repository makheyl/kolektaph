/**
 * Web demo bridge: stores that stand in for the server live in localStorage, which every tab of
 * the browser shares. When another tab writes one of them, reload it here, so a driver tab,
 * a City ENRO tab and a resident tab behave like three devices on one backend. (The demo clock
 * is shared too, so a time jump in one tab moves every tab.)
 */
import { useAnnouncements } from './announcements';
import { useBackend } from './backend';
import { useCityAdmin } from './cityAdmin';
import { useDemo } from './demo';
import { useEnro } from './enro';

const SHARED = {
  'kolektaph.backend': useBackend,
  'kolektaph.demo': useDemo,
  'kolektaph.announcements': useAnnouncements,
  'kolektaph.enro': useEnro,
  'kolektaph.admin': useCityAdmin,
} as const;

let started = false;

export function startTabSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('storage', (e) => {
    const store = e.key ? SHARED[e.key as keyof typeof SHARED] : undefined;
    if (store) void store.persist.rehydrate();
  });
}
