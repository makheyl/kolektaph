import {
  BARANGAYS,
  ROUTE_SCHEDULES,
  ROUTES,
  SCHEDULE_EXCEPTIONS,
  SMS_REGISTRATIONS,
  TRUCKS,
} from '@/data/carmona';
import {
  AlertEngine,
  alertLog,
  type EngineContext,
  nightBeforeAlerts,
  operationalAlerts,
} from '@/features/alerts/engine';
import { smsInfo, smsTimeRange } from '@/features/alerts/sms';
import { brgyLong, brgyShort, sms, WEEKDAYS_FIL } from '@/features/alerts/templates';
import { formatClock, manilaEpoch, MINUTE } from '@/lib/time';
import type { TruckEvent } from '@/services/types';

const TUE = manilaEpoch(2026, 9, 29);
const MON = manilaEpoch(2026, 9, 28);
const tue = (h: number, m = 0) => manilaEpoch(2026, 9, 29, h, m);
const nameOf = (id: string) =>
  BARANGAYS.features.find((f) => f.properties.id === id)!.properties.name;

const ctx = (events: TruckEvent[] = []): EngineContext => ({
  schedules: ROUTE_SCHEDULES,
  routes: ROUTES,
  exceptions: SCHEDULE_EXCEPTIONS,
  trucks: TRUCKS,
  events,
  registrations: SMS_REGISTRATIONS,
  barangayName: nameOf,
  weekdayFil: (w) => WEEKDAYS_FIL[w],
});

describe('SMS length rules (GSM-7)', () => {
  it('counts plain text as one segment up to 160 characters', () => {
    expect(smsInfo('a'.repeat(160))).toMatchObject({
      encoding: 'GSM-7',
      segments: 1,
      remaining: 0,
    });
    expect(smsInfo('a'.repeat(161)).segments).toBe(2);
    expect(smsInfo('a'.repeat(306)).segments).toBe(2);
    expect(smsInfo('a'.repeat(307)).segments).toBe(3);
  });

  it('counts extension characters like ~ as two', () => {
    expect(smsInfo('~').units).toBe(2);
    expect(smsInfo('ñ').units).toBe(1); // ñ is in the basic GSM-7 alphabet
  });

  it('switches to UCS-2 (70 per SMS) for emoji or curly quotes', () => {
    expect(smsInfo('Salamat! 🙏')).toMatchObject({ encoding: 'UCS-2', segments: 1 });
    expect(smsInfo('“'.repeat(71)).segments).toBe(2);
  });

  it('writes compact time ranges like the pitch ("7-10AM")', () => {
    expect(smsTimeRange(tue(7), tue(10))).toBe('7-10AM');
    expect(smsTimeRange(tue(7, 30), tue(10))).toBe('7:30-10AM');
    expect(smsTimeRange(tue(11), tue(13))).toBe('11AM-1PM');
  });
});

describe('SMS templates', () => {
  const names = BARANGAYS.features.map((f) => f.properties.name);

  it('reproduce the pitch samples word for word', () => {
    expect(sms.vicinity({ barangay: 'Milagrosa', minutes: 15, eta: '7:40 AM' })).toBe(
      'KolektaPH: Milagrosa, 15 min na lang bago dumating ang garbage truck (~7:40 AM). Ilabas na po ang basura. Salamat!',
    );
    expect(sms.nightBefore({ weekday: 'Martes', range: '7-10AM', barangay: 'Milagrosa' })).toBe(
      'KolektaPH: Paalala! Bukas, Martes, 7-10AM ang koleksyon ng basura sa Brgy. Milagrosa. Ihiwalay po ang nabubulok at di-nabubulok.',
    );
    expect(sms.delayIncident({ barangay: 'Mabuhay', incident: 'breakdown', time: '1:00 PM' })).toBe(
      'KolektaPH: Naantala ang truck para sa Brgy. Mabuhay dahil sa sira. Bagong tantiyang oras: 1:00 PM. Paumanhin po.',
    );
  });

  it('names Poblacion barangays the way residents say them', () => {
    expect(brgyLong('Barangay 1')).toBe('Brgy. 1');
    expect(brgyShort('Milagrosa')).toBe('Milagrosa');
    expect(brgyShort('Barangay 8')).toBe('Brgy. 8');
  });

  it('every template fits ONE GSM-7 SMS for every barangay and weekday (worst case)', () => {
    for (const barangay of names) {
      for (const weekday of WEEKDAYS_FIL) {
        const texts = [
          sms.nightBefore({ weekday, range: '11:30AM-12:30PM', barangay }),
          sms.nightBeforeMoved({
            weekday,
            range: '11:30AM-12:30PM',
            barangay,
            reason: 'Araw ni Bonifacio',
          }),
          sms.vicinity({ barangay, minutes: 15, eta: '12:45 PM' }),
          sms.vicinityNow({ barangay }),
          ...(['breakdown', 'flat_tire', 'flood', 'road_blocked'] as const).map((incident) =>
            sms.delayIncident({ barangay, incident, time: '12:45 PM' }),
          ),
          sms.delayFull({ barangay }),
          sms.welcome({ barangay }),
        ];
        for (const text of texts) {
          const info = smsInfo(text);
          expect({ text, encoding: info.encoding, segments: info.segments }).toEqual({
            text,
            encoding: 'GSM-7',
            segments: 1,
          });
        }
      }
    }
  });
});

describe('alert engine', () => {
  it('sends the night-before reminder at 6:00 PM to barangays collected tomorrow', () => {
    const alerts = nightBeforeAlerts(ctx(), MON);
    expect(alerts.every((a) => a.sentAt === manilaEpoch(2026, 9, 28, 18, 0))).toBe(true);
    const milagrosa = alerts.find((a) => a.barangayIds[0] === 'milagrosa');
    expect(milagrosa?.text).toBe(
      'KolektaPH: Paalala! Bukas, Martes, 7-10AM ang koleksyon ng basura sa Brgy. Milagrosa. Ihiwalay po ang nabubulok at di-nabubulok.',
    );
    // Only Tuesday's barangays (not Bancal / Cabilang Baybay, which are Mon/Thu).
    expect(alerts.some((a) => a.barangayIds[0] === 'bancal')).toBe(false);
    expect(milagrosa?.recipients).toBe(SMS_REGISTRATIONS.milagrosa);
  });

  it('mentions holiday moves in the reminder', () => {
    const christmas = nightBeforeAlerts(ctx(), manilaEpoch(2026, 12, 25));
    expect(christmas.find((a) => a.barangayIds[0] === 'milagrosa')?.text).toContain(
      'inilipat dahil sa Pasko',
    );
  });

  it('DONE-WHEN S3: at 7:25 AM Tuesday, only Milagrosa gets the 15-minute SMS (~7:40 AM)', () => {
    const vicinity = operationalAlerts(ctx(), TUE).filter((a) => a.kind === 'vicinity');
    const around725 = vicinity.filter((a) => a.sentAt > tue(7, 24) && a.sentAt <= tue(7, 25));
    expect(around725.map((a) => a.barangayIds[0])).toEqual(['milagrosa']);
    const m = around725[0];
    expect(m.text).toMatch(/^KolektaPH: Milagrosa, 15 min na lang/);
    expect(formatClock(m.etaAt!)).toMatch(/^7:(39|40) AM$/);
  });

  it('sends each barangay its vicinity alert once, before the truck arrives', () => {
    const vicinity = operationalAlerts(ctx(), TUE).filter((a) => a.kind.startsWith('vicinity'));
    const ids = vicinity.map((a) => a.barangayIds[0]);
    expect(new Set(ids).size).toBe(ids.length);
    // Every Tuesday barangay is covered: Lantic, Poblacion 1–8, Milagrosa, Mabuhay, Maduya.
    expect(new Set(ids).size).toBe(12);
    for (const a of vicinity.filter((v) => v.kind === 'vicinity')) {
      expect(a.etaAt! - a.sentAt).toBeLessThanOrEqual(15 * MINUTE);
      expect(a.etaAt! - a.sentAt).toBeGreaterThan(0);
    }
  });

  it('warns Mabuhay when its truck fills up with streets left', () => {
    const full = operationalAlerts(ctx(), TUE).filter((a) => a.kind === 'delay_full');
    expect(full.map((a) => a.barangayIds[0])).toEqual(['mabuhay']);
    expect(full[0].sentAt).toBeGreaterThan(tue(7, 30));
    expect(full[0].sentAt).toBeLessThan(tue(8, 30));
  });

  it('sends a delay with the new estimated time when a truck breaks down', () => {
    const breakdown: TruckEvent = {
      id: 'b1',
      kind: 'incident',
      incident: 'breakdown',
      source: 'demo',
      truckId: 't2',
      at: tue(7, 20),
      minutes: 120,
    };
    const alerts = operationalAlerts(ctx([breakdown]), TUE);
    const delay = alerts.filter((a) => a.kind === 'delay_breakdown');
    // Truck 2 had not reached Milagrosa yet: Milagrosa gets the delay, quoting a later time.
    const m = delay.find((a) => a.barangayIds[0] === 'milagrosa');
    expect(m).toBeDefined();
    expect(m!.sentAt).toBeLessThanOrEqual(tue(7, 21));
    expect(m!.text).toContain('dahil sa sira');
    const vicinity = alerts.find((a) => a.kind === 'vicinity' && a.barangayIds[0] === 'milagrosa');
    // The 15-minute alert now comes ~2 hours later than usual.
    expect(vicinity!.sentAt).toBeGreaterThan(tue(9, 15));
  });

  it('is deterministic and never duplicates an alert id', () => {
    const a = alertLog(ctx(), MON, TUE);
    const b = alertLog(ctx(), MON, TUE);
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
  });

  it('as a live evaluator, does not resend when the ETA flickers', () => {
    const engine = new AlertEngine(ctx());
    const route = ROUTES.find((r) => r.id === 'r-mabuhay')!;
    const base = {
      truckId: 't3',
      routeId: 'r-mabuhay',
      status: 'on_route' as const,
      position: route.segments[0].coordinates[0],
      segmentIndex: 0,
      barangayId: null,
      streetName: null,
      progressM: 0,
      routeLengthM: route.lengthM,
      load: 0,
      at: tue(7),
      visits: {},
      departAt: tue(7),
      incident: null,
      statusSince: tue(7),
      loadReportedAt: null,
      trips: 0,
      shift: null,
    };
    const first = engine.observe(tue(7), base, route);
    const again = engine.observe(tue(7, 0) + 5_000, base, route);
    expect(first.filter((a) => a.kind === 'vicinity')).toHaveLength(1);
    expect(again).toHaveLength(0);
  });
});
