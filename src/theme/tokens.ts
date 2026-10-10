/**
 * KolektaPH design tokens, from the Figma file: the mint and greens of the logo, white cards with
 * a soft shadow. Green = brand and "collected / on route", yellow = alerts (dark text on top),
 * red = missed / full / problem. Contrast pairs are unit-tested (WCAG AA).
 */
export const colors = {
  /** Brand green: filled buttons, links, active states. */
  primary: '#177A42',
  /** The logo's dark teal: icons, headings on mint, neutral statuses. */
  ink: '#114344',
  /** App bar, tab bar, Kolek's card and bubbles, tonal buttons. */
  mint: '#CBFFDA',
  /** Tinted pages (welcome, onboarding, sign-in) and soft fills. */
  mintSoft: '#EDFFF2',
  /** Edge of mint chips and cards, so they keep their shape on white and on mint. */
  mintEdge: '#9EDDB4',
  page: '#FFFFFF',
  surface: '#FFFFFF',
  /** Behind the City ENRO dashboard, and behind the phone column on wide screens. */
  dashboard: '#F4F8F5',
  /** Hairline around cards and between rows. */
  border: '#DCE7E0',
  /** Outline of inputs and unselected controls: 3:1 against the page (WCAG 1.4.11). */
  fieldBorder: '#6F8A7C',
  green: '#177A42',
  greenSoft: '#E2F4E8',
  yellow: '#F2B600',
  yellowSoft: '#FFF3C9',
  red: '#B3261E',
  redSoft: '#FBE6E4',
  amber: '#9A5200',
  amberSoft: '#FDEBD3',
  /** "Scheduled": the third status colour beside amber (being looked at) and green (done). */
  blue: '#0B5CAD',
  blueSoft: '#E3EEFB',
  /** "Driver" in the driver app's logo. A shade darker than the artwork, so the word reads on mint. */
  brandOrange: '#C4600A',
  grey: '#5C6B63',
  greySoft: '#EEF2EF',
  text: '#10241A',
  textMuted: '#4B5F55',
  textOnDark: '#FFFFFF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/**
 * The Figma's soft shadows. Cards also keep a hairline border, for phones that draw no shadow
 * (Android 8 and older).
 */
export const shadows = {
  card: { boxShadow: '0 4px 8px rgba(0, 0, 0, 0.12)' },
  raised: { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.22)' },
} as const;

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

export const layout = {
  /** Max content width for resident screens on large displays. */
  residentMaxWidth: 560,
  pageMaxWidth: 1100,
  /** Sign-in and welcome forms. */
  formMaxWidth: 440,
  /** The mint bar at the top of every screen, below the status bar. */
  appBarHeight: 60,
  /** The floating bar at the bottom of the resident app. */
  tabBarHeight: 64,
  /** Below this width (a small phone at 200% text) an icon beside words gives its room to them. */
  narrowWidth: 280,
} as const;
