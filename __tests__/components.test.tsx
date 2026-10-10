import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { BigTile } from '@/components/ui/BigTile';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ListRow } from '@/components/ui/ListRow';
import { LoadBar } from '@/components/ui/LoadBar';
import { useNarrow } from '@/components/ui/narrow';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { StatusPill } from '@/components/ui/StatusPill';
import { SAMPLE_POINTS_RULES } from '@/data/samples/rewards';
import { FeedCard } from '@/features/alerts/components/FeedCard';
import { DriverTile } from '@/features/driver/components/DriverTile';
import { PinPad } from '@/features/driver/components/PinPad';
import { HaulingStatusPill, OptionTile } from '@/features/hauling/components/HaulingBits';
import { QuickAction } from '@/features/resident/components/QuickAction';
import { ResidentTabBar } from '@/features/resident/components/ResidentTabBar';
import { PointsCard } from '@/features/rewards/components/PointsCard';
import i18n from '@/i18n';
import { manilaEpoch } from '@/lib/time';

// The width of the screen is not what is checked here: each test says whether it is narrow.
jest.mock('@/components/ui/narrow', () => ({ useNarrow: jest.fn(() => false) }));

/** How many icons are drawn: an icon is a letter of the app's own icon font. */
const iconCount = () => (JSON.stringify(screen.toJSON()).match(/kph-icons/g) ?? []).length;

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

  it('a button that is working says so and ignores taps', async () => {
    const onPress = jest.fn();
    await render(<Button label="Ipadala ang report" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Ipadala ang report', busy: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a disabled button ignores taps', async () => {
    const onPress = jest.fn();
    await render(<Button label="Susunod" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Susunod', disabled: true }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a loading placeholder is announced once, as loading', async () => {
    await render(
      <SkeletonGroup>
        <Skeleton />
        <Skeleton />
      </SkeletonGroup>,
    );
    expect(screen.getByRole('progressbar', { name: 'Naglo-load…', busy: true })).toBeTruthy();
  });
});

describe('newer parts', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fil');
  });

  it('a chosen chip says so in words, not only by its colour', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Chip label="Truck" selected onPress={onPress} />
        <Chip label="Report" onPress={onPress} />
      </>,
    );
    expect(screen.getByRole('button', { name: '✓ Truck', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Report', selected: false }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a switch of two periods marks the one in view and reports a change', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedTabs
        variant="pill"
        fill
        label="Saklaw na panahon"
        tabs={[
          { id: 'week', label: '7 araw' },
          { id: 'month', label: '30 araw' },
        ]}
        value="week"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('tab', { name: '7 araw', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: '30 araw' }));
    expect(onChange).toHaveBeenCalledWith('month');
  });

  it('a Home shortcut reads its number out with what it counts', async () => {
    await render(
      <QuickAction
        icon="clipboard-list-outline"
        label="Aking mga report"
        badge="3"
        badgeLabel="3 report"
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Aking mga report. 3 report' })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('the points card says the balance and how far the next tier is', async () => {
    await render(
      <PointsCard
        summary={{
          balance: 950,
          lifetime: 1250,
          entries: [],
          week: [],
          rules: SAMPLE_POINTS_RULES,
        }}
      />,
    );
    expect(screen.getByText('950')).toBeTruthy();
    expect(screen.getByText('750 points pa para sa Gold')).toBeTruthy();
    expect(
      screen.getByLabelText('Ang Eco Points mo: 950 points. 750 points pa para sa Gold'),
    ).toBeTruthy();
  });

  it('a hauling step is shown in words', async () => {
    await render(
      <>
        <HaulingStatusPill view="quoted" />
        <HaulingStatusPill view="expired" />
      </>,
    );
    expect(screen.getByText('May quotation')).toBeTruthy();
    expect(screen.getByText('Lipas na ang quotation')).toBeTruthy();
  });

  it('a choice tile is a radio button that says whether it is chosen', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <OptionTile
          icon="sack"
          title="Kaunti"
          hint="1 hanggang 5 sako"
          selected
          onPress={onPress}
        />
        <OptionTile
          icon="truck"
          title="Marami"
          hint="Isang buong truck"
          selected={false}
          onPress={onPress}
        />
      </>,
    );
    expect(
      screen.getByRole('radio', { name: 'Kaunti. 1 hanggang 5 sako', checked: true }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Marami. Isang buong truck' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('an unread notification says it is new, and opens what it is about', async () => {
    const onPress = jest.fn();
    const at = manilaEpoch(2026, 9, 29, 7, 0);
    await render(
      <FeedCard
        item={{
          id: 'points:1',
          at,
          group: 'rewards',
          source: 'points',
          entry: { id: '1', kind: 'valid_report', points: 50, at, ref: null },
        }}
        unread
        now={at + 60_000}
        onPress={onPress}
      />,
    );
    const card = screen.getByRole('button', {
      name: 'Bago. Nakakuha ka ng 50 points. Na-verify na report. Ngayon · 7:00 AM',
    });
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('on a very narrow screen (a small phone at 200% text)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fil');
    jest.mocked(useNarrow).mockReturnValue(true);
  });
  afterEach(() => {
    jest.mocked(useNarrow).mockReturnValue(false);
  });

  it("a button keeps its words and its tap, and gives the icon's room to the words", async () => {
    const onPress = jest.fn();
    await render(<Button icon="calendar-month" label="Iskedyul" onPress={onPress} />);
    expect(iconCount()).toBe(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Iskedyul' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a list row keeps its name, its second line and its arrow, without the picture', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow
        variant="card"
        icon="cog-outline"
        title="Mga setting ng account"
        subtitle="Barangay, wika, data at privacy"
        onPress={onPress}
      />,
    );
    // Only the arrow is left; on a phone of usual width there is the picture as well.
    expect(iconCount()).toBe(1);
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Mga setting ng account. Barangay, wika, data at privacy',
      }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);

    jest.mocked(useNarrow).mockReturnValue(false);
    await render(<ListRow variant="card" icon="cog-outline" title="Wika" onPress={onPress} />);
    expect(iconCount()).toBe(2);
  });

  it('a main choice is still one button that says its name and its hint', async () => {
    const onPress = jest.fn();
    await render(
      <BigTile
        icon="steering"
        label="Driver ng truck"
        hint="Piliin ang truck at ilagay ang PIN nito."
        onPress={onPress}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Driver ng truck. Piliin ang truck at ilagay ang PIN nito.',
      }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('the parts of a switch can still be chosen, and the chosen one is marked', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedTabs
        kind="choice"
        variant="pill"
        label="Wika"
        tabs={[
          { id: 'fil', label: 'Filipino' },
          { id: 'en', label: 'English' },
        ]}
        value="fil"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Filipino', checked: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'English', checked: false }));
    expect(onChange).toHaveBeenCalledWith('en');
  });

  it('a notification still says what happened and opens it', async () => {
    const onPress = jest.fn();
    const at = manilaEpoch(2026, 9, 29, 7, 0);
    await render(
      <FeedCard
        item={{
          id: 'points:1',
          at,
          group: 'rewards',
          source: 'points',
          entry: { id: '1', kind: 'valid_report', points: 50, at, ref: null },
        }}
        unread={false}
        now={at + 60_000}
        onPress={onPress}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Nakakuha ka ng 50 points. Na-verify na report. Ngayon · 7:00 AM',
      }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('driver parts', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fil');
  });

  it('the PIN pad has ten number keys and one to take a number back', async () => {
    const onDigit = jest.fn();
    const onDelete = jest.fn();
    await render(<PinPad length={2} onDigit={onDigit} onDelete={onDelete} />);
    expect(screen.getAllByRole('button')).toHaveLength(11);
    // How many numbers are in is said in words; the numbers themselves are never shown.
    expect(screen.getByRole('progressbar', { name: '2 sa 4 na numero' })).toBeTruthy();
    for (const digit of ['1', '5', '0']) {
      await fireEvent.press(screen.getByRole('button', { name: digit }));
    }
    expect(onDigit.mock.calls.map(([d]) => d)).toEqual(['1', '5', '0']);
    await fireEvent.press(screen.getByRole('button', { name: 'Burahin ang huling numero' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a PIN pad that is checking the PIN takes no more numbers', async () => {
    const onDigit = jest.fn();
    await render(<PinPad length={4} onDigit={onDigit} onDelete={jest.fn()} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: '7' }));
    expect(onDigit).not.toHaveBeenCalled();
  });

  it('a load tile is at least as wide as its word, so "PUNO" is never broken in two', async () => {
    const minWidthOf = (name: string) =>
      StyleSheet.flatten(screen.getByRole('button', { name }).props.style).minWidth as number;
    await render(
      <>
        <DriverTile compact label="½" accessibilityLabel="Karga: ½" onPress={jest.fn()} />
        <DriverTile compact label="PUNO" accessibilityLabel="Karga: PUNO" onPress={jest.fn()} />
      </>,
    );
    expect(minWidthOf('Karga: ½')).toBe(64);
    expect(minWidthOf('Karga: PUNO')).toBeGreaterThan(64 + 20);
  });

  it('the tile of what the truck is doing now says so in words', async () => {
    await render(<DriverTile icon="truck-fast" label="Nasa ruta" selected onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Nasa ruta', selected: true })).toBeTruthy();
    expect(screen.getByText('ngayon')).toBeTruthy();
  });
});

describe('resident tab bar', () => {
  const route = (name: string) => ({ key: `${name}-key`, name });
  // The four tabs, then screens reached from inside them (Home's shortcuts, Profile's pages).
  const routes = [
    'index',
    'map',
    'alerts',
    'settings',
    'report',
    'kolek',
    'schedule',
    'account/index',
  ].map(route);
  const renderBar = async (index: number) => {
    const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
    await render(
      <ResidentTabBar
        state={{ index, routes } as never}
        navigation={navigation as never}
        descriptors={{} as never}
        insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
      />,
    );
    return navigation;
  };

  beforeEach(async () => {
    await i18n.changeLanguage('fil');
  });

  it('shows the four icon tabs by name, with the open one marked', async () => {
    await renderBar(0);
    // The bell's name may say how many are unread, so it is matched by its start.
    const names = [/^Bahay$/, /^Mapa$/, /^Abiso/, /^Profile$/];
    expect(screen.getAllByRole('tab')).toHaveLength(names.length);
    for (const name of names) expect(screen.getByRole('tab', { name })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Bahay', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Mapa', selected: false })).toBeTruthy();
  });

  it('opens a tab when it is pressed', async () => {
    const navigation = await renderBar(0);
    await fireEvent.press(screen.getByRole('tab', { name: /^Abiso/ }));
    expect(navigation.navigate).toHaveBeenCalledWith('alerts', undefined);
  });

  it('marks no tab on a screen that has none', async () => {
    await renderBar(6);
    expect(screen.queryByRole('tab', { selected: true })).toBeNull();
  });

  it('keeps Profile marked on the pages under it, and leads back to it when pressed', async () => {
    const navigation = await renderBar(7);
    expect(screen.getByRole('tab', { name: 'Profile', selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
    expect(navigation.navigate).toHaveBeenCalledWith('settings', undefined);
  });

  it('does nothing when the open tab itself is pressed', async () => {
    const navigation = await renderBar(0);
    await fireEvent.press(screen.getByRole('tab', { name: 'Bahay' }));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
