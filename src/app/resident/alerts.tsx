import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { FeedCard } from '@/features/alerts/components/FeedCard';
import { type FeedGroup, type FeedItem, splitByDay } from '@/features/alerts/feed';
import { useMyFeed } from '@/features/resident/useMyFeed';
import { useBarangays, useSimNow } from '@/features/tracking/hooks';
import { services } from '@/services';
import { useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

type Filter = 'all' | Exclude<FeedGroup, 'city' | 'rewards'>;

/**
 * "Mga abiso": every alert sent to the resident's barangay and each step the City took on their
 * own reports, newest first.
 */
export default function AlertsScreen() {
  const { t } = useTranslation();
  const now = useSimNow(5000);
  const { barangayId, items, seenAt } = useMyFeed();
  const sms = useSettings((s) => s.sms);
  const markAlertsSeen = useSettings((s) => s.markAlertsSeen);
  const { data: barangays } = useBarangays();
  const name = barangays?.features.find((f) => f.properties.id === barangayId)?.properties.name;
  const [filter, setFilter] = useState<Filter>('all');

  // Remember what was unread when the screen opened, so it stays marked while being read.
  const [unreadSince] = useState(seenAt);
  const newest = items[0]?.at ?? 0;
  useEffect(() => {
    if (newest) markAlertsSeen(newest);
  }, [newest, markAlertsSeen]);

  const shown = filter === 'all' ? items : items.filter((i) => i.group === filter);
  const { today, earlier } = splitByDay(shown, now);
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('resident.alerts.filterAllCount', { count: items.length }) },
    { id: 'truck', label: t('resident.alerts.filterTruck') },
    { id: 'reports', label: t('resident.alerts.filterReports') },
    ...(services.features.hauling
      ? [{ id: 'hauling' as const, label: t('resident.alerts.filterHauling') }]
      : []),
  ];
  const open = (item: FeedItem) =>
    item.source === 'ticket'
      ? () => router.push({ pathname: '/resident/reports/[id]', params: { id: item.ticket.id } })
      : item.source === 'hauling'
        ? () => router.push({ pathname: '/resident/hauling/[id]', params: { id: item.requestId } })
        : item.source === 'points'
          ? () => router.push('/resident/rewards')
          : undefined;

  const list = (heading: string, group: FeedItem[]) =>
    group.length ? (
      <View style={styles.group}>
        <AppText variant="label" color={colors.textMuted} accessibilityRole="header">
          {heading}
        </AppText>
        {group.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            now={now}
            unread={item.at > unreadSince}
            onPress={open(item)}
          />
        ))}
      </View>
    ) : null;

  return (
    <Screen header={<AppHeader title={t('resident.alerts.title')} />}>
      <View style={styles.intro}>
        <SampleDataBadge />
        <AppText color={colors.textMuted}>
          {name
            ? t('resident.alerts.subtitle', { barangay: name })
            : t('resident.alerts.pickBarangay')}
        </AppText>
      </View>

      {items.length ? (
        <View style={styles.filters} accessibilityLabel={t('resident.alerts.title')}>
          {filters.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              selected={filter === f.id}
              onPress={() => setFilter(f.id)}
            />
          ))}
        </View>
      ) : null}

      {barangayId && shown.length === 0 ? (
        <EmptyState
          icon="bell-outline"
          title={t(items.length ? 'resident.alerts.noneInFilter' : 'resident.alerts.empty')}
        />
      ) : null}

      {list(t('resident.alerts.today'), today)}
      {list(t('resident.alerts.earlier'), earlier)}

      {items.some((i) => i.source === 'alert') ? (
        <AppText variant="caption" color={colors.textMuted}>
          {sms ? t('resident.alerts.viaSms') : t('resident.alerts.smsOff')}
        </AppText>
      ) : null}
      {!sms && barangayId ? (
        <Button
          icon="message-text"
          label={t('resident.settings.smsTurnOn')}
          onPress={() => router.push({ pathname: '/onboarding/sms', params: { from: 'settings' } })}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  group: { gap: spacing.sm },
});
