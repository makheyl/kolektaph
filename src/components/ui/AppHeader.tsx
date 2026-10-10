import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark, Wordmark } from '@/components/brand/Brand';
import { useWebTitle } from '@/lib/webTitle';
import { colors, layout, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { useNarrow } from './narrow';

interface AppHeaderProps {
  title: string;
  /** Small line above the title, e.g. the barangay or a ticket number. */
  eyebrow?: string;
  /** Small line under the title (or under the name on Home, for the greeting). */
  subtitle?: string;
  /** Right-side actions (IconButtons). */
  actions?: ReactNode;
  /** Left-side action, e.g. a back or close IconButton. */
  leading?: ReactNode;
  /** With "brand": makes the logo a button (Home: to the first screen, to change who is using). */
  onBrandPress?: () => void;
  /** What that button does, for screen readers. */
  brandLabel?: string;
  /** "brand" = the logo and name instead of a title (Home). */
  variant?: 'page' | 'brand';
  /**
   * "mint" = the usual bar. "green" = the Profile sub-pages: a green bar with a white title (the
   * buttons in it take the white too, passed by the page).
   */
  tone?: 'mint' | 'green';
}

/**
 * The bar at the top of every screen. Inner pages: back (or close) at the left, the title centred
 * between two equal slots, actions at the right, so the title sits in the same place on every
 * page. Give it to `<Screen header={…}>` so it stays put while the page scrolls; it colours the
 * status bar area itself.
 */
export function AppHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  leading,
  onBrandPress,
  brandLabel,
  variant = 'page',
  tone = 'mint',
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  // On a very narrow screen the title gets as many lines as it takes: a cut-off name would be
  // lost words.
  const narrow = useNarrow();
  const green = tone === 'green';
  const ink = green ? colors.textOnDark : colors.primary;
  useWebTitle(variant === 'brand' ? null : title);

  if (variant === 'brand') {
    return (
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <View style={styles.brandRow}>
          <Pressable
            accessibilityRole={onBrandPress ? 'button' : undefined}
            accessibilityLabel={onBrandPress ? brandLabel : undefined}
            disabled={!onBrandPress}
            onPress={onBrandPress}
            style={styles.brand}
          >
            <BrandMark height={40} />
            <View style={styles.brandWords}>
              <Wordmark />
              {subtitle ? (
                <AppText variant="caption" color={colors.textMuted}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          </Pressable>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bar, green && styles.green, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {/* On a very narrow screen an empty slot gives its room to the title's words. */}
        {leading || !narrow ? <View style={styles.slot}>{leading}</View> : null}
        <View style={styles.title}>
          {eyebrow ? (
            <AppText variant="caption" color={green ? colors.textOnDark : colors.textMuted}>
              {eyebrow}
            </AppText>
          ) : null}
          <AppText
            variant={narrow ? 'bodyStrong' : 'heading'}
            color={ink}
            accessibilityRole="header"
            style={styles.center}
            numberOfLines={narrow ? undefined : 2}
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText
              variant="caption"
              color={green ? colors.textOnDark : colors.textMuted}
              style={styles.center}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {actions || !narrow ? <View style={[styles.slot, styles.slotEnd]}>{actions}</View> : null}
      </View>
    </View>
  );
}

/** The side slots are as wide as one button, so the title is centred whatever is in them. */
const SLOT = touch.min;

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.mint, paddingHorizontal: spacing.sm },
  green: { backgroundColor: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.appBarHeight,
    paddingVertical: spacing.xs,
  },
  slot: { width: SLOT, minWidth: SLOT, flexDirection: 'row', alignItems: 'center' },
  slotEnd: { justifyContent: 'flex-end' },
  title: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: spacing.xs, gap: 2 },
  center: { textAlign: 'center', maxWidth: '100%' },
  brandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.appBarHeight,
    paddingVertical: spacing.xs,
  },
  // With large text on a small phone the name goes under the logo, and the buttons under both.
  brand: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
  },
  brandWords: { flexShrink: 1, minWidth: 96 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
  },
});
