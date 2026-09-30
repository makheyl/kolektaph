import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { formatDistance } from '@/features/enro/format';
import { Panel } from '@/features/enro/components/Panel';
import { useTickets } from '@/features/reports/hooks';
import { formatRelativeDay } from '@/features/resident/format';
import { useBarangays, useMissedStreets, useSimNow, useTrucks } from '@/features/tracking/hooks';
import { DAY, manilaDateKey, manilaStartOfDay } from '@/lib/time';
import { services } from '@/services';
import type { MissedStreet } from '@/services/types';
import { colors, spacing } from '@/theme/tokens';

const DAYS_BACK = 7;

/**
 * Missed streets by day (plan §6.3): from the GPS coverage check and the crews' logs, with the
 * reason, and one tap to schedule a re-collection (a pickup ticket in the reports queue).
 */
export default function EnroMissed() {
  const { t } = useTranslation();
  const now = useSimNow(10_000);
  const today = manilaStartOfDay(now);
  const [day, setDay] = useState(today);
  const { data: missed = [], isLoading } = useMissedStreets(day);
  const { data: barangays } = useBarangays();
  const { data: trucks = [] } = useTrucks();
  const tickets = useTickets();
  const [busy, setBusy] = useState<string | null>(null);

  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const dayKey = manilaDateKey(day);
  const ticketFor = (m: MissedStreet) =>
    tickets.find(
      (tk) =>
        tk.category === 'MISSED' &&
        tk.missed?.day === dayKey &&
        tk.missed.routeId === m.routeId &&
        tk.barangayId === m.barangayId &&
        tk.missed.streetName === m.name,
    );
  const reasonText = (m: MissedStreet) =>
    t(`enro.live.missedReason.${m.reason}`, {
      reason: m.skipReason ? t(`skipReason.${m.skipReason}`) : '',
    });

  const byBarangay = new Map<string, MissedStreet[]>();
  for (const m of missed)
    byBarangay.set(m.barangayId, [...(byBarangay.get(m.barangayId) ?? []), m]);

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.missed.title')}
        </AppText>
        <AppText color={colors.textMuted}>{t('enro.missed.subtitle')}</AppText>
        <SampleDataBadge />
      </View>
      <View style={styles.chips}>
        {Array.from({ length: DAYS_BACK }, (_, i) => today - i * DAY).map((d) => (
          <Chip
            key={d}
            label={d === today ? t('enro.missed.today') : formatRelativeDay(t, d, now)}
            selected={day === d}
            onPress={() => setDay(d)}
          />
        ))}
      </View>

      {!isLoading && missed.length === 0 ? (
        <Panel title={formatRelativeDay(t, day, now)}>
          <AppText color={colors.textMuted}>{t('enro.missed.empty')}</AppText>
        </Panel>
      ) : null}

      {[...byBarangay.entries()].map(([barangayId, rows]) => (
        <Panel
          key={barangayId}
          title={`${nameOf(barangayId)} · ${t('enro.missed.count', { count: rows.length })}`}
        >
          {rows.map((m) => {
            const ticket = ticketFor(m);
            return (
              <View key={m.id} style={styles.row}>
                <Icon name="map-marker-remove" size={24} color={colors.red} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{m.name ?? t('enro.live.unnamed')}</AppText>
                  <AppText variant="label" color={colors.textMuted}>
                    {reasonText(m)} · {trucks.find((tr) => tr.id === m.truckId)?.name} ·{' '}
                    {formatDistance(t, m.lengthM)}
                  </AppText>
                </View>
                {ticket ? (
                  <AppText variant="label" color={colors.green}>
                    ✓ {t('enro.missed.scheduled', { ticket: ticket.id })}
                  </AppText>
                ) : (
                  <View style={styles.action}>
                    <Button
                      variant="secondary"
                      icon="calendar-clock"
                      label={t('enro.missed.schedule')}
                      disabled={busy === m.id}
                      onPress={async () => {
                        setBusy(m.id);
                        try {
                          await services.reports.scheduleRecollection(m, day);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </Panel>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
    paddingVertical: spacing.xs,
  },
  flex: { flex: 1, minWidth: 200 },
  action: { minWidth: 240 },
});
