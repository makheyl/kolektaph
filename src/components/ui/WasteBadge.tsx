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
            <Icon name={name} size={20} color={colors.primary} />
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
  // The words drop under the pictograms at 200% text instead of running off the card.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  icons: { flexDirection: 'row', gap: spacing.xs },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
});
