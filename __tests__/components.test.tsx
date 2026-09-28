import { act, render, screen } from '@testing-library/react-native';

import { LoadBar } from '@/components/ui/LoadBar';
import { StatusPill } from '@/components/ui/StatusPill';
import i18n from '@/i18n';

describe('UI kit', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fil');
  });

  it('shows load as text as well as a bar', async () => {
    await render(<LoadBar value={0.75} />);
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByLabelText('Karga: 75%')).toBeTruthy();
  });

  it('says "Puno" when the truck is full', async () => {
    await render(<LoadBar value={1} />);
    expect(screen.getByText('Puno')).toBeTruthy();
  });

  it('labels statuses in Filipino, then English', async () => {
    await render(<StatusPill status="full" />);
    expect(screen.getByText('Puno na')).toBeTruthy();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    await render(<StatusPill status="full" />);
    expect(screen.getByText('Full')).toBeTruthy();
  });
});
