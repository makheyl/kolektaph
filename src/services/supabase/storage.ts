/**
 * Report photos: one private bucket. A device writes only into its own folder
 * ("<identity>/<name>.jpg", JPEG, 1 MB at most); reading follows who may see the ticket.
 */
import { uuidFromText } from '@/lib/uuid';

import { ServerError } from '../errors';
import type { PhotoRef } from '../types';
import type { ApiConfig } from './config';
import type { Caller, Http } from './http';
import { photoBytes } from './photoBytes';

export const PHOTO_BUCKET = 'report-photos';
const UPLOAD_TIMEOUT_MS = 60_000;
/** Links are asked for an hour and reused for a little less. */
const LINK_SECONDS = 3600;
const LINK_REUSE_MS = 50 * 60 * 1000;

/** How the database wants a photo: an uploaded file, or one of the bundled sample pictures. */
export type PhotoArg = { path: string } | { sample: string };

const alreadyThere = (e: unknown) =>
  e instanceof ServerError &&
  (e.status === 409 || e.code === 'Duplicate' || /already exists/i.test(e.detail ?? ''));

export function createPhotoStore(
  config: ApiConfig,
  http: Http,
  userId: (as: Exclude<Caller, 'anon'>) => string | null,
  now: () => number = () => Date.now(),
) {
  const links = new Map<string, { url: string; until: number }>();

  /**
   * Uploads a photo under a name worked out from `nameKey` (the same key gives the same name,
   * so sending again never leaves a second copy). Returns null when there is nothing to send:
   * the photo is missing, or its file can no longer be read.
   */
  async function toArg(
    photo: PhotoRef | null,
    nameKey: string,
    as: Exclude<Caller, 'anon'>,
  ): Promise<PhotoArg | null> {
    if (!photo) return null;
    if (photo.kind === 'sample') return { sample: photo.id };
    if (photo.kind === 'remote') return { path: photo.path };
    const owner = userId(as);
    if (!owner) throw new ServerError('sign_in_required', 401);
    const body = await photoBytes(photo.uri);
    if (!body) return null;
    const path = `${owner}/${uuidFromText(nameKey)}.jpg`;
    try {
      await http.request('POST', `/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
        as,
        body,
        contentType: 'image/jpeg',
        timeoutMs: UPLOAD_TIMEOUT_MS,
      });
    } catch (e) {
      if (!alreadyThere(e)) throw e;
    }
    return { path };
  }

  /** A link to a stored photo, valid for a short while. */
  async function getUrl(path: string, as: Caller): Promise<string> {
    const known = links.get(path);
    if (known && known.until > now()) return known.url;
    const answer = await http.request<{ signedURL?: string; signedUrl?: string }>(
      'POST',
      `/storage/v1/object/sign/${PHOTO_BUCKET}/${path}`,
      { as, body: { expiresIn: LINK_SECONDS } },
    );
    const signed = answer?.signedURL ?? answer?.signedUrl;
    if (!signed) throw new ServerError('no_link', 502);
    const url = `${config.url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
    links.set(path, { url, until: now() + LINK_REUSE_MS });
    return url;
  }

  /** Removes stored photos (an admin, after a demo reset). */
  async function remove(paths: string[], as: Exclude<Caller, 'anon'>): Promise<void> {
    for (let i = 0; i < paths.length; i += 100) {
      await http.request('DELETE', `/storage/v1/object/${PHOTO_BUCKET}`, {
        as,
        body: { prefixes: paths.slice(i, i + 100) },
      });
    }
    paths.forEach((p) => links.delete(p));
  }

  return { toArg, getUrl, remove };
}

export type PhotoStore = ReturnType<typeof createPhotoStore>;
