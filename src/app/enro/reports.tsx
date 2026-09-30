import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { Panel } from '@/features/enro/components/Panel';
import { ReportDetail } from '@/features/enro/components/ReportDetail';
import { isEmergency } from '@/features/reports/categories';
import { PriorityPill, TicketCard } from '@/features/reports/components/TicketBits';
import { suggestDispatch } from '@/features/reports/dispatch';
import { useTickets } from '@/features/reports/hooks';
import { isOpen, priority } from '@/features/reports/priority';
import {
  useBarangays,
  useCityMeta,
  useOps,
  useRouteSchedules,
  useRoutes,
  useScheduleExceptions,
  useTrucks,
} from '@/features/tracking/hooks';
import { spacing } from '@/theme/tokens';

const TWO_COLUMNS = 1100;
type StatusFilter = 'open' | 'all' | 'closed';

/**
 * City ENRO reports queue (HAKOT §6.2, plan §6.3): open reports by priority, filters, and one
 * report in detail with the suggested handling and the actions.
 */
export default function EnroReports() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;
  const tickets = useTickets();
  const ops = useOps();
  const { data: trucks = [] } = useTrucks();
  const { data: routes = [] } = useRoutes();
  const { data: schedules = [] } = useRouteSchedules();
  const { data: exceptions = [] } = useScheduleExceptions();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const [status, setStatus] = useState<StatusFilter>('open');
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [barangay, setBarangay] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const now = ops?.at ?? 0;
  const scored = useMemo(
    () => tickets.map((ticket) => ({ ticket, priority: priority(ticket, tickets, now) })),
    [tickets, now],
  );

  if (!ops || !barangays || !meta) {
    return (
      <Screen width="dashboard" safeTop={false}>
        {null}
      </Screen>
    );
  }

  const nameOf = (id: string | null) =>
    barangays.features.find((f) => f.properties.id === id)?.properties.name ?? '';
  const open = scored.filter((s) => isOpen(s.ticket));
  const shown = scored
    .filter((s) =>
      status === 'open' ? isOpen(s.ticket) : status === 'closed' ? !isOpen(s.ticket) : true,
    )
    .filter((s) => !emergencyOnly || isEmergency(s.ticket.category))
    .filter((s) => !barangay || s.ticket.barangayId === barangay)
    .sort((a, b) =>
      isOpen(a.ticket) && isOpen(b.ticket)
        ? b.priority.score - a.priority.score || a.ticket.createdAt - b.ticket.createdAt
        : Number(isOpen(b.ticket)) - Number(isOpen(a.ticket)) ||
          b.ticket.createdAt - a.ticket.createdAt,
    );
  const selected = shown.find((s) => s.ticket.id === chosen) ?? shown[0] ?? null;
  const suggestion =
    selected && ['submitted', 'verified'].includes(selected.ticket.status)
      ? suggestDispatch({
          ticket: selected.ticket,
          tickets,
          states: ops.states,
          schedules,
          routes,
          exceptions,
          now,
        })
      : null;

  const list = (
    <Panel title={t('enro.reports.title')}>
      <View style={styles.chips}>
        {(['open', 'all', 'closed'] as StatusFilter[]).map((f) => (
          <Chip
            key={f}
            label={t(`enro.reports.filter${f[0].toUpperCase()}${f.slice(1)}`)}
            selected={status === f}
            onPress={() => setStatus(f)}
          />
        ))}
        <Chip
          label={t('enro.reports.filterEmergency')}
          selected={emergencyOnly}
          onPress={() => setEmergencyOnly(!emergencyOnly)}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip
          label={t('enro.reports.allBarangays')}
          selected={!barangay}
          onPress={() => setBarangay(null)}
        />
        {barangays.features.map((f) => (
          <Chip
            key={f.properties.id}
            label={f.properties.name}
            selected={barangay === f.properties.id}
            onPress={() => setBarangay(f.properties.id)}
          />
        ))}
      </ScrollView>
      {shown.length === 0 ? <AppText>{t('enro.reports.empty')}</AppText> : null}
      {shown.map(({ ticket, priority: p }) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          barangayName={nameOf(ticket.barangayId)}
          selected={selected?.ticket.id === ticket.id}
          onPress={() => setChosen(ticket.id)}
          right={isOpen(ticket) ? <PriorityPill priority={p} /> : null}
        />
      ))}
    </Panel>
  );

  const detail = selected ? (
    <ReportDetail
      key={selected.ticket.id}
      ticket={selected.ticket}
      tickets={tickets}
      priority={selected.priority}
      suggestion={suggestion}
      states={ops.states}
      trucks={trucks}
      barangays={barangays}
      meta={meta}
      now={now}
      nameOf={nameOf}
    />
  ) : (
    <Panel title={t('enro.reports.details')}>
      <AppText>{t('enro.reports.select')}</AppText>
    </Panel>
  );

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.reports.title')}
        </AppText>
        <AppText>
          {t('enro.reports.subtitle', {
            open: open.length,
            high: open.filter((s) => s.priority.level === 'high').length,
          })}
        </AppText>
        <SampleDataBadge />
      </View>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.listCol}>{list}</View>
          <View style={styles.detailCol}>{detail}</View>
        </View>
      ) : (
        <>
          {detail}
          {list}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  listCol: { flex: 2, minWidth: 0 },
  detailCol: { flex: 3, minWidth: 0 },
});
