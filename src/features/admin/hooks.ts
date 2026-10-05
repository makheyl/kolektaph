import { useEffect, useState } from 'react';

import { services } from '@/services';
import type { CityConfig, StaffAuthState, StaffRole, StaffUser } from '@/services/types';
import { useDemo } from '@/stores/demo';

/** City settings (SMS lead time, contacts); null until the first value arrives. */
export function useCityConfig(): CityConfig | null {
  const [config, setConfig] = useState<CityConfig | null>(null);
  // The lead time in force depends on the time, so follow demo clock jumps.
  const clock = useDemo((s) => s.clock);
  useEffect(() => services.admin.subscribeConfig(setConfig), [clock]);
  return config;
}

/** Dashboard accounts (sample accounts on the sample data). */
export function useStaff(): StaffUser[] {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  useEffect(() => services.admin.subscribeStaff(setStaff), []);
  return staff;
}

/** Who is using the dashboard: loading, signed out, or a staff member with a role. */
export function useStaffAuth(): StaffAuthState {
  // The service answers at once, so the first render already knows (no flash of "checking").
  const [state, setState] = useState<StaffAuthState>(() => {
    let now: StaffAuthState = { status: 'loading' };
    services.auth.subscribe((s) => (now = s))();
    return now;
  });
  useEffect(() => services.auth.subscribe(setState), []);
  return state;
}

/**
 * What a role may do (the server enforces the same rules; this only hides what would be
 * refused). Viewers and barangay focal persons read; dispatchers also act on reports, missed
 * streets, suggestions, announcements and schedules; admins also change the City settings,
 * accounts and the demo controls.
 */
export const staffRights = (role: StaffRole | null) => ({
  act: role === 'admin' || role === 'dispatcher',
  admin: role === 'admin',
});

/** The signed-in staff member's rights (none while loading or signed out). */
export function useStaffRights() {
  const auth = useStaffAuth();
  return staffRights(auth.status === 'signed_in' ? auth.staff.role : null);
}
