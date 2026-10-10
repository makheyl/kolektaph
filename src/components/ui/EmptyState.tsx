import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  hint?: string;
  /** What to do about it (a Button). */
  children?: ReactNode;
}

/** "Nothing here yet", said plainly, with the next step when there is one. */
export function EmptyState({ icon, title, hint, children }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon} aria-hidden>
        <Icon name={icon} size={32} color={colors.ink} />
      </View>
      <AppText variant="bodyStrong" style={styles.center}>
        {title}
      </AppText>
      {hint ? (
        <AppText variant="label" color={colors.textMuted} style={styles.center}>
          {hint}
        </AppText>
      ) : null}
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  center: { textAlign: 'center' },
  action: { alignSelf: 'stretch', paddingTop: spacing.sm },
});
