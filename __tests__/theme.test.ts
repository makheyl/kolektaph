import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import { contrastRatio } from '@/theme/contrast';
import { colors } from '@/theme/tokens';

const AA_TEXT = 4.5;

describe('design token contrast (WCAG 2.1 AA)', () => {
  it.each([
    ['text on cream', colors.text, colors.cream],
    ['muted text on cream', colors.textMuted, colors.cream],
    ['muted text on white', colors.textMuted, colors.surface],
    ['white on navy (primary button)', colors.textOnDark, colors.navy],
    ['white on green (success button)', colors.textOnDark, colors.green],
    ['white on red (danger button)', colors.textOnDark, colors.red],
    ['navy on yellow (warning button)', colors.navy, colors.yellow],
    ['navy on yellow-soft (sample badge)', colors.navy, colors.yellowSoft],
  ])('%s ≥ 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
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
      expect(contrastRatio(colors.textOnDark, meta.color)).toBeGreaterThanOrEqual(3);
    },
  );
});
