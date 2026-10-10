import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  type DimensionValue,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Corner radius; `pill` for avatars and chips. */
  round?: number;
  style?: ViewStyle;
}

/** One grey block standing in for content that is still loading. Use inside SkeletonGroup. */
export function Skeleton({ width = '100%', height = 16, round = radius.sm, style }: SkeletonProps) {
  return <View style={[styles.block, { width, height, borderRadius: round }, style]} />;
}

/**
 * The placeholder for a part of a screen that is loading: its blocks pulse together (still when
 * the phone asks for less motion), and a screen reader hears one "Naglo-load…" instead of the
 * blocks.
 */
export function SkeletonGroup({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { t } = useTranslation();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let pulse: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      );
      pulse.start();
    });
    return () => {
      cancelled = true;
      pulse?.stop();
    };
  }, [opacity]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
      style={style}
    >
      <Animated.View style={[styles.group, { opacity }]} aria-hidden>
        {children}
      </Animated.View>
    </View>
  );
}

/** A white card of grey lines: the usual stand-in for one card of a list. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Skeleton width={44} height={44} round={radius.pill} />
        <View style={styles.cardText}>
          <Skeleton width="70%" height={18} />
          <Skeleton width="45%" height={14} />
        </View>
      </View>
      {Array.from({ length: Math.max(0, lines - 2) }, (_, i) => (
        <Skeleton key={i} width={i % 2 ? '60%' : '90%'} height={14} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.greySoft },
  group: { gap: spacing.lg },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardText: { flex: 1, gap: spacing.sm },
});
