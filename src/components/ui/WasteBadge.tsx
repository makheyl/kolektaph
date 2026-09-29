import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { WasteType } from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

const ICONS: Record<WasteType, IconName[]> = {
  mixed: ['leaf', 'bottle-soda-outline'],
  biodegradable: ['leaf'],
  residual: ['trash-can-outline'],
  recyclable: ['recycle'],
};

/** Pictograms + words for the waste type, so it reads at a glance even for low-literacy users. */
export function WasteBadge({ type }: { type: WasteType }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.icons}>
        {ICONS[type].map((name) => (
          <View key={name} style={styles.iconWrap}>
            <Icon name={name} size={20} color={colors.green} />
          </View>
        ))}
      </View>
      <AppText variant="label" style={styles.text}>
        {t(`waste.${type}`)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icons: { flexDirection: 'row', gap: spacing.xs },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
});
