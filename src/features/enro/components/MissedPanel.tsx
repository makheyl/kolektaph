import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { MissedStreet, Truck } from '@/services/types';
import { colors, spacing } from '@/theme/tokens';

import { formatDistance } from '../format';
import { Panel } from './Panel';

interface MissedPanelProps {
  missed: MissedStreet[];
  trucks: Truck[];
  nameOf: (barangayId: string) => string;
}

/** "Missed streets today (GPS check)": caught the same day, not after a week of complaints. */
export function MissedPanel({ missed, trucks, nameOf }: MissedPanelProps) {
  const { t } = useTranslation();
  return (
    <Panel title={t('enro.live.missedTitle')}>
      {missed.length === 0 ? (
        <AppText color={colors.textMuted}>{t('enro.live.noMissed')}</AppText>
      ) : (
        missed.map((m) => (
          <View key={m.id} style={styles.row}>
            <Icon name="map-marker-remove" size={22} color={colors.red} />
            <View style={styles.text}>
              <AppText variant="bodyStrong">
                {m.name ?? t('enro.live.unnamed')}, {nameOf(m.barangayId)}
              </AppText>
              <AppText variant="label" color={colors.textMuted}>
                {t(`enro.live.missedReason.${m.reason}`, {
                  reason: m.skipReason ? t(`skipReason.${m.skipReason}`) : '',
                })}{' '}
                · {trucks.find((tr) => tr.id === m.truckId)?.name} · {formatDistance(t, m.lengthM)}
              </AppText>
            </View>
          </View>
        ))
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1 },
});
