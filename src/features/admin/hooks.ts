import { useEffect, useState } from 'react';

import { services } from '@/services';
import type { CityConfig, StaffUser } from '@/services/types';
import { useDemo } from '@/stores/demo';

/** City settings (SMS lead time, contacts); null until the first value arrives. */
export function useCityConfig(): CityConfig | null {
  const [config, setConfig] = useState<CityConfig | null>(null);
  // The lead time in force depends on the time, so follow demo clock jumps.
  const clock = useDemo((s) => s.clock);
  useEffect(() => services.admin.subscribeConfig(setConfig), [clock]);
  return config;
}

/** Dashboard accounts (sample accounts in the prototype). */
export function useStaff(): StaffUser[] {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  useEffect(() => services.admin.subscribeStaff(setStaff), []);
  return staff;
}
