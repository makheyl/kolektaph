import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/theme/tokens';

interface PanelProps {
  title: string;
  children: ReactNode;
  action?: { label: string; onPress: () => void };
}

/** Titled dashboard card. */
export function Panel({ title, children, action }: PanelProps) {
  return (
    <Card>
      <View style={styles.header}>
        <AppText variant="heading" accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
        {action ? (
          <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={8}>
            <AppText variant="label" color={colors.primary} style={styles.link}>
              {action.label}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  link: { textDecorationLine: 'underline' },
});
