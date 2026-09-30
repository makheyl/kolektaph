import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { TicketCard } from '@/features/reports/components/TicketBits';
import { useMyTickets } from '@/features/reports/hooks';
import { useBarangays } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import { useMyReports } from '@/stores/myReports';
import { colors, spacing } from '@/theme/tokens';

/** The resident's reports: waiting for signal, then every ticket with its latest status. */
export default function MyReports() {
  const { t } = useTranslation();
  const tickets = useMyTickets();
  const pending = useMyReports((s) => s.pending);
  const seen = useMyReports((s) => s.seen);
  const { data: barangays } = useBarangays();
  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';

  return (
    <Screen>
      <AppHeader
        title={t('reports.mine.title')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/resident')}
          />
        }
      />
      {pending.map((p) => (
        <Card key={p.localId} style={styles.pending}>
          <View style={styles.row}>
            <Icon name="cloud-upload-outline" size={24} color={colors.navy} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t(`reports.category.${p.report.category}`)}</AppText>
              <AppText variant="label" color={colors.textMuted}>
                {t('reports.mine.pending')} · {formatClock(p.savedAt)}
              </AppText>
              <AppText variant="caption">{t('reports.mine.pendingHint')}</AppText>
            </View>
          </View>
        </Card>
      ))}
      {tickets.length === 0 && pending.length === 0 ? (
        <AppText color={colors.textMuted}>{t('reports.mine.empty')}</AppText>
      ) : null}
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          barangayName={nameOf(ticket.barangayId)}
          badge={(seen[ticket.id] ?? 0) < ticket.history.length ? t('reports.mine.updated') : null}
          onPress={() =>
            router.push({ pathname: '/resident/reports/[id]', params: { id: ticket.id } })
          }
        />
      ))}
      <Button
        icon="camera-plus-outline"
        label={t('reports.mine.new')}
        onPress={() => router.push('/resident/report')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pending: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
