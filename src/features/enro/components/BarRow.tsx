import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/theme/tokens';

interface BarRowProps {
  label: string;
  /** 0..1 of the bar's full width. */
  fraction: number;
  /** The value as text (the bar is never the only way to read it). */
  value: string;
  color?: string;
}

/** A labelled horizontal bar with its value written next to it. */
export function BarRow({ label, fraction, value, color = colors.green }: BarRowProps) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%` as const;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="label" style={styles.label} numberOfLines={1}>
        {label}
      </AppText>
      <View style={styles.track}>
        <View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>
      <AppText variant="label" style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  label: { width: 140 },
  track: {
    flex: 1,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.greySoft,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  value: { width: 110, textAlign: 'right' },
});
