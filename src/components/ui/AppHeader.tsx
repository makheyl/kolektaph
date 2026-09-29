import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

interface AppHeaderProps {
  title: string;
  /** Small line above the title, e.g. "Ang barangay mo". */
  eyebrow?: string;
  /** Right-side actions (IconButtons). */
  actions?: ReactNode;
  /** Left-side action, e.g. a back IconButton. */
  leading?: ReactNode;
}

export function AppHeader({ title, eyebrow, actions, leading }: AppHeaderProps) {
  return (
    <View style={styles.row}>
      {leading}
      <View style={styles.text}>
        {eyebrow ? (
          <AppText variant="label" color={colors.textMuted}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="title" accessibilityRole="header" numberOfLines={2}>
          {title}
        </AppText>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
