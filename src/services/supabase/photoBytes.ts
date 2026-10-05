/** What a photo upload sends: the file's bytes (phones) or a Blob (web). */
export type PhotoBody = Uint8Array | Blob;

/**
 * Reads a compressed photo from the phone's storage. Returns null when the file can no longer
 * be read (for example the phone cleared its cache), so the caller can go on without it.
 */
export async function photoBytes(uri: string): Promise<PhotoBody | null> {
  try {
    // Loaded only when a photo is sent: tests and screens without photos never touch it.
    const { File } = await import('expo-file-system');
    return await new File(uri).bytes();
  } catch {
    return null;
  }
}
