import { useSettings } from '@/stores/settings';

describe('settings store (resident data on this device)', () => {
  beforeEach(() => {
    useSettings.setState({
      language: 'en',
      largeText: true,
      role: 'resident',
      barangayId: 'milagrosa',
      onboarded: true,
      sms: { mobile: '+639171234567', barangayId: 'milagrosa', optedInAt: 1 },
    });
  });

  it('moves SMS alerts along when the resident changes barangay', () => {
    useSettings.getState().setBarangayId('lantic');
    expect(useSettings.getState().sms?.barangayId).toBe('lantic');
  });

  it('"Burahin ang data ko" forgets the barangay, number and onboarding, but keeps the language', () => {
    useSettings.getState().deleteMyData();
    const s = useSettings.getState();
    expect(s.barangayId).toBeNull();
    expect(s.sms).toBeNull();
    expect(s.onboarded).toBe(false);
    expect(s.role).toBeNull();
    expect(s.language).toBe('en');
  });
});
