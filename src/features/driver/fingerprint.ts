import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Fingerprint (or face) sign-in for the truck. Only when the crew asks for it, the truck and its
 * PIN are kept in the phone's own secure storage, locked by the phone's biometrics: the phone
 * asks for a finger before it gives them back. The PIN is still checked by the server each time,
 * so a PIN the City has changed ends this until the crew signs in with the new one.
 */
const SECRET_KEY = 'kolektaph.driver.pin';
/** Not a secret: only which truck has a saved sign-in, so the button can say so. */
const MARKER_KEY = 'kolektaph.driver.fingerprint';

export interface SavedSignIn {
  truckId: string;
  pin: string;
}

/** True when the phone has a fingerprint or face set up that is strong enough to lock a secret. */
export function canUseFingerprint(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** The truck whose sign-in is saved on this phone, if any. */
export async function savedTruck(): Promise<string | null> {
  return AsyncStorage.getItem(MARKER_KEY);
}

/** Saves the sign-in behind the phone's biometrics. The phone asks for a finger to do it. */
export async function saveSignIn(saved: SavedSignIn, prompt: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(SECRET_KEY, JSON.stringify(saved), {
      requireAuthentication: true,
      authenticationPrompt: prompt,
    });
    await AsyncStorage.setItem(MARKER_KEY, saved.truckId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asks for a finger and returns the saved sign-in. "cancelled" = the crew backed out or the
 * finger was not recognised; "gone" = the phone threw the secret away (its fingerprints were
 * changed), so it has to be set up again.
 */
export async function readSignIn(prompt: string): Promise<SavedSignIn | 'cancelled' | 'gone'> {
  try {
    const raw = await SecureStore.getItemAsync(SECRET_KEY, {
      requireAuthentication: true,
      authenticationPrompt: prompt,
    });
    if (!raw) {
      await forgetSignIn();
      return 'gone';
    }
    const saved = JSON.parse(raw) as SavedSignIn;
    return saved.truckId && saved.pin ? saved : 'gone';
  } catch {
    return 'cancelled';
  }
}

/** Removes the saved sign-in from this phone. */
export async function forgetSignIn(): Promise<void> {
  await AsyncStorage.removeItem(MARKER_KEY);
  try {
    await SecureStore.deleteItemAsync(SECRET_KEY);
  } catch {
    // Nothing was saved, or the phone already removed it.
  }
}
