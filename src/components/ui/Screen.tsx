import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  /** "resident" = phone-width column centred on large screens; "page" = wide dashboard layout. */
  width?: 'resident' | 'page';
  scroll?: boolean;
}

export function Screen({ children, width = 'resident', scroll = true }: ScreenProps) {
  const maxWidth = width === 'resident' ? layout.residentMaxWidth : layout.pageMaxWidth;
  const content = <View style={[styles.content, { maxWidth }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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
});
