import { type Holdings, NOTHING } from '@/features/account/transfer';
import { createMockAccount } from '@/services/mock/account';
import type { PointsEntry } from '@/services/types';
import { useAccountStore } from '@/stores/account';

// The device's holdings: the account service reads and writes them through this bridge.
let device: Holdings = NOTHING;
const bridge = { read: () => device, write: (next: Holdings) => (device = next) };

const point = (id: string, points = 50): PointsEntry => ({
  id,
  kind: 'valid_report',
  points,
  at: 1_000 + points,
  ref: null,
});

const juan = {
  fullName: 'Juan Dela Cruz',
  mobile: '+639171234567',
  password: 'tamang-password',
  barangayId: 'milagrosa',
  area: 'Zone 3',
  email: null,
};
const ana = { ...juan, fullName: 'Ana Santos', mobile: '+639181234567' };

const statusOf = (service: ReturnType<typeof createMockAccount>) => {
  let status = '';
  service.subscribe((s) => (status = s.status))();
  return status;
};
const offerOf = (service: ReturnType<typeof createMockAccount>) => {
  let offer: unknown = 'unset';
  service.subscribeTransfer((o) => (offer = o))();
  return offer;
};

describe('sample accounts on a device', () => {
  let service: ReturnType<typeof createMockAccount>;

  beforeEach(() => {
    useAccountStore.setState({ accounts: {}, signedIn: null, aside: null, offered: false });
    device = NOTHING;
    service = createMockAccount(bridge);
  });

  it('registering keeps what the device holds: it now belongs to the account', async () => {
    device = { ...NOTHING, reports: ['KPH-2026-000101'], points: [point('p1')] };
    await service.register(juan);
    expect(statusOf(service)).toBe('registered');
    expect(device.reports).toEqual(['KPH-2026-000101']);
    expect(offerOf(service)).toBeNull();
  });

  it('a registered device that signs out is a fresh guest, and its account keeps what it held', async () => {
    device = { ...NOTHING, reports: ['KPH-2026-000101'] };
    await service.register(juan);
    await service.logOut();
    expect(statusOf(service)).toBe('guest');
    expect(device).toEqual(NOTHING);
    await service.logIn(juan.mobile, juan.password);
    expect(device.reports).toEqual(['KPH-2026-000101']);
  });

  it("signing in to an account sets the guest's holdings aside, and offers them once", async () => {
    await service.register(ana);
    await service.logOut();
    device = { ...NOTHING, reports: ['KPH-2026-000109'], points: [point('guest-p', 80)] };

    await service.logIn(ana.mobile, ana.password);
    expect(device).toEqual(NOTHING); // the account's own holdings: none yet
    expect(offerOf(service)).toEqual({ reports: 1, points: 80 });
  });

  it("taking the offer over moves the guest's holdings into the account", async () => {
    await service.register(ana);
    device = { ...NOTHING, reports: ['KPH-2026-000109'], points: [point('guest-p', 80)] };
    await service.logOut();
    await service.logIn(ana.mobile, ana.password);

    await service.acceptTransfer();
    expect(device.reports).toEqual(['KPH-2026-000109']);
    expect(device.points.map((p) => p.id)).toEqual(['guest-p']);
    expect(offerOf(service)).toBeNull();

    // The guest's holdings are not on the device any more: signing out leaves a fresh guest.
    await service.logOut();
    expect(device).toEqual(NOTHING);
  });

  it("leaving the offer keeps the guest's holdings set aside, back at sign-out", async () => {
    await service.register(ana);
    await service.logOut();
    device = { ...NOTHING, reports: ['KPH-2026-000109'] };
    await service.logIn(ana.mobile, ana.password);

    await service.declineTransfer();
    expect(offerOf(service)).toBeNull();
    await service.logOut();
    expect(device.reports).toEqual(['KPH-2026-000109']);
  });

  it('the offer comes back at the next sign-in that has something to offer, not before', async () => {
    await service.register(ana);
    await service.logOut();
    device = { ...NOTHING, reports: ['KPH-2026-000109'] };
    await service.logIn(ana.mobile, ana.password);
    await service.declineTransfer();
    await service.logOut();

    device = NOTHING;
    await service.logIn(ana.mobile, ana.password);
    expect(offerOf(service)).toBeNull(); // nothing held as a guest this time
    await service.logOut();

    device = { ...NOTHING, reports: ['KPH-2026-000120'] };
    await service.logIn(ana.mobile, ana.password);
    expect(offerOf(service)).toEqual({ reports: 1, points: 0 });
  });

  it('signing in to another account signs the first one out, keeping its holdings', async () => {
    await service.register(juan);
    device = { ...NOTHING, reports: ['KPH-JUAN'] };
    await service.register(ana);
    device = { ...NOTHING, reports: ['KPH-ANA'] };
    await service.logIn(juan.mobile, juan.password);
    expect(device.reports).toEqual(['KPH-JUAN']);
    await service.logIn(ana.mobile, ana.password);
    expect(device.reports).toEqual(['KPH-ANA']);
  });

  it('a wrong password is refused, and a mobile number cannot be registered twice', async () => {
    await service.register(juan);
    await service.logOut();
    await expect(service.logIn(juan.mobile, 'mali')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await expect(service.register(juan)).rejects.toMatchObject({ code: 'mobile_taken' });
  });

  it('changing the password needs the current one', async () => {
    await service.register(juan);
    await expect(service.changePassword('mali', 'bagong-password')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    await service.changePassword(juan.password, 'bagong-password');
    await service.logOut();
    await service.logIn(juan.mobile, 'bagong-password');
    expect(statusOf(service)).toBe('registered');
  });

  it('a forgotten password is reset with the code shown on screen', async () => {
    await service.register(juan);
    await service.logOut();
    await expect(service.requestRecovery('+639000000000')).rejects.toMatchObject({
      code: 'unknown_account',
    });
    const { sampleCode } = await service.requestRecovery(juan.mobile);
    expect(sampleCode).toMatch(/^\d{6}$/);
    await expect(
      service.confirmRecovery(juan.mobile, '000000', 'bagong-password'),
    ).rejects.toMatchObject({ code: 'wrong_code' });
    await service.confirmRecovery(juan.mobile, sampleCode!, 'bagong-password');
    await service.logIn(juan.mobile, 'bagong-password');
    expect(statusOf(service)).toBe('registered');
  });

  it('a password is never kept as typed', async () => {
    await service.register(juan);
    const kept = JSON.stringify(useAccountStore.getState());
    expect(kept).not.toContain(juan.password);
  });
});
