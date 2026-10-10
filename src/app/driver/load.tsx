import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { LOAD_STEPS } from '@/features/driver/format';
import { reportedLoad } from '@/features/driver/load';
import { percent } from '@/features/enro/format';
import { goBack } from '@/lib/navigation';
import { useDriver, useDriverLive } from '@/stores/driver';
import { colors, radius, spacing } from '@/theme/tokens';

const RING = 200;
const STROKE = 18;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** From this load the dispatcher is alerted to plan a trip to the tapunan. */
const ALERT_AT = 0.85;
/** SAMPLE: the truck's capacity. The City has not given the real figure yet. */
const SAMPLE_CAPACITY_M3 = 15;

/**
 * Truck load, as in the design: the load now as a ring with its volume, the four choices, a bar
 * from empty to full, a warning from 85%, and one button that sends the chosen load. Nothing is
 * sent until the crew presses Update.
 */
export default function DriverLoad() {
  const { t } = useTranslation();
  const shift = useDriver((s) => s.shift);
  const outbox = useDriver((s) => s.outbox);
  const report = useDriver((s) => s.report);
  const truck = useDriverLive((s) => s.truck);
  const [choice, setChoice] = useState<number | null>(null);

  if (!shift || shift.endedAt != null) return <Redirect href="/driver" />;

  const reported = reportedLoad(outbox.map((o) => o.event));
  // Until the crew reports a load, the ring shows the estimate from the route.
  const current = Math.min(1, Math.max(0, reported ?? truck?.load ?? 0));
  const estimated = reported == null;

  const send = () => {
    if (choice == null) return;
    if (choice === 1) report({ kind: 'status', status: 'full' });
    else report({ kind: 'load', load: choice });
    setChoice(null);
  };

  return (
    <Screen
      header={
        <AppHeader
          title={t('driver.load.title')}
          leading={
            <IconButton
              icon="arrow-left"
              label={t('common.back')}
              onPress={() => goBack('/driver/shift')}
            />
          }
        />
      }
      footer={
        <Button
          size="driver"
          variant="primary"
          icon="check"
          label={t('driver.load.update')}
          disabled={choice == null}
          onPress={send}
        />
      }
    >
      <View
        style={styles.ring}
        accessibilityRole="progressbar"
        accessibilityValue={{ now: Math.round(current * 100), min: 0, max: 100 }}
      >
        <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={colors.mintSoft}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={colors.primary}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE * current} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            fill="none"
          />
        </Svg>
        <View style={styles.centre} aria-hidden>
          <AppText variant="display" color={colors.ink}>
            {percent(current)}
          </AppText>
          <AppText variant="bodyStrong" color={colors.textMuted}>
            {`${(current * SAMPLE_CAPACITY_M3).toFixed(1)} / ${SAMPLE_CAPACITY_M3} m³`}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {estimated ? t('driver.load.estimate') : t('driver.load.reported')}
          </AppText>
        </View>
      </View>
      <SampleDataBadge centered />

      <View style={styles.block}>
        <AppText variant="heading" accessibilityRole="header">
          {t('driver.load.pick')}
        </AppText>
        <View style={styles.chips}>
          {LOAD_STEPS.map((v) => (
            <View key={v} style={styles.chipWrap}>
              <Chip
                label={`${Math.round(v * 100)}%`}
                selected={choice === v}
                onPress={() => setChoice(v)}
                accessibilityLabel={t('driver.shift.loadA11y', {
                  value: `${Math.round(v * 100)}%`,
                })}
              />
            </View>
          ))}
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(current * 100)}%` }]} />
        </View>
        <View style={styles.scale}>
          <AppText variant="caption" color={colors.textMuted}>
            {t('driver.load.empty')}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t('driver.load.full')}
          </AppText>
        </View>
      </View>

      {(choice ?? current) >= ALERT_AT ? (
        <Notice tone="warning" icon="alert" text={t('driver.load.warn')} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignSelf: 'center',
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chipWrap: { flex: 1, minWidth: 0 },
  track: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
});
