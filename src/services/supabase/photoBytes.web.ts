/** What a photo upload sends: the file's bytes (phones) or a Blob (web). */
export type PhotoBody = Uint8Array | Blob;

/** On the web a compressed photo is a data URI: turn it back into the JPEG it holds. */
export async function photoBytes(uri: string): Promise<PhotoBody | null> {
  try {
    return await (await fetch(uri)).blob();
  } catch {
    return null;
  }
}
