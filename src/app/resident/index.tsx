import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { NextCollectionCard } from '@/features/resident/components/NextCollectionCard';
import { QuickAction } from '@/features/resident/components/QuickAction';
import { StatusCard } from '@/features/resident/components/StatusCard';
import { barangayLabel } from '@/features/resident/format';
import { useResidentToday } from '@/features/resident/useResidentToday';
import { useBarangays } from '@/features/tracking/hooks';
import { formatClock } from '@/lib/time';
import { colors, spacing } from '@/theme/tokens';

/** Home: answers "Kailan darating ang truck?" at the top, without scrolling. */
export default function ResidentHome() {
  const { t } = useTranslation();
  const { data: barangays } = useBarangays();
  const { barangayId, now, next, status, truck } = useResidentToday();

  const props = barangays?.features.find((f) => f.properties.id === barangayId)?.properties;
  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';

  return (
    <Screen>
      <AppHeader
        eyebrow={props ? t('resident.home.yourBarangay') : undefined}
        title={props ? barangayLabel(props) : t('app.name')}
        actions={
          <IconButton
            icon="cog-outline"
            label={t('common.settings')}
            onPress={() => router.push('/resident/settings')}
          />
        }
      />
      <SampleDataBadge />

      <StatusCard status={status} now={now} barangayName={props?.name ?? ''} nameOf={nameOf} />

      {barangayId ? <NextCollectionCard next={next} now={now} /> : null}

      <View style={styles.grid}>
        <QuickAction
          icon="map-marker-radius"
          label={t('resident.home.actions.map')}
          onPress={() => router.push('/resident/map')}
        />
        <QuickAction
          icon="calendar-month"
          label={t('resident.home.actions.schedule')}
          onPress={() => router.push('/resident/schedule')}
        />
        <QuickAction
          icon="camera-outline"
          label={t('resident.home.actions.report')}
          onPress={() => router.push('/resident/report')}
        />
        <QuickAction
          icon="chat-question-outline"
          label={t('resident.home.actions.kolek')}
          onPress={() => router.push('/resident/kolek')}
        />
      </View>

      {truck ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.updated}>
          {t('resident.home.lastUpdate', { time: formatClock(truck.at) })}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  updated: { textAlign: 'center', paddingBottom: spacing.lg },
});
