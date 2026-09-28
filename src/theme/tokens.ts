/**
 * KolektaPH design tokens, from the pitch deck palette:
 * navy = brand/neutral, green = collected/on route, yellow = alerts (dark text on top),
 * red = missed/full/problem, cream = page surface. Contrast pairs are unit-tested (WCAG AA).
 */
export const colors = {
  navy: '#15314B',
  navyDark: '#0E2336',
  green: '#157347',
  greenSoft: '#E2F1E8',
  yellow: '#F2B600',
  yellowSoft: '#FFF3C9',
  red: '#B3261E',
  redSoft: '#FBE6E4',
  amber: '#9A5200',
  amberSoft: '#FDEBD3',
  grey: '#5C6B7A',
  greySoft: '#EAEEF2',
  cream: '#F4F1EA',
  surface: '#FFFFFF',
  border: '#D5DCE3',
  text: '#15314B',
  textMuted: '#4A5B6C',
  textOnDark: '#FFFFFF',
  mint: '#A8E0C2',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Minimum touch target sizes (dp). Drivers get bigger targets (gloves, moving truck). */
export const touch = { min: 48, large: 56, driver: 72 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export type TextVariant =
  'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption';

/** Base sizes; multiplied by LARGE_TEXT_SCALE in "Malaking teksto" mode and by the OS font scale. */
export const typography: Record<
  TextVariant,
  { fontFamily: string; fontSize: number; lineHeight: number }
> = {
  display: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 40 },
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32 },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
};

export const LARGE_TEXT_SCALE = 1.2;

/** Max content width for resident screens on large displays. */
export const layout = { residentMaxWidth: 560, pageMaxWidth: 1100 } as const;
