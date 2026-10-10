import { sampleHauling } from '@/data/samples/hauling';
import { buildFeed, countUnread, splitByDay } from '@/features/alerts/feed';
import { applyAction, newTicket, ticketNumber } from '@/features/reports/lifecycle';
import { DAY, manilaEpoch } from '@/lib/time';
import type { NewReport, OutboundAlert, Ticket, TicketAction, TicketActor } from '@/services/types';

const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);
const mon = (h: number, m = 0) => manilaEpoch(2026, 9, 28, h, m);

const alert = (over: Partial<OutboundAlert>): OutboundAlert => ({
  id: 'a1',
  kind: 'vicinity',
  barangayIds: ['milagrosa'],
  sentAt: tue(7, 25),
  text: 'KolektaPH: Milagrosa, 15 min na lang.',
  recipients: 10,
  segments: 1,
  ...over,
});

const report: NewReport = {
  category: 'DUMPING',
  size: 'pile',
  photos: [{ kind: 'sample', id: 'dumping' }],
  location: [121.045, 14.304],
  accuracyM: 8,
  landmark: '',
  nearWaterway: false,
  nearSensitive: false,
  note: '',
  contact: null,
};
const act = (t: Ticket, action: TicketAction, at: number, by: TicketActor = 'enro') =>
  applyAction(t, action, { at, by, eventId: `${t.id}|${action.type}|${at}` });

describe('"Mga abiso" feed', () => {
  const filed = newTicket(ticketNumber(2026, 1), report, { at: mon(8), barangayId: 'milagrosa' });
  const verified = act(filed, { type: 'verify' }, mon(9));
  const scheduled = act(
    verified,
    { type: 'dispatch', mode: 'special_pickup', truckId: 't2', due: tue(10) },
    tue(6),
  );

  it("lists the barangay's alerts and the City's steps on the resident's reports, newest first", () => {
    const feed = buildFeed({
      alerts: [
        alert({ id: 'night', kind: 'night_before', sentAt: mon(18) }),
        alert({ id: 'near', kind: 'vicinity', sentAt: tue(7, 25) }),
      ],
      tickets: [scheduled],
    });
    const what = feed.map((i) =>
      i.source === 'alert' ? i.alert.id : i.source === 'ticket' ? i.event.kind : i.id,
    );
    expect(what).toEqual(['near', 'dispatched', 'night', 'verified']);
  });

  it("leaves out the resident's own taps: sending, reopening and rating are not news", () => {
    const feed = buildFeed({ alerts: [], tickets: [scheduled] });
    expect(feed.every((i) => i.source === 'ticket' && i.event.by !== 'resident')).toBe(true);
    expect(feed.some((i) => i.source === 'ticket' && i.event.kind === 'submitted')).toBe(false);
  });

  it('files truck alerts under Truck, reports under Report and announcements under neither', () => {
    const feed = buildFeed({
      alerts: [
        alert({ id: 'near' }),
        alert({ id: 'full', kind: 'delay_full' }),
        alert({ id: 'news', kind: 'announcement' }),
      ],
      tickets: [verified],
    });
    const groupOf = (id: string) => feed.find((i) => i.id.includes(id))?.group;
    expect(groupOf('near')).toBe('truck');
    expect(groupOf('full')).toBe('truck');
    expect(groupOf('news')).toBe('city');
    expect(feed.find((i) => i.source === 'ticket')?.group).toBe('reports');
  });

  it('splits the list into today and earlier by the Manila day', () => {
    const feed = buildFeed({
      // 11:30 PM Monday in Manila is still Monday there, although it is Monday afternoon UTC.
      alerts: [
        alert({ id: 'late', sentAt: mon(23, 30) }),
        alert({ id: 'early', sentAt: tue(0, 5) }),
      ],
      tickets: [],
    });
    const { today, earlier } = splitByDay(feed, tue(8));
    expect(today.map((i) => i.id)).toEqual(['alert:early']);
    expect(earlier.map((i) => i.id)).toEqual(['alert:late']);
  });

  it('counts as unread whatever came after the last look', () => {
    const feed = buildFeed({ alerts: [alert({ id: 'near' })], tickets: [scheduled] });
    expect(countUnread(feed, 0)).toBe(3);
    expect(countUnread(feed, tue(6))).toBe(1);
    expect(countUnread(feed, tue(8))).toBe(0);
  });

  it('adds what the City did on a hauling request, and points earned lately', () => {
    const request = sampleHauling(tue(8))[0];
    const feed = buildFeed({
      alerts: [],
      tickets: [],
      hauling: [request],
      points: [
        { id: 'p-new', kind: 'valid_report', points: 50, at: tue(7), ref: null },
        { id: 'p-old', kind: 'valid_report', points: 50, at: mon(7) - 30 * DAY, ref: null },
        { id: 'p-spent', kind: 'redeemed', points: -300, at: tue(7, 30), ref: 'perk' },
      ],
      pointsSince: tue(8) - 7 * DAY,
    });
    // The requester sending it is not news; the City's quotation is. Old and spent points stay out.
    expect(feed.map((i) => i.id)).toEqual([
      'points:p-new',
      `hauling:${request.id}:${request.id}|quoted`,
    ]);
    expect(feed.map((i) => i.group)).toEqual(['rewards', 'hauling']);
  });

  it('gives every line its own id, so a list can key on it', () => {
    const feed = buildFeed({ alerts: [alert({ id: 'near' })], tickets: [scheduled] });
    expect(new Set(feed.map((i) => i.id)).size).toBe(feed.length);
  });
});
