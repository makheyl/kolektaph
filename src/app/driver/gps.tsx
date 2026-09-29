import { Redirect } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { formatAgo, formatShiftDuration } from '@/features/driver/format';
import { traceStats } from '@/features/driver/gpsLog';
import { useDeviceNow } from '@/features/driver/hooks';
import { syncNow, usePending } from '@/features/driver/sync';
import { formatDistance } from '@/features/enro/format';
import { useBarangays, useCityMeta } from '@/features/tracking/hooks';
import { pointsBounds } from '@/lib/geo';
import { goBack } from '@/lib/navigation';
import { useIsOnline, useNetwork } from '@/lib/network';
import { formatClock } from '@/lib/time';
import type { LngLat } from '@/services/types';
import { useDemo } from '@/stores/demo';
import { useDriver, useDriverLive } from '@/stores/driver';
import { useGps } from '@/stores/gps';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * GPS and upload details: what a field test checks (points, gaps, accuracy) and what the
 * offline queue holds. Device times, since GPS fixes carry the phone's own clock.
 */
export default function DriverGps() {
  const { t } = useTranslation();
  const shift = useDriver((s) => s.shift);
  const sync = useDriver((s) => s.sync);
  const fixes = useGps((s) => s.fixes);
  const sentCount = useGps((s) => s.sentCount);
  const rejected = useGps((s) => s.rejected);
  const pending = usePending();
  const online = useIsOnline();
  const simulateOffline = useNetwork((s) => s.simulateOffline);
  const setSimulateOffline = useNetwork((s) => s.setSimulateOffline);
  const demoMode = useDemo((s) => s.demoMode);
  const now = useDeviceNow();
  const gpsOk = useDriverLive((s) => s.gpsOk);
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();

  const phone = shift?.gpsSource === 'phone';
  const active = shift != null && shift.endedAt == null;
  const stats = useMemo(() => traceStats(fixes), [fixes]);
  const trace = useMemo(() => fixes.map((f): LngLat => [f.lng, f.lat]), [fixes]);
  const bounds = useMemo(() => pointsBounds(trace), [trace]);

  if (!shift) return <Redirect href="/driver" />;
  const isRecording = active && (phone ? gpsOk : true);
  const last = fixes[fixes.length - 1];

  const rows: [string, string][] = [
    [t('driver.gps.points'), String(fixes.length)],
    [t('driver.gps.sent'), String(sentCount)],
    [t('driver.gps.pending'), String(pending.fixes)],
    [t('driver.gps.events'), String(pending.events)],
    [
      t('driver.gps.lastFix'),
      last ? `${formatClock(last.t)} · ${formatAgo(t, now - last.t)}` : '—',
    ],
    [
      t('driver.gps.accuracy'),
      stats.medianAccuracyM != null ? `${Math.round(stats.medianAccuracyM)} m` : '—',
    ],
    [t('driver.gps.distance'), formatDistance(t, stats.distanceM)],
    [t('driver.gps.duration'), formatShiftDuration(stats.durationMs)],
    [t('driver.gps.rejected'), String(rejected)],
  ];

  return (
    <Screen>
      <AppHeader
        title={t('driver.gps.title')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/driver')}
          />
        }
      />

      <Card style={isRecording ? styles.ok : styles.off}>
        <View style={styles.inline}>
          <Icon
            name={isRecording ? 'crosshairs-gps' : 'crosshairs-off'}
            size={28}
            color={isRecording ? colors.green : colors.navy}
          />
          <View style={styles.flex}>
            <AppText variant="heading">
              {isRecording ? t('driver.gps.recording') : t('driver.gps.notRecording')}
            </AppText>
            <AppText variant="label" color={colors.textMuted}>
              {phone ? t('driver.gps.sourcePhone') : t('driver.gps.sourceDemo')}
            </AppText>
          </View>
        </View>
      </Card>

      <Card>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <AppText style={styles.flex}>{label}</AppText>
            <AppText variant="bodyStrong">{value}</AppText>
          </View>
        ))}
        <AppText variant="label" color={colors.textMuted}>
          {t('driver.gps.gaps')}
        </AppText>
        {stats.gaps.length ? (
          stats.gaps.map(([from, to]) => (
            <AppText key={from} color={colors.red}>
              {t('driver.gps.gapRow', {
                from: formatClock(from),
                to: formatClock(to),
                minutes: t('common.minutes', { count: Math.round((to - from) / 60_000) }),
              })}
            </AppText>
          ))
        ) : (
          <AppText color={colors.green}>✓ {t('driver.gps.noGaps')}</AppText>
        )}
      </Card>

      <Card>
        <View style={styles.inline}>
          <Icon
            name={online ? 'cloud-check-outline' : 'cloud-off-outline'}
            size={24}
            color={online ? colors.green : colors.red}
          />
          <AppText variant="bodyStrong" style={styles.flex}>
            {t('driver.gps.network')}: {online ? t('driver.gps.online') : t('driver.gps.offline')}
          </AppText>
        </View>
        <AppText>
          {t('driver.gps.lastSync')}:{' '}
          {sync.lastOkAt ? formatAgo(t, now - sync.lastOkAt) : t('driver.gps.never')}
        </AppText>
        {pending.total && sync.nextTryAt > now ? (
          <AppText color={colors.textMuted}>
            {t('driver.gps.retryIn', { seconds: Math.ceil((sync.nextTryAt - now) / 1000) })}
          </AppText>
        ) : null}
        <Button
          variant="secondary"
          icon="send"
          label={t('driver.gps.sendNow')}
          disabled={!pending.total}
          onPress={() => void syncNow(true)}
        />
        {demoMode ? (
          <>
            <Checkbox
              checked={simulateOffline}
              onChange={setSimulateOffline}
              label={t('driver.gps.simulateOffline')}
            />
            <AppText variant="label" color={colors.textMuted}>
              {t('driver.gps.simulateOfflineHint')}
            </AppText>
          </>
        ) : null}
      </Card>

      <View style={styles.block}>
        <AppText variant="heading">{t('driver.gps.mapTitle')}</AppText>
        {trace.length && barangays && meta ? (
          <KMap
            barangays={barangays}
            meta={meta}
            trucks={[]}
            trace={trace}
            fitBounds={bounds ? { bounds, key: `${fixes.length > 0}` } : null}
            style={styles.map}
            accessibilityLabel={t('driver.gps.mapTitle')}
          />
        ) : (
          <AppText color={colors.textMuted}>{t('driver.gps.noFixes')}</AppText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 },
  flex: { flex: 1 },
  ok: { backgroundColor: colors.greenSoft, borderColor: colors.green },
  off: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
  block: { gap: spacing.sm },
  map: {
    height: 280,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
