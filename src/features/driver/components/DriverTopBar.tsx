import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useIsOnline } from '@/lib/network';
import type { Truck } from '@/services/types';
import type { ActiveShift } from '@/stores/driver';
import { useGps } from '@/stores/gps';
import { colors, radius, spacing, touch } from '@/theme/tokens';

import { formatShiftDuration } from '../format';
import { usePending } from '../sync';

interface DriverTopBarProps {
  truck: Truck | undefined;
  shift: ActiveShift;
  now: number;
  /** False when the phone GPS should be recording but is not. */
  gpsOk: boolean;
}

/**
 * Always-visible shift status: truck, time on shift, GPS and upload state. Each state has an
 * icon and words (never colour alone), and tapping opens the GPS/upload details.
 */
export function DriverTopBar({ truck, shift, now, gpsOk }: DriverTopBarProps) {
  const { t } = useTranslation();
  const online = useIsOnline();
  const pending = usePending();
  const fixes = useGps((s) => s.fixes.length);

  const gps: { icon: IconName; label: string; warn: boolean } = !gpsOk
    ? { icon: 'crosshairs-off', label: t('driver.shift.gpsOff'), warn: true }
    : {
        icon: 'crosshairs-gps',
        label: t(shift.gpsSource === 'demo' ? 'driver.shift.gpsDemo' : 'driver.shift.gpsPhone', {
          count: fixes,
        }),
        warn: false,
      };
  const upload: { icon: IconName; label: string; warn: boolean } = !online
    ? {
        icon: 'cloud-off-outline',
        label: pending.total
          ? `${t('driver.shift.offline')} · ${pending.total}`
          : t('driver.shift.offline'),
        warn: true,
      }
    : pending.total
      ? {
          icon: 'cloud-upload-outline',
          label: t('driver.shift.pending', { count: pending.total }),
          warn: false,
        }
      : { icon: 'cloud-check-outline', label: t('driver.shift.synced'), warn: false };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.bar}>
      {/* Light clock and icons over the navy bar. */}
      <StatusBar style="light" />
      <View style={styles.row}>
        <View style={styles.code}>
          <AppText variant="heading" color={colors.navy}>
            {truck?.code}
          </AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="heading" color={colors.textOnDark}>
            {truck?.name}
          </AppText>
          <AppText variant="label" color={colors.mint} accessibilityLiveRegion="none">
            {t('driver.shift.onShift', { duration: formatShiftDuration(now - shift.startedAt) })}
          </AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${gps.label}. ${upload.label}. ${t('driver.shift.gpsLog')}`}
        onPress={() => router.push('/driver/gps')}
        style={({ pressed }) => [styles.chips, pressed && { opacity: 0.8 }]}
      >
        {[gps, upload].map((c) => (
          <View key={c.icon} style={[styles.chip, c.warn && styles.chipWarn]}>
            <Icon name={c.icon} size={20} color={c.warn ? colors.navy : colors.textOnDark} />
            <AppText variant="label" color={c.warn ? colors.navy : colors.textOnDark}>
              {c.label}
            </AppText>
          </View>
        ))}
        <Icon name="chevron-right" size={22} color={colors.textOnDark} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.navyDark,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  code: {
    backgroundColor: colors.yellow,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    minWidth: 48,
    alignItems: 'center',
  },
  flex: { flex: 1 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.mint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipWarn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
});
