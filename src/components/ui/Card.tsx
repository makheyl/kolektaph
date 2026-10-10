import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme/tokens';

interface CardProps extends ViewProps {
  /**
   * "elevated" = white with the soft shadow (the default); "mint" = the brand-tinted card
   * (Kolek, success); "flat" = white with only the hairline, for cards inside cards; "hero" =
   * brand green for a page's headline number (points, tonnes). Text inside it is white.
   */
  variant?: 'elevated' | 'mint' | 'flat' | 'hero';
}

export function Card({ style, variant = 'elevated', ...rest }: CardProps) {
  return <View {...rest} style={[styles.card, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  elevated: shadows.card,
  mint: { backgroundColor: colors.mint, borderColor: colors.mint, ...shadows.card },
  flat: {},
  hero: { backgroundColor: colors.primary, borderColor: colors.primary, ...shadows.card },
});
