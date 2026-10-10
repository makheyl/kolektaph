/**
 * The browser has no secure storage locked by a fingerprint, so the web app offers none. Same
 * names as fingerprint.ts, so screens need no platform checks.
 */
export interface SavedSignIn {
  truckId: string;
  pin: string;
}

export const canUseFingerprint = (): boolean => false;
export const savedTruck = async (): Promise<string | null> => null;
export const saveSignIn = async (_saved: SavedSignIn, _prompt: string): Promise<boolean> => false;
export const readSignIn = async (_prompt: string): Promise<SavedSignIn | 'cancelled' | 'gone'> =>
  'gone';
export const forgetSignIn = async (): Promise<void> => undefined;
