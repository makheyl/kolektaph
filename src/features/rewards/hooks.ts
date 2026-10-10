import { useEffect, useState } from 'react';

import { services } from '@/services';
import type { CleanupDrive, Perk, PointsSummary, Voucher } from '@/services/types';
import { useDemo } from '@/stores/demo';
import { useSettings } from '@/stores/settings';

/** The resident's Eco Points; null until the first value arrives. */
export function usePoints(): PointsSummary | null {
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  // The week in view follows the clock and the barangay's collection days.
  const clock = useDemo((s) => s.clock);
  const barangayId = useSettings((s) => s.barangayId);
  useEffect(() => services.rewards.subscribeSummary(setSummary), [clock, barangayId]);
  return summary;
}

/** What points can be exchanged for; null until the list arrives. */
export function usePerks(): Perk[] | null {
  const [perks, setPerks] = useState<Perk[] | null>(null);
  useEffect(() => services.rewards.subscribePerks(setPerks), []);
  return perks;
}

/** The resident's vouchers, newest first. */
export function useVouchers(): Voucher[] {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  useEffect(() => services.rewards.subscribeVouchers(setVouchers), []);
  return vouchers;
}

/** The City's clean-up drives (City ENRO); null until the list arrives. */
export function useCleanups(): CleanupDrive[] | null {
  const [drives, setDrives] = useState<CleanupDrive[] | null>(null);
  useEffect(() => services.rewards.subscribeCleanups(setDrives), []);
  return drives;
}
