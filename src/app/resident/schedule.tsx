import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { WasteBadge } from '@/components/ui/WasteBadge';
import { BarangayPicker } from '@/features/resident/components/BarangayPicker';
import {
  barangayLabel,
  formatDate,
  formatRelativeDay,
  formatWindow,
} from '@/features/resident/format';
import { useResidentToday } from '@/features/resident/useResidentToday';
import {
  type CollectionOccurrence,
  isRunning,
  scheduleValidOn,
} from '@/features/schedule/collections';
import { useBarangays, useRouteSchedules } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { atManilaTime, formatClock, manilaDateKey, parseDateKey } from '@/lib/time';
import type { Weekday } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, radius, spacing } from '@/theme/tokens';

/** The next two weeks of collections for a barangay, including holiday changes. */
export default function ScheduleScreen() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const savedBarangay = useSettings((s) => s.barangayId);
  const [viewing, setViewing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const barangayId = viewing ?? savedBarangay;

  const { data: barangays } = useBarangays();
  const { data: schedules } = useRouteSchedules();
  const { occurrences, now, routes } = useResidentToday(barangayId);
  const props = barangays?.features.find((f) => f.properties.id === barangayId)?.properties;

  // Regular weekdays for this barangay, e.g. "Martes at Biyernes", and announced changes.
  const todayKey = manilaDateKey(now);
  const own = (schedules ?? []).filter((s) =>
    routes?.find((r) => r.id === s.routeId)?.barangayIds.includes(barangayId ?? ''),
  );
  const regularDays = [
    ...new Set(own.filter((s) => scheduleValidOn(s, todayKey)).flatMap((s) => s.days)),
  ].sort() as Weekday[];
  const upcoming = own.filter((s) => s.validFrom && s.validFrom > todayKey);

  const note = (o: CollectionOccurrence) => {
    const reason = o.exception?.reason[language] ?? '';
    if (o.kind === 'moved_in') return t('resident.schedule.movedIn', { reason });
    if (o.kind === 'cancelled') return t('resident.schedule.cancelled', { reason });
    if (o.kind === 'moved_out' && o.exception?.moveTo) {
      return t('resident.schedule.movedOut', {
        reason,
        day: formatDate(t, parseDateKey(o.exception.moveTo)),
      });
    }
    return null;
  };

  return (
    <Screen>
      <AppHeader
        title={t('resident.schedule.title')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/resident')}
          />
        }
      />
      <SampleDataBadge />

      {picking ? (
        <BarangayPicker
          selectedId={barangayId}
          allowLocate={false}
          onSelect={(id) => {
            setViewing(id);
            setPicking(false);
          }}
        />
      ) : (
        <>
          {props ? (
            <View style={styles.summary}>
              <AppText variant="heading">
                {t('resident.schedule.for', { barangay: barangayLabel(props) })}
              </AppText>
              {regularDays.length ? (
                <AppText color={colors.textMuted}>
                  {t('resident.schedule.regularDays', {
                    days: regularDays.map((d) => t(`weekday.${d}`)).join(', '),
                  })}
                </AppText>
              ) : null}
              {upcoming.map((s) => {
                const from = parseDateKey(s.validFrom!);
                return (
                  <AppText key={s.validFrom} variant="bodyStrong" color={colors.amber}>
                    {t('resident.schedule.changeFrom', {
                      day: formatDate(t, from),
                      days: s.days.map((d) => t(`weekday.${d}`)).join(', '),
                      window: `${formatClock(atManilaTime(from, s.start))} – ${formatClock(atManilaTime(from, s.windowEnd))}`,
                    })}
                  </AppText>
                );
              })}
            </View>
          ) : null}

          <AppText variant="label" color={colors.textMuted}>
            {t('resident.schedule.nextTwoWeeks')}
          </AppText>

          {occurrences.length === 0 ? (
            <Card>
              <AppText color={colors.textMuted}>{t('resident.schedule.none')}</AppText>
            </Card>
          ) : (
            occurrences.map((o) => {
              const running = isRunning(o);
              const n = note(o);
              return (
                <Card key={`${o.routeId}-${o.day}`} style={!running && styles.offCard}>
                  <View style={styles.dayRow}>
                    <View style={[styles.dateBadge, !running && styles.dateBadgeOff]}>
                      <Icon
                        name={running ? 'calendar-check' : 'calendar-remove'}
                        size={24}
                        color={running ? colors.green : colors.grey}
                      />
                    </View>
                    <View style={styles.dayText}>
                      <AppText variant="heading">{formatRelativeDay(t, o.start, now)}</AppText>
                      {running ? <AppText variant="bodyStrong">{formatWindow(o)}</AppText> : null}
                    </View>
                  </View>
                  {n ? (
                    <AppText variant="label" color={running ? colors.amber : colors.textMuted}>
                      {n}
                    </AppText>
                  ) : null}
                  {running ? <WasteBadge type={o.wasteType} /> : null}
                </Card>
              );
            })
          )}

          <Button
            variant="secondary"
            icon="map-search-outline"
            label={t('resident.schedule.otherBarangay')}
            onPress={() => setPicking(true)}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.xs },
  offCard: { backgroundColor: colors.greySoft },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadgeOff: { backgroundColor: colors.surface },
  dayText: { flex: 1 },
});
