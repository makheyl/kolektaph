import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useNarrow } from '@/components/ui/narrow';
import { useIsOnline } from '@/lib/network';
import { useWebTitle } from '@/lib/webTitle';
import type { Truck } from '@/services/types';
import type { ActiveShift } from '@/stores/driver';
import { useGps } from '@/stores/gps';
import { colors, fonts, radius, spacing, touch } from '@/theme/tokens';

import { formatShiftDuration } from '../format';
import { usePending } from '../sync';

interface DriverBarProps {
  /** The truck's short code, in the circle ("T2"). */
  code: string | undefined;
  title: string;
  subtitle: string;
  /** An action at the right end (sign out). */
  right?: ReactNode;
  /** A second row under the name (the GPS and upload status during a shift). */
  children?: ReactNode;
  /** The browser tab's name on the web, when the title is a greeting and not the page's name. */
  webTitle?: string;
}

/**
 * The green bar at the top of the driver app: which truck this phone is, a line of status, and
 * room for one action. It colours the status bar area itself.
 */
export function DriverBar({ code, title, subtitle, right, children, webTitle }: DriverBarProps) {
  useWebTitle(webTitle ?? title);
  // On a very narrow screen there is no room for the words between the truck's code and the
  // action, so they get the line below.
  const narrow = useNarrow();
  const stacked = narrow && !!right;
  const words = (
    <View style={stacked ? undefined : styles.flex}>
      <AppText variant="heading" color={colors.textOnDark} accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="label" color={colors.mint}>
        {subtitle}
      </AppText>
    </View>
  );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.bar}>
      {/* Light clock and icons over the green bar. */}
      <StatusBar style="light" />
      <View style={[styles.row, stacked && styles.rowApart]}>
        <View style={styles.code} aria-hidden>
          <AppText variant="heading" color={colors.primary} style={styles.codeText}>
            {code}
          </AppText>
        </View>
        {stacked ? null : words}
        {right}
      </View>
      {stacked ? words : null}
      {children}
    </SafeAreaView>
  );
}

interface DriverTopBarProps {
  truck: Truck | undefined;
  shift: ActiveShift;
  now: number;
  /** False when the phone GPS should be recording but is not. */
  gpsOk: boolean;
}

/**
 * Always-visible shift status: truck, time on shift, GPS and upload state. Each state has an
 * icon and words (never colour alone), and tapping opens the GPS/upload details. The bar keeps
 * one height while the words change ("Naipadala lahat" to "3 hindi pa naipadala"), so the page
 * under it does not jump.
 */
/** What the phone is doing for the shift right now: its GPS and its uploads, each in words. */
export function useShiftStatus(shift: ActiveShift, gpsOk: boolean) {
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

  return { gps, upload };
}

export function DriverTopBar({ truck, shift, now, gpsOk }: DriverTopBarProps) {
  const { t } = useTranslation();
  const narrow = useNarrow();
  const { gps, upload } = useShiftStatus(shift, gpsOk);

  return (
    <DriverBar
      code={truck?.code}
      title={truck?.name ?? ''}
      subtitle={t('driver.shift.onShift', {
        duration: formatShiftDuration(now - shift.startedAt),
      })}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${gps.label}. ${upload.label}. ${t('driver.shift.gpsLog')}`}
        onPress={() => router.push('/driver/gps')}
        style={({ pressed }) => [styles.status, pressed && { opacity: 0.8 }]}
      >
        {/* Side by side: when the upload words are long they take a second line inside their
            chip. On a very narrow screen the chips go one under the other. */}
        <View style={[styles.chips, narrow && styles.chipsWrap]}>
          {[gps, upload].map((c, i) => (
            <View
              key={c.icon}
              style={[styles.chip, i > 0 && styles.chipShrinks, c.warn && styles.chipWarn]}
            >
              <Icon name={c.icon} size={20} color={c.warn ? colors.ink : colors.textOnDark} />
              <AppText
                variant="label"
                color={c.warn ? colors.ink : colors.textOnDark}
                style={styles.chipText}
              >
                {c.label}
              </AppText>
            </View>
          ))}
        </View>
        <Icon name="chevron-right" size={22} color={colors.textOnDark} />
      </Pressable>
    </DriverBar>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  rowApart: { justifyContent: 'space-between' },
  code: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: { fontFamily: fonts.extrabold },
  flex: { flex: 1, minWidth: 0 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch.min },
  chips: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chipsWrap: { flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.mint,
    paddingHorizontal: spacing.sm,
    // Two lines of words still fit the row's height.
    paddingVertical: 2,
    maxWidth: '100%',
  },
  chipShrinks: { flexShrink: 1 },
  chipText: { flexShrink: 1 },
  chipWarn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
});
