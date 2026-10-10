import { ALERT_META } from '@/features/alerts/alertMeta';
import { TICKET_STATUS_META } from '@/features/reports/components/TicketBits';
import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import { contrastRatio } from '@/theme/contrast';
import { colors } from '@/theme/tokens';

const AA_TEXT = 4.5;
/** Outlines and icons that carry meaning (WCAG 1.4.11). */
const AA_GRAPHICS = 3;

describe('design token contrast (WCAG 2.1 AA)', () => {
  it('the orange "Driver" of the driver logo reads as large text on mint and on white', () => {
    expect(contrastRatio(colors.brandOrange, colors.mint)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors.brandOrange, colors.surface)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['text on the page', colors.text, colors.page],
    ['text on mint (app bar, Kolek bubble)', colors.text, colors.mint],
    ['text on the tinted page', colors.text, colors.mintSoft],
    ['muted text on white', colors.textMuted, colors.surface],
    ['muted text on mint', colors.textMuted, colors.mint],
    ['muted text on the tinted page', colors.textMuted, colors.mintSoft],
    ['muted text on the dashboard', colors.textMuted, colors.dashboard],
    ['muted text on grey-soft', colors.textMuted, colors.greySoft],
    ['white on green (primary button)', colors.textOnDark, colors.primary],
    ['green on white (outline button, links)', colors.primary, colors.surface],
    ['green on mint (tonal button)', colors.primary, colors.mint],
    ['green on the tinted page', colors.primary, colors.mintSoft],
    ['ink on mint (tab bar, app bar)', colors.ink, colors.mint],
    ['white on ink (driver bar)', colors.textOnDark, colors.ink],
    ['white on red (danger button)', colors.textOnDark, colors.red],
    ['ink on yellow (warning button)', colors.ink, colors.yellow],
    ['ink on yellow-soft (sample badge)', colors.ink, colors.yellowSoft],
    ['red on red-soft (error notice)', colors.red, colors.redSoft],
    ['amber on amber-soft (warning notice)', colors.amber, colors.amberSoft],
    ['blue on blue-soft (scheduled status)', colors.blue, colors.blueSoft],
    ['blue on white', colors.blue, colors.surface],
    ['ink on mint (idle chip)', colors.ink, colors.mint],
    ['green on mint (page title in the app bar)', colors.primary, colors.mint],
  ])('%s ≥ 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each([
    ['on white', colors.surface],
    ['on the tinted page', colors.mintSoft],
    ['on mint', colors.mint],
  ])('input outlines are visible %s (3:1)', (_label, bg) => {
    expect(contrastRatio(colors.fieldBorder, bg)).toBeGreaterThanOrEqual(AA_GRAPHICS);
  });

  it.each(Object.entries(TRUCK_STATUS_META))(
    'status "%s" label is readable on its pill',
    (_status, meta) => {
      expect(contrastRatio(meta.color, meta.soft)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(Object.entries(TRUCK_STATUS_META))(
    'status "%s" pin icon is readable (white on colour, 3:1 for graphics)',
    (_status, meta) => {
      expect(contrastRatio(colors.textOnDark, meta.color)).toBeGreaterThanOrEqual(AA_GRAPHICS);
    },
  );

  it.each(Object.entries(TICKET_STATUS_META))(
    'report status "%s" label is readable on its pill',
    (_status, meta) => {
      expect(contrastRatio(meta.color, meta.soft)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(Object.entries(ALERT_META))(
    'alert "%s" icon is visible on its tile (3:1 for graphics)',
    (_kind, meta) => {
      expect(contrastRatio(meta.color, meta.soft)).toBeGreaterThanOrEqual(AA_GRAPHICS);
    },
  );
});
