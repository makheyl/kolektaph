/**
 * Planning speeds (SAMPLE values, to calibrate against real GPS logs in the pilot).
 * Collection speed is an effective speed that includes stopping at houses.
 * Shared by the simulator and the ETA estimator.
 */
export const COLLECT_KMH = 8;
export const TRANSIT_KMH = 25;

/** Milliseconds needed to travel one metre at `kmh` (3600 s/h ÷ km/h). */
export const msPerMetre = (kmh: number) => 3600 / kmh;

export const segmentMsPerMetre = (collect: boolean) =>
  msPerMetre(collect ? COLLECT_KMH : TRANSIT_KMH);
