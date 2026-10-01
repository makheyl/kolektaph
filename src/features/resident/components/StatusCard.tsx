import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { type RenderContext, renderLine } from '@/features/kolek/render';
import { colors, radius, spacing } from '@/theme/tokens';

import type { HomeStatus } from '../homeStatus';
import { statusText } from '../statusText';

interface Look {
  icon: IconName;
  bg: string;
  border: string;
  fg: string;
}

const LOOKS: Record<Exclude<HomeStatus['kind'], 'no_barangay'>, Look> = {
  no_collection_today: {
    icon: 'calendar-blank',
    bg: colors.surface,
    border: colors.border,
    fg: colors.navy,
  },
  before_start: { icon: 'clock-outline', bg: colors.surface, border: colors.navy, fg: colors.navy },
  approaching: { icon: 'truck-fast', bg: colors.surface, border: colors.green, fg: colors.green },
  bring_out: { icon: 'bell-ring', bg: colors.yellow, border: colors.yellow, fg: colors.navy },
  in_barangay: {
    icon: 'truck-check',
    bg: colors.greenSoft,
    border: colors.green,
    fg: colors.green,
  },
  passed: { icon: 'check-circle', bg: colors.greenSoft, border: colors.green, fg: colors.green },
  full: { icon: 'truck-alert', bg: colors.redSoft, border: colors.red, fg: colors.red },
  breakdown: { icon: 'car-wrench', bg: colors.redSoft, border: colors.red, fg: colors.red },
  paused: { icon: 'pause-circle', bg: colors.amberSoft, border: colors.amber, fg: colors.amber },
  unfinished: { icon: 'map-marker-remove', bg: colors.redSoft, border: colors.red, fg: colors.red },
  no_signal: { icon: 'signal-off', bg: colors.greySoft, border: colors.grey, fg: colors.grey },
};

interface StatusCardProps {
  status: HomeStatus;
  now: number;
  barangayId: string;
  barangayName: string;
  /** Resolves a barangay id to its display name (for "Nasa Maduya ang truck"). */
  nameOf: (barangayId: string | null) => string;
}

/**
 * The answer to "Kailan darating ang truck?". Sits at the top of Home, readable without
 * scrolling, and announced to screen readers when it changes.
 */
export function StatusCard({ status, now, barangayId, barangayName, nameOf }: StatusCardProps) {
  const { t, i18n } = useTranslation();

  if (status.kind === 'no_barangay') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="heading">{t('resident.home.pickTitle')}</AppText>
        <AppText color={colors.textMuted}>{t('resident.home.pickBody')}</AppText>
        <Button
          icon="map-marker-outline"
          label={t('resident.home.pick')}
          onPress={() => router.push('/resident/barangay')}
        />
      </View>
    );
  }

  const look = LOOKS[status.kind];
  const ctx: RenderContext = {
    t,
    now,
    language: i18n.language === 'en' ? 'en' : 'fil',
    nameOf: (id) => nameOf(id) || (id === barangayId ? barangayName : ''),
  };
  const text = statusText(status, barangayId);
  const title = renderLine(text.title, ctx);
  const lines = text.lines.map((l) => renderLine(l, ctx));
  const chip = text.chip ? renderLine(text.chip, ctx) : null;
  const showMap = text.showMap;

  const textColor = status.kind === 'bring_out' ? colors.navy : colors.text;

  return (
    <View
      style={[styles.card, { backgroundColor: look.bg, borderColor: look.border }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={[title, ...lines, chip].filter(Boolean).join('. ')}
    >
      <View style={styles.titleRow}>
        <View style={[styles.iconWrap, { backgroundColor: look.fg }]}>
          <Icon
            name={look.icon}
            size={30}
            color={status.kind === 'bring_out' ? colors.yellow : colors.textOnDark}
          />
        </View>
        <AppText variant="title" color={textColor} style={styles.title}>
          {title}
        </AppText>
      </View>
      {lines.map((line) => (
        <AppText key={line} color={textColor}>
          {line}
        </AppText>
      ))}
      {chip ? (
        <View style={[styles.chip, { borderColor: textColor }]}>
          <Icon name="timer-outline" size={20} color={textColor} />
          <AppText variant="bodyStrong" color={textColor}>
            {chip}
          </AppText>
        </View>
      ) : null}
      {showMap ? (
        <Button
          variant={status.kind === 'bring_out' ? 'primary' : 'secondary'}
          icon="map-marker-radius"
          label={t('resident.home.seeOnMap')}
          onPress={() => router.push('/resident/map')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  // Wraps at 200% text size: the title then goes under the icon instead of running off-screen.
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 180 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
