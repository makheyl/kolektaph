import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  /**
   * "resident" = phone-width column centred on large screens; "page" = wide layout (demo);
   * "dashboard" = full width for the City ENRO dashboard.
   */
  width?: 'resident' | 'page' | 'dashboard';
  scroll?: boolean;
  /** Set false when a surrounding layout (e.g. the ENRO top bar) already pads the status bar. */
  safeTop?: boolean;
}

const MAX_WIDTH = {
  resident: layout.residentMaxWidth,
  page: layout.pageMaxWidth,
  dashboard: 1600,
};

export function Screen({
  children,
  width = 'resident',
  scroll = true,
  safeTop = true,
}: ScreenProps) {
  // Without scrolling, the content fills the screen so a map can take the remaining height.
  const content = (
    <View style={[styles.content, { maxWidth: MAX_WIDTH[width] }, !scroll && styles.fill]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView
      style={styles.safe}
      edges={safeTop ? ['top', 'left', 'right'] : ['left', 'right']}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.xl,
  },
  fill: { flex: 1, gap: spacing.md },
});
