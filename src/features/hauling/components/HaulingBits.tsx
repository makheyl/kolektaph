import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { formatDate } from '@/features/resident/format';
import { formatClock } from '@/lib/time';
import type {
  HaulingQuote,
  HaulingRequest,
  HaulingSlot,
  HaulingVolume,
  PointsRules,
} from '@/services/types';
import { colors, fonts, radius, shadows, spacing, touch } from '@/theme/tokens';

import { amountDue, formatPesos, pointsDiscount } from '../pricing';
import { HAULING_STATUS_META, type HaulingView, haulingView } from '../status';

export const VOLUME_ICONS: Record<HaulingVolume, IconName> = {
  small: 'sack',
  medium: 'package-variant-closed',
  large: 'truck',
  unsure: 'dots-horizontal',
};

/** A step of a hauling request, with icon, colour and words (never colour alone). */
export function HaulingStatusPill({ view }: { view: HaulingView }) {
  const { t } = useTranslation();
  const meta = HAULING_STATUS_META[view];
  return (
    <View style={[styles.pill, { backgroundColor: meta.soft, borderColor: meta.color }]}>
      <Icon name={meta.icon} size={16} color={meta.color} />
      <AppText variant="label" color={meta.color} style={styles.pillLabel}>
        {t(`hauling.status.${view}`)}
      </AppText>
    </View>
  );
}

/** "Martes, Okt 14 · Umaga" */
export function useSlotText() {
  const { t } = useTranslation();
  return (day: number, slot: HaulingSlot) => `${formatDate(t, day)} · ${t(`hauling.slot.${slot}`)}`;
}

interface OptionTileProps {
  icon: IconName;
  title: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}

/** One choice of a small set, as a card (the volume, who is asking). Announced as a radio. */
export function OptionTile({ icon, title, hint, selected, onPress }: OptionTileProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.option,
        selected && styles.optionSelected,
        (pressed || hovered) && { backgroundColor: colors.mintSoft },
      ]}
    >
      <Icon name={icon} size={28} color={colors.primary} />
      <AppText variant="bodyStrong" style={styles.center}>
        {title}
      </AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.center}>
          {hint}
        </AppText>
      ) : null}
      {selected ? (
        <View style={styles.optionCheck}>
          <Icon name="check-circle" size={20} color={colors.primary} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** The booking in five lines, on mint: when, how much, what and where. */
export function BookingSummary({
  request,
  barangayName,
}: {
  request: HaulingRequest;
  barangayName: string;
}) {
  const { t } = useTranslation();
  const slotText = useSlotText();
  // Once the City has answered, its confirmed day and volume are the ones that count.
  const day = request.quote?.day ?? request.day;
  const slot = request.quote?.slot ?? request.slot;
  const volume = request.quote?.volume ?? request.volume;
  const rows: [string, string][] = [
    [t('hauling.summary.when'), slotText(day, slot)],
    [t('hauling.summary.volume'), t(`hauling.volume.${volume}`)],
    [
      t('hauling.summary.load'),
      request.loadTypes.map((l) => t(`hauling.load.${l}`)).join(', ') || '—',
    ],
    [t('hauling.summary.where'), [request.landmark, barangayName].filter(Boolean).join(', ')],
    ...(request.businessName
      ? ([[t('hauling.summary.business'), request.businessName]] as [string, string][])
      : []),
  ];
  return (
    <Card variant="mint">
      <View style={styles.head}>
        <Icon name="truck" size={22} color={colors.primary} />
        <AppText variant="bodyStrong" color={colors.primary} accessibilityRole="header">
          {t('hauling.summary.title')}
        </AppText>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.line}>
          <AppText variant="label" color={colors.textMuted} style={styles.lineLabel}>
            {label}
          </AppText>
          <AppText variant="label" style={styles.lineValue}>
            {value}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

/** The fee, line by line, with the points discount and the amount left to pay. */
export function QuoteBreakdown({
  quote,
  pointsUsed,
  rules,
}: {
  quote: HaulingQuote;
  pointsUsed: number;
  rules: Pick<PointsRules, 'pesosPer100'>;
}) {
  const { t } = useTranslation();
  const discount = pointsDiscount(pointsUsed, rules);
  const peso = (amount: number) => t('hauling.pesos', { amount: formatPesos(amount) });
  const rows: [string, string][] = [
    [
      t('hauling.fee.base', { volume: t(`hauling.volume.${quote.volume}`).toLowerCase() }),
      peso(quote.baseFee),
    ],
    [t('hauling.fee.distance'), peso(quote.distanceFee)],
    [t('hauling.fee.disposal'), peso(quote.disposalFee)],
    ...(discount > 0
      ? ([[t('hauling.fee.points', { points: pointsUsed }), `− ${peso(discount)}`]] as [
          string,
          string,
        ][])
      : []),
  ];
  return (
    <Card>
      <AppText variant="bodyStrong" color={colors.primary} accessibilityRole="header">
        {t('hauling.fee.title')}
      </AppText>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.line}>
          <AppText variant="label" color={colors.textMuted} style={styles.lineLabel}>
            {label}
          </AppText>
          <AppText variant="label" style={styles.amount}>
            {value}
          </AppText>
        </View>
      ))}
      <View style={[styles.line, styles.total]}>
        <AppText variant="bodyStrong" color={colors.primary} style={styles.lineLabel}>
          {t('hauling.fee.total')}
        </AppText>
        <AppText variant="heading" style={styles.amount}>
          {peso(amountDue(quote, pointsUsed, rules))}
        </AppText>
      </View>
    </Card>
  );
}

interface HaulingCardProps {
  request: HaulingRequest;
  barangayName: string;
  now: number;
  onPress: () => void;
}

/** A hauling request in "Aking mga report": what, number, place, date and step. */
export function HaulingCard({ request, barangayName, now, onPress }: HaulingCardProps) {
  const { t } = useTranslation();
  const view = haulingView(request, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('hauling.title')}, ${barangayName}. ${t(`hauling.status.${view}`)}. ${request.id}`}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.card,
        { opacity: pressed ? 0.85 : hovered ? 0.94 : 1 },
      ]}
    >
      <View style={styles.thumb} aria-hidden>
        <Icon name="truck" size={36} color={colors.primary} />
      </View>
      <View style={styles.cardText}>
        <View style={styles.cardHead}>
          <AppText variant="bodyStrong" style={styles.cardTitle}>
            {t('hauling.title')}
          </AppText>
          <HaulingStatusPill view={view} />
        </View>
        <AppText variant="label" color={colors.textMuted}>
          {request.id}
          {barangayName ? ` · ${barangayName}` : ''}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {formatDate(t, request.createdAt)} · {formatClock(request.createdAt)}
          {request.sample ? ` · ${t('hauling.sample')}` : ''}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  pillLabel: { flexShrink: 1 },
  option: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 130,
    minWidth: 0,
    minHeight: touch.driver,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  optionSelected: { borderWidth: 2.5, borderColor: colors.primary },
  optionCheck: { position: 'absolute', top: spacing.xs, right: spacing.xs },
  center: { textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // The label and its value share a line, and stack when either is long.
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: spacing.md,
  },
  lineLabel: { flexShrink: 1 },
  // Kept to the right edge even when a long label pushes the value to its own line.
  lineValue: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right', fontFamily: fonts.semibold },
  amount: { marginLeft: 'auto', fontFamily: fonts.bold },
  total: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  thumb: {
    width: 88,
    height: 66,
    borderRadius: radius.md,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0, gap: 2 },
  cardHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  cardTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 96, minWidth: 0 },
});
