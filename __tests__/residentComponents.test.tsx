import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BarangayPicker } from '@/features/resident/components/BarangayPicker';
import { StatusCard } from '@/features/resident/components/StatusCard';
import type { CollectionOccurrence } from '@/features/schedule/collections';
import i18n from '@/i18n';
import { manilaEpoch } from '@/lib/time';

const today: CollectionOccurrence = {
  barangayId: 'milagrosa',
  routeId: 'r-milagrosa',
  truckId: 't2',
  wasteType: 'mixed',
  day: manilaEpoch(2026, 9, 29),
  start: manilaEpoch(2026, 9, 29, 7, 0),
  end: manilaEpoch(2026, 9, 29, 10, 0),
  kind: 'regular',
};

describe('resident components', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fil');
  });

  it('tells residents to bring garbage out, with the time and minutes left', async () => {
    await render(
      <StatusCard
        status={{
          kind: 'bring_out',
          today,
          arriveAt: manilaEpoch(2026, 9, 29, 7, 40),
          minutes: 12,
        }}
        now={manilaEpoch(2026, 9, 29, 7, 28)}
        barangayName="Milagrosa"
        nameOf={() => 'Maduya'}
      />,
    );
    expect(screen.getByText('Ilabas na ang basura!')).toBeTruthy();
    expect(screen.getByText('Darating ang truck mga 7:40 AM.')).toBeTruthy();
    expect(screen.getByText('12 minuto na lang')).toBeTruthy();
  });

  // No background timers (gcTime/retries), so Jest can exit as soon as the tests finish.
  const testClient = () =>
    new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

  const renderPicker = async (onSelect = jest.fn()) => {
    await render(
      <QueryClientProvider client={testClient()}>
        <BarangayPicker selectedId={null} onSelect={onSelect} allowLocate={false} />
      </QueryClientProvider>,
    );
    await screen.findByText('Lantic');
    return onSelect;
  };

  it('filters barangays as the resident types', async () => {
    const onSelect = await renderPicker();
    await fireEvent.changeText(screen.getByLabelText('Hanapin ang barangay'), 'mila');
    expect(screen.getByText('Milagrosa')).toBeTruthy();
    expect(screen.queryByText('Lantic')).toBeNull();
    await fireEvent.press(screen.getByText('Milagrosa'));
    expect(onSelect).toHaveBeenCalledWith('milagrosa');
  });

  it('finds Poblacion barangays by their other names', async () => {
    await renderPicker();
    await fireEvent.changeText(screen.getByLabelText('Hanapin ang barangay'), 'rosario');
    expect(screen.getByText('Barangay 8 (Poblacion)')).toBeTruthy();
    expect(screen.queryByText('Barangay 1 (Poblacion)')).toBeNull();
  });
});
