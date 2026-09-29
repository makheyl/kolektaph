import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/theme/tokens';

/** Always-visible key for the route preview: solid = collected, dashed = still to come. */
export function MapLegend() {
  const { t } = useTranslation();
  return (
    <View style={styles.legend}>
      <View style={styles.row}>
        <View style={[styles.line, styles.done]} />
        <AppText variant="caption">{t('resident.map.legendDone')}</AppText>
      </View>
      <View style={styles.row}>
        <View style={[styles.line, styles.next]} />
        <AppText variant="caption">{t('resident.map.legendNext')}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { width: 28, height: 0 },
  done: { borderTopWidth: 5, borderColor: colors.green },
  next: { borderTopWidth: 3, borderColor: colors.navy, borderStyle: 'dashed' },
});
