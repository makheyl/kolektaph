import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { loadColor } from '@/features/tracking/statusMeta';
import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

/** Truck load 0..1, shown as a bar plus a text value ("75%" or "Puno"). */
export function LoadBar({ value }: { value: number }) {
  const { t } = useTranslation();
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const text = pct >= 100 ? t('truck.loadFull') : `${pct}%`;
  const color = loadColor(value);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${t('truck.load')}: ${text}`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <AppText variant="label" color={colors.textMuted} style={styles.label}>
        {t('truck.load')}
      </AppText>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <AppText variant="label" color={pct >= 100 ? colors.red : colors.text} style={styles.value}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { minWidth: 48 },
  track: {
    flex: 1,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.greySoft,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  value: { minWidth: 48, textAlign: 'right' },
});
