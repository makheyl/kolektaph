import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

describe('scaffold smoke test', () => {
  it('renders the KolektaPH entry screen', async () => {
    await render(<Index />);
    expect(screen.getByText('Alam mo kung kailan. Alam mo kung saan.')).toBeTruthy();
  });
});
