import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { HaulingCard } from '@/features/hauling/components/HaulingBits';
import { useMyHauling } from '@/features/hauling/hooks';
import { haulingGroup, haulingView } from '@/features/hauling/status';
import { TicketCard } from '@/features/reports/components/TicketBits';
import { matchesSearch, type StatusGroup, statusGroup } from '@/features/reports/filters';
import { useMyTickets } from '@/features/reports/hooks';
import { useBarangays, useSimNow } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import type { HaulingRequest, Ticket } from '@/services/types';
import { useMyReports } from '@/stores/myReports';
import { colors, spacing } from '@/theme/tokens';

type Filter = 'all' | Exclude<StatusGroup, 'other'>;

/** A phone's worth of reports at a time; the rest come with "Ipakita ang … pa". */
const PAGE = 5;

type Item =
  | { kind: 'ticket'; at: number; ticket: Ticket }
  | { kind: 'hauling'; at: number; request: HaulingRequest };

/**
 * The resident's reports and hauling requests in one list: those waiting for signal, then
 * everything filed, newest first, each with its latest status.
 */
export default function MyReports() {
  const { t } = useTranslation();
  const tickets = useMyTickets();
  const hauling = useMyHauling() ?? [];
  const now = useSimNow(60_000);
  const pending = useMyReports((s) => s.pending);
  const dequeue = useMyReports((s) => s.dequeue);
  const seen = useMyReports((s) => s.seen);
  const { data: barangays } = useBarangays();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';

  const items: Item[] = [
    ...tickets.map((ticket) => ({ kind: 'ticket' as const, at: ticket.createdAt, ticket })),
    ...hauling.map((request) => ({ kind: 'hauling' as const, at: request.createdAt, request })),
  ].sort((a, b) => b.at - a.at);
  const found = items.filter((item) =>
    item.kind === 'ticket'
      ? (filter === 'all' || statusGroup(item.ticket.status) === filter) &&
        matchesSearch(item.ticket, query, {
          barangayName: nameOf(item.ticket.barangayId),
          categoryName: t(`reports.category.${item.ticket.category}`),
        })
      : (filter === 'all' || haulingGroup(haulingView(item.request, now)) === filter) &&
        matchesSearch({ id: item.request.id, landmark: item.request.landmark }, query, {
          barangayName: nameOf(item.request.barangayId),
          categoryName: t('hauling.title'),
        }),
  );
  const shown = found.slice(0, limit);
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('reports.mine.filterAll', { count: items.length }) },
    { id: 'review', label: t('reports.mine.filterReview') },
    { id: 'scheduled', label: t('reports.mine.filterScheduled') },
    { id: 'done', label: t('reports.mine.filterDone') },
  ];

  return (
    <Screen
      header={
        <AppHeader
          title={t('reports.mine.title')}
          leading={
            <IconButton
              icon="arrow-left"
              label={t('common.back')}
              onPress={() => goBack('/resident')}
            />
          }
          actions={
            <IconButton
              icon="map-marker-remove"
              label={t('resident.home.actions.missed')}
              onPress={() => router.push('/resident/missed')}
            />
          }
        />
      }
      footer={
        <Button
          icon="camera-plus-outline"
          label={t('reports.mine.new')}
          onPress={() => router.push('/resident/report')}
        />
      }
    >
      {pending.map((p) => (
        <Notice
          key={p.localId}
          tone={p.refused ? 'danger' : 'warning'}
          icon={p.refused ? 'alert' : 'cloud-upload-outline'}
        >
          <View>
            <AppText variant="bodyStrong">{t(`reports.category.${p.report.category}`)}</AppText>
            <AppText variant="label" color={colors.textMuted}>
              {t(p.refused ? 'reports.mine.refused' : 'reports.mine.pending')} ·{' '}
              {formatClock(p.savedAt)}
            </AppText>
            <AppText variant="caption">
              {p.refused
                ? t(`reports.refused.${p.refused}`, { defaultValue: t('reports.refused.other') })
                : t('reports.mine.pendingHint')}
            </AppText>
          </View>
          {p.refused ? (
            <Button
              variant="secondary"
              size="compact"
              icon="delete-outline"
              label={t('reports.mine.remove')}
              onPress={() => dequeue(p.localId)}
            />
          ) : null}
        </Notice>
      ))}

      {items.length === 0 && pending.length === 0 ? (
        <EmptyState icon="clipboard-list-outline" title={t('reports.mine.empty')} />
      ) : null}

      {items.length ? (
        <View style={styles.find}>
          <TextField
            label={t('reports.mine.search')}
            placeholder={t('reports.mine.searchHint')}
            icon="magnify"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setLimit(PAGE);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <View style={styles.filters} accessibilityLabel={t('reports.mine.title')}>
            {filters.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                selected={filter === f.id}
                onPress={() => {
                  setFilter(f.id);
                  setLimit(PAGE);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {items.length && found.length === 0 ? (
        <EmptyState icon="magnify" title={t('reports.mine.noMatch')} />
      ) : null}

      {shown.map((item) =>
        item.kind === 'ticket' ? (
          <TicketCard
            key={item.ticket.id}
            ticket={item.ticket}
            barangayName={nameOf(item.ticket.barangayId)}
            badge={
              (seen[item.ticket.id] ?? 0) < item.ticket.history.length
                ? t('reports.mine.updated')
                : null
            }
            onPress={() =>
              router.push({ pathname: '/resident/reports/[id]', params: { id: item.ticket.id } })
            }
          />
        ) : (
          <HaulingCard
            key={item.request.id}
            request={item.request}
            barangayName={nameOf(item.request.barangayId)}
            now={now}
            onPress={() =>
              router.push({ pathname: '/resident/hauling/[id]', params: { id: item.request.id } })
            }
          />
        ),
      )}

      {found.length > shown.length ? (
        <Button
          variant="ghost"
          icon="chevron-down"
          label={t('reports.mine.showMore', { count: found.length - shown.length })}
          onPress={() => setLimit(limit + PAGE)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  find: { gap: spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
