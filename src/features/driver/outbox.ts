/**
 * The driver phone's offline queue. Every tap becomes a TruckEvent that waits here until it is
 * uploaded; GPS fixes wait in the GPS log. Nothing is lost without signal, uploads keep their
 * order, and retries are idempotent (events by id, GPS fixes by index).
 */
import type { GpsFix, GpsSource, TruckEvent, UploadBatch } from '@/services/types';

/**
 * A shift's start and end get ids made from the shift's own id, so the phone's copy and the
 * server's copy of the same moment are recognised as one.
 */
export const shiftStartId = (shiftId: string) => `${shiftId}|start`;
export const shiftEndId = (shiftId: string) => `${shiftId}|end`;

/** Load and status taps can be undone for this long before they are sent. */
export const UNDO_MS = 5_000;
/** GPS fixes per upload request. */
export const GPS_BATCH = 200;

export interface OutboxItem {
  event: TruckEvent;
  /** Device time (epoch ms) until which the tap can still be undone; 0 = send right away. */
  holdUntil: number;
  synced: boolean;
}

/** Unsynced events ready to upload, in order, stopping at the first one still held for undo. */
export function readyEvents(outbox: OutboxItem[], deviceNow: number): TruckEvent[] {
  const ready: TruckEvent[] = [];
  for (const item of outbox) {
    if (item.synced) continue;
    if (item.holdUntil > deviceNow) break;
    ready.push(item.event);
  }
  return ready;
}

export interface GpsQueue {
  shiftId: string | null;
  source: GpsSource;
  fixes: GpsFix[];
  /** Fixes [0, sentCount) are on the server. */
  sentCount: number;
  /** Why the server refuses this shift's GPS for good (null = it is being sent). */
  blocked?: string | null;
}

/** Items waiting for upload: unsynced events plus unsent GPS fixes. */
export function pendingCounts(outbox: OutboxItem[], gps: GpsQueue) {
  return {
    events: outbox.filter((o) => !o.synced).length,
    fixes: gps.blocked ? 0 : Math.max(0, gps.fixes.length - gps.sentCount),
  };
}

/** The next upload, or null when there is nothing to send. */
export function buildBatch(
  truckId: string,
  outbox: OutboxItem[],
  gps: GpsQueue,
  deviceNow: number,
): UploadBatch | null {
  const events = readyEvents(outbox, deviceNow);
  const fixes = gps.blocked ? [] : gps.fixes.slice(gps.sentCount, gps.sentCount + GPS_BATCH);
  if (!events.length && !fixes.length) return null;
  return {
    truckId,
    events,
    gps:
      fixes.length && gps.shiftId
        ? { shiftId: gps.shiftId, source: gps.source, fromIndex: gps.sentCount, fixes }
        : null,
  };
}

/** Marks events as uploaded. */
export function markSynced(outbox: OutboxItem[], ids: string[]): OutboxItem[] {
  const done = new Set(ids);
  return outbox.map((o) => (done.has(o.event.id) ? { ...o, synced: true } : o));
}

/** Wait before the next attempt after `failures` failed uploads in a row: 5 s … 1 min. */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(60_000, 5_000 * 2 ** (failures - 1));
}
