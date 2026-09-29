import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import {
  type DriverStreet,
  driverStreets,
  type StreetProgress,
  streetMarks,
  streetProgress,
} from '@/features/driver/streets';
import { formatDistance } from '@/features/enro/format';
import { useBarangays, useRoutes } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import type { SkipReason } from '@/services/types';
import { useDriver, useDriverLive } from '@/stores/driver';
import { colors, radius, spacing } from '@/theme/tokens';

const REASONS: SkipReason[] = [
  'no_garbage',
  'not_segregated',
  'road_blocked',
  'truck_full',
  'other',
];

const PROGRESS: Record<StreetProgress, { icon: IconName; color: string }> = {
  passed: { icon: 'check-circle', color: colors.green },
  current: { icon: 'map-marker', color: colors.navy },
  upcoming: { icon: 'clock-outline', color: colors.grey },
};

/**
 * The route's streets in driving order. GPS already knows which were passed; the crew adds
 * "nakolekta" or "nilaktawan" with a reason (used by City ENRO and the "Hindi nadaanan" check).
 */
export default function DriverStreets() {
  const { t } = useTranslation();
  const shift = useDriver((s) => s.shift);
  const outbox = useDriver((s) => s.outbox);
  const report = useDriver((s) => s.report);
  const truck = useDriverLive((s) => s.truck);
  const { data: routes = [] } = useRoutes();
  const { data: barangays } = useBarangays();
  const [skipping, setSkipping] = useState<string | null>(null);

  const route = routes.find((r) => r.id === shift?.routeId);
  const streets = useMemo(() => (route ? driverStreets(route) : []), [route]);

  if (!shift || shift.endedAt != null) return <Redirect href="/driver" />;

  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const marks = route
    ? streetMarks(
        outbox.map((o) => o.event),
        route.id,
      )
    : new Map();
  const progressM = truck?.progressM ?? 0;
  const counts = { passed: 0, skipped: 0, left: 0 };
  for (const s of streets) {
    if (marks.get(s.key)?.outcome === 'skipped') counts.skipped += 1;
    else if (streetProgress(s, progressM) === 'passed') counts.passed += 1;
    else counts.left += 1;
  }

  const mark = (s: DriverStreet, outcome: 'collected' | 'skipped', reason: SkipReason | null) => {
    if (!route) return;
    report({
      kind: 'street',
      routeId: route.id,
      streetKey: s.key,
      segmentIds: s.segmentIds,
      outcome,
      reason,
    });
    setSkipping(null);
  };

  const streetName = (s: DriverStreet) => s.name ?? t('truck.unnamedRoad');

  return (
    <Screen>
      <AppHeader
        title={t('driver.streets.title')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/driver/shift')}
          />
        }
      />
      {!route ? (
        <AppText>{t('driver.streets.noRoute')}</AppText>
      ) : (
        <>
          <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
            {t('driver.streets.summary', counts)}
          </AppText>
          {streets.map((s) => {
            const progress = streetProgress(s, progressM);
            const m = marks.get(s.key);
            const look = PROGRESS[progress];
            const state = m
              ? m.outcome === 'collected'
                ? t('driver.streets.markedCollected', { time: formatClock(m.at) })
                : t('driver.streets.markedSkipped', {
                    reason: t(`skipReason.${m.reason}`),
                  })
              : t(`driver.streets.${progress}`);
            return (
              <View key={s.key} style={[styles.row, progress === 'current' && styles.current]}>
                <View
                  style={styles.head}
                  accessible
                  accessibilityLabel={t('driver.streets.a11yRow', {
                    street: streetName(s),
                    barangay: nameOf(s.barangayId),
                    state,
                  })}
                >
                  <Icon name={look.icon} size={24} color={look.color} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong">{streetName(s)}</AppText>
                    <AppText variant="label" color={colors.textMuted}>
                      {nameOf(s.barangayId)} · {formatDistance(t, s.lengthM)} ·{' '}
                      {t(`driver.streets.${progress}`)}
                    </AppText>
                    {m ? (
                      <AppText
                        variant="label"
                        color={m.outcome === 'collected' ? colors.green : colors.red}
                      >
                        {m.outcome === 'collected' ? '✓ ' : '✗ '}
                        {state}
                      </AppText>
                    ) : null}
                  </View>
                </View>
                {skipping === s.key ? (
                  <View style={styles.reasons}>
                    <AppText variant="bodyStrong">
                      {t('driver.streets.whySkip', { street: streetName(s) })}
                    </AppText>
                    {REASONS.map((r) => (
                      <Button
                        key={r}
                        size="driver"
                        variant="secondary"
                        label={t(`skipReason.${r}`)}
                        onPress={() => mark(s, 'skipped', r)}
                      />
                    ))}
                    <Button
                      variant="secondary"
                      label={t('common.cancel')}
                      onPress={() => setSkipping(null)}
                    />
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <View style={styles.flex}>
                      <Button
                        size="driver"
                        variant={m?.outcome === 'collected' ? 'success' : 'secondary'}
                        icon="check"
                        label={t('driver.streets.collected')}
                        onPress={() => mark(s, 'collected', null)}
                      />
                    </View>
                    <View style={styles.flex}>
                      <Button
                        size="driver"
                        variant={m?.outcome === 'skipped' ? 'danger' : 'secondary'}
                        icon="debug-step-over"
                        label={
                          m?.outcome === 'skipped'
                            ? t('driver.streets.change')
                            : t('driver.streets.skip')
                        }
                        onPress={() => setSkipping(s.key)}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  current: { borderWidth: 3, borderColor: colors.navy },
  head: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  reasons: { gap: spacing.sm },
});
