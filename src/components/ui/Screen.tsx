import { type ReactNode, useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHasBottomBar } from '@/components/layout/PhoneFrame';
import { hideAppSplash } from '@/lib/splash';
import { colors, layout, spacing } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  /**
   * "resident" = phone-width column centred on large screens; "form" = a narrow sign-in column;
   * "page" = wide layout (demo); "dashboard" = full width for the City ENRO dashboard.
   */
  width?: 'resident' | 'form' | 'page' | 'dashboard';
  scroll?: boolean;
  /** Set false when a surrounding layout (e.g. the ENRO top bar) already pads the status bar. */
  safeTop?: boolean;
  /** The bar that stays at the top (an AppHeader). It covers the status bar area itself. */
  header?: ReactNode;
  /** Stays at the bottom, in reach of the thumb: the screen's main action. */
  footer?: ReactNode;
  /**
   * "tint" = pale mint (welcome, sign-in); "mint" = the brand mint behind the profile pages;
   * "dashboard" = behind City ENRO panels.
   */
  tone?: 'page' | 'tint' | 'mint' | 'dashboard';
  /** No padding or gaps: the content draws edge to edge (a full-width map) and spaces itself. */
  flush?: boolean;
  /** Short content sits in the middle of a tall screen instead of at its top (sign-in on a laptop). */
  centered?: boolean;
}

const MAX_WIDTH = {
  resident: layout.residentMaxWidth,
  form: layout.formMaxWidth,
  page: layout.pageMaxWidth,
  dashboard: 1600,
};

const BACKGROUND = {
  page: colors.page,
  tint: colors.mintSoft,
  mint: colors.mint,
  dashboard: colors.dashboard,
};

export function Screen({
  children,
  width = 'resident',
  scroll = true,
  safeTop = true,
  header,
  footer,
  tone = 'page',
  flush = false,
  centered = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  // The resident tab bar already keeps clear of the phone's bottom edge.
  const bottomInset = useHasBottomBar() ? 0 : insets.bottom;
  // The first screen to draw takes the launch screen away.
  useEffect(hideAppSplash, []);

  const maxWidth = MAX_WIDTH[width];
  // Without scrolling, the content fills the screen so a map can take the remaining height.
  const content = (
    <View
      style={[
        styles.content,
        { maxWidth },
        !scroll && styles.fill,
        flush && styles.flush,
        centered && styles.centered,
      ]}
    >
      {children}
    </View>
  );
  return (
    <View style={[styles.root, { backgroundColor: BACKGROUND[tone] }]}>
      {header}
      <SafeAreaView
        style={styles.safe}
        edges={safeTop && !header ? ['top', 'left', 'right'] : ['left', 'right']}
      >
        {scroll ? (
          <ScrollView
            // On the web the page itself takes keyboard focus, so a page of plain text (the
            // privacy notice) can still be scrolled with the arrow keys.
            focusable={Platform.OS === 'web'}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: footer ? 0 : bottomInset + spacing.md },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: bottomInset + spacing.md, backgroundColor: BACKGROUND[tone] },
            ]}
          >
            <View style={[styles.footerInner, { maxWidth }]}>{footer}</View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.xl,
  },
  fill: { flex: 1, gap: spacing.md },
  flush: { padding: 0, gap: 0 },
  centered: { flexGrow: 1, justifyContent: 'center' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerInner: { width: '100%', alignSelf: 'center', gap: spacing.sm },
});
