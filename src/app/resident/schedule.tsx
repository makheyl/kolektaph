import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { WasteBadge } from '@/components/ui/WasteBadge';
import { BarangayPicker } from '@/features/resident/components/BarangayPicker';
import { NextCollectionCard } from '@/features/resident/components/NextCollectionCard';
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
import { useBarangays, useRouteSchedules, useTrucks } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { atManilaTime, formatClock, manilaDateKey, parseDateKey } from '@/lib/time';
import type { Weekday } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type Tab = 'schedule' | 'routes';

/** The edge colour of routes 1 to 4 (then they repeat), as in the design's route list. */
const ROUTE_EDGES = [colors.amber, colors.red, colors.primary, colors.blue];

/**
 * The next two weeks of collections for a barangay, including holiday changes, and every
 * route of the city with its days.
 */
export default function ScheduleScreen() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const savedBarangay = useSettings((s) => s.barangayId);
  const [viewing, setViewing] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('schedule');
  const [picking, setPicking] = useState(false);
  const barangayId = viewing ?? savedBarangay;

  const { data: barangays } = useBarangays();
  const { data: schedules } = useRouteSchedules();
  const { data: trucks = [] } = useTrucks();
  const { occurrences, now, next, routes, ready } = useResidentToday(barangayId);
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
  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  // Every route with the schedule in force today: which barangays, which days, what time.
  const routeRows = (routes ?? []).map((route, index) => {
    const inForce = (schedules ?? []).filter(
      (s) => s.routeId === route.id && scheduleValidOn(s, todayKey),
    );
    const first = inForce[0];
    return {
      route,
      number: index + 1,
      truck: trucks.find((tr) => tr.id === first?.truckId),
      days: [...new Set(inForce.flatMap((s) => s.days))].sort() as Weekday[],
      window: first
        ? `${formatClock(atManilaTime(now, first.start))} – ${formatClock(atManilaTime(now, first.windowEnd))}`
        : null,
      mine: route.barangayIds.includes(savedBarangay ?? ''),
    };
  });

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
    <Screen
      header={
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
      }
    >
      <SegmentedTabs
        label={t('resident.schedule.title')}
        tabs={[
          { id: 'schedule', label: t('resident.schedule.tabSchedule') },
          { id: 'routes', label: t('resident.schedule.tabRoutes') },
        ]}
        value={tab}
        onChange={setTab}
      />
      <SampleDataBadge />

      {tab === 'routes' ? (
        <>
          <AppText color={colors.textMuted}>{t('resident.schedule.routesHint')}</AppText>
          {routeRows.map(({ route, number, truck, days, window, mine }) => (
            <Card
              key={route.id}
              // Each route has its own edge colour; the route number says which it is too.
              style={[
                styles.routeCard,
                { borderLeftColor: ROUTE_EDGES[(number - 1) % 4] },
                mine && styles.mine,
              ]}
            >
              <View style={styles.head}>
                <View style={styles.routeTag}>
                  <AppText variant="label" color={colors.textOnDark} style={styles.dayText}>
                    {t('resident.schedule.routeN', { n: number })}
                  </AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">
                    {route.barangayIds.map(nameOf).join(' → ')}
                  </AppText>
                  {mine ? (
                    <AppText variant="caption" color={colors.primary} style={styles.dayText}>
                      {t('resident.schedule.yourRoute')}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <AppText variant="label" color={colors.textMuted}>
                {days.length
                  ? t('resident.schedule.routeDays', {
                      days: days.map((d) => t(`weekday.${d}`)).join(' • '),
                    })
                  : t('resident.schedule.none')}
                {window ? ` · ${window}` : ''}
                {truck ? ` · ${truck.name}` : ''}
              </AppText>
              <Button
                variant="tonal"
                size="compact"
                icon="map-outline"
                label={t('resident.schedule.viewMap')}
                accessibilityHint={t('resident.schedule.routeN', { n: number })}
                onPress={() => router.push('/resident/map')}
              />
            </Card>
          ))}
        </>
      ) : picking ? (
        <>
          <AppText color={colors.textMuted}>{t('resident.schedule.otherBarangay')}</AppText>
          <BarangayPicker
            selectedId={barangayId}
            allowLocate={false}
            onSelect={(id) => {
              setViewing(id === savedBarangay ? null : id);
              setPicking(false);
            }}
          />
          <Button variant="ghost" label={t('common.cancel')} onPress={() => setPicking(false)} />
        </>
      ) : !ready ? (
        <SkeletonGroup>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </SkeletonGroup>
      ) : (
        <>
          {barangayId && next ? <NextCollectionCard next={next} now={now} /> : null}
          {props ? (
            <Card>
              <View style={styles.head}>
                <View style={styles.badge}>
                  <Icon name="calendar-month" size={24} color={colors.ink} />
                </View>
                <AppText variant="heading" color={colors.primary} style={styles.flex}>
                  {t('resident.schedule.for', { barangay: barangayLabel(props) })}
                </AppText>
              </View>
              {regularDays.length ? (
                <>
                  <AppText color={colors.textMuted}>
                    {t('resident.schedule.regularDays', {
                      days: regularDays.map((d) => t(`weekday.${d}`)).join(', '),
                    })}
                  </AppText>
                  {/* The same days as tags, as in the design; the sentence above is what is read out. */}
                  <View style={styles.days} aria-hidden>
                    {regularDays.map((d) => (
                      <View key={d} style={styles.day}>
                        <AppText variant="label" color={colors.primary} style={styles.dayText}>
                          {t(`weekday.${d}`)}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
              {upcoming.map((s) => {
                const from = parseDateKey(s.validFrom!);
                return (
                  <Notice
                    key={s.validFrom}
                    tone="warning"
                    icon="calendar-edit"
                    text={t('resident.schedule.changeFrom', {
                      day: formatDate(t, from),
                      days: s.days.map((d) => t(`weekday.${d}`)).join(', '),
                      window: `${formatClock(atManilaTime(from, s.start))} – ${formatClock(atManilaTime(from, s.windowEnd))}`,
                    })}
                  />
                );
              })}
            </Card>
          ) : null}

          <AppText variant="heading" accessibilityRole="header">
            {t('resident.schedule.nextTwoWeeks')}
          </AppText>

          {occurrences.length === 0 ? (
            <EmptyState icon="calendar-blank" title={t('resident.schedule.none')} />
          ) : (
            occurrences.map((o) => {
              const running = isRunning(o);
              const n = note(o);
              return (
                <Card key={`${o.routeId}-${o.day}`} style={!running && styles.offCard}>
                  <View style={styles.head}>
                    <View style={[styles.badge, !running && styles.badgeOff]}>
                      <Icon
                        name={running ? 'calendar-check' : 'calendar-remove'}
                        size={24}
                        color={running ? colors.ink : colors.grey}
                      />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="heading">{formatRelativeDay(t, o.start, now)}</AppText>
                      {running ? (
                        <AppText variant="bodyStrong" color={colors.primary}>
                          {formatWindow(o)}
                        </AppText>
                      ) : null}
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

          {viewing ? (
            <Button
              variant="secondary"
              icon="home-map-marker"
              label={t('resident.schedule.backToMine')}
              onPress={() => setViewing(null)}
            />
          ) : null}
          <Button
            variant="ghost"
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
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
  // The words drop under the round icon at 200% text.
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOff: { backgroundColor: colors.surface },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  day: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
  },
  dayText: { fontFamily: fonts.bold },
  offCard: { backgroundColor: colors.greySoft },
  mine: { borderColor: colors.primary, borderWidth: 2 },
  routeCard: { borderLeftWidth: 6 },
  routeTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
});
