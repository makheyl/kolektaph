import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { PhotoView } from '@/components/photos/PhotoView';
import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { useNarrow } from '@/components/ui/narrow';
import { formatDate } from '@/features/resident/format';
import { formatClock } from '@/lib/time';
import type { ReportCategory, Ticket, TicketStatus } from '@/services/types';
import { colors, radius, shadows, spacing, touch } from '@/theme/tokens';

import { CATEGORY_META } from '../categories';
import type { Priority } from '../priority';

export const TICKET_STATUS_META: Record<
  TicketStatus,
  { icon: IconName; color: string; soft: string }
> = {
  // Three colour groups, as in the design: being looked at, a pickup is set, done.
  submitted: { icon: 'inbox-arrow-down', color: colors.amber, soft: colors.amberSoft },
  verified: { icon: 'shield-check', color: colors.amber, soft: colors.amberSoft },
  scheduled: { icon: 'calendar-clock', color: colors.blue, soft: colors.blueSoft },
  in_progress: { icon: 'truck-fast', color: colors.blue, soft: colors.blueSoft },
  collected: { icon: 'check-circle', color: colors.primary, soft: colors.greenSoft },
  closed: { icon: 'lock-check', color: colors.grey, soft: colors.greySoft },
  merged: { icon: 'call-merge', color: colors.grey, soft: colors.greySoft },
  rejected: { icon: 'close-octagon', color: colors.red, soft: colors.redSoft },
};

const PRIORITY_COLORS = { high: colors.red, medium: colors.amber, low: colors.grey };
const PRIORITY_ICONS: Record<Priority['level'], IconName> = {
  high: 'chevron-triple-up',
  medium: 'chevron-double-up',
  low: 'chevron-up',
};

/** Status with icon, colour and words (never colour alone). */
export function TicketStatusPill({ status }: { status: TicketStatus }) {
  const { t } = useTranslation();
  const meta = TICKET_STATUS_META[status];
  return (
    <View style={[styles.pill, { backgroundColor: meta.soft, borderColor: meta.color }]}>
      <Icon name={meta.icon} size={16} color={meta.color} />
      <AppText variant="label" color={meta.color} style={styles.pillLabel}>
        {t(`reports.status.${status}`)}
      </AppText>
    </View>
  );
}

export function PriorityPill({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  const color = PRIORITY_COLORS[priority.level];
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Icon name={PRIORITY_ICONS[priority.level]} size={16} color={color} />
      <AppText variant="label" color={color}>
        {t('reports.priorityScore', {
          level: t(`reports.priority.${priority.level}`),
          score: priority.score,
        })}
      </AppText>
    </View>
  );
}

interface CategoryTileProps {
  category: ReportCategory;
  onPress: () => void;
  emergency?: boolean;
}

/** One big tile per problem type (icon + name + short hint). */
export function CategoryTile({ category, onPress, emergency }: CategoryTileProps) {
  const { t } = useTranslation();
  // On a very narrow screen the picture goes above the words, which then get the whole width.
  const narrow = useNarrow();
  const tone = emergency ? colors.red : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t(`reports.category.${category}`)}. ${t(`reports.categoryHint.${category}`)}`}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.tile,
        narrow && styles.tileStacked,
        (pressed || hovered) && { backgroundColor: pressed ? colors.mint : colors.mintSoft },
      ]}
    >
      <View
        style={[styles.tileIcon, { backgroundColor: emergency ? colors.redSoft : colors.mint }]}
      >
        <Icon name={CATEGORY_META[category].icon} size={30} color={tone} />
      </View>
      <View style={narrow ? styles.tileWords : styles.flex}>
        <AppText variant="bodyStrong">{t(`reports.category.${category}`)}</AppText>
        <AppText variant="label" color={colors.textMuted}>
          {t(`reports.categoryHint.${category}`)}
        </AppText>
      </View>
      {narrow ? null : <Icon name="chevron-right" size={24} color={colors.textMuted} />}
    </Pressable>
  );
}

const STEPS: TicketStatus[] = [
  'submitted',
  'verified',
  'scheduled',
  'in_progress',
  'collected',
  'closed',
];

/**
 * How far along a report is, at a glance: one segment per step, filled up to the current one.
 * The timeline under it says the same in words, with times.
 */
export function TicketProgress({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation();
  const index = STEPS.indexOf(ticket.status);
  // Merged and rejected reports stop where they were: no bar, the timeline explains.
  if (index < 0) return null;
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${t('reports.detail.timeline')}: ${t(`reports.status.${ticket.status}`)}`}
      accessibilityValue={{ min: 1, max: STEPS.length, now: index + 1 }}
    >
      {STEPS.map((s, i) => (
        <View key={s} style={[styles.segment, i <= index && styles.segmentDone]} />
      ))}
    </View>
  );
}

/**
 * Natanggap → Na-verify → Naka-iskedyul → Papunta na → Nakolekta → Sarado, with the time of
 * each step. Merged and rejected tickets end with their own line.
 */
export function TicketTimeline({ ticket }: { ticket: Ticket }) {
  const { t } = useTranslation();
  const reachedAt = (s: TicketStatus) => ticket.history.findLast((h) => h.status === s)?.at ?? null;
  const currentIndex = STEPS.indexOf(ticket.status);
  const terminal = ticket.status === 'merged' || ticket.status === 'rejected';
  const steps = terminal ? STEPS.filter((s) => reachedAt(s) != null) : STEPS;

  return (
    <View style={styles.timeline}>
      {steps.map((s, i) => {
        const at = reachedAt(s);
        const done = !terminal && i <= currentIndex ? at != null || i < currentIndex : at != null;
        const current = !terminal && s === ticket.status;
        return (
          <View
            key={s}
            style={styles.step}
            accessible
            accessibilityLabel={`${t(`reports.status.${s}`)}${at ? `, ${formatClock(at)}` : ''}`}
          >
            <View style={[styles.dot, done ? styles.dotDone : null, current && styles.dotCurrent]}>
              {done ? <Icon name="check" size={14} color={colors.textOnDark} /> : null}
            </View>
            <View style={styles.flex}>
              <AppText
                variant={current ? 'bodyStrong' : 'body'}
                color={done ? colors.text : colors.textMuted}
              >
                {t(`reports.status.${s}`)}
              </AppText>
              {at && done ? (
                <AppText variant="caption" color={colors.textMuted}>
                  {formatClock(at)}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
      {terminal ? (
        <View style={styles.step}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: TICKET_STATUS_META[ticket.status].color,
                borderColor: TICKET_STATUS_META[ticket.status].color,
              },
            ]}
          >
            <Icon
              name={TICKET_STATUS_META[ticket.status].icon}
              size={14}
              color={colors.textOnDark}
            />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t(`reports.status.${ticket.status}`)}</AppText>
            {ticket.rejectReason ? <AppText>{ticket.rejectReason}</AppText> : null}
            {ticket.mergedInto ? (
              <AppText>{t('reports.detail.mergedInto', { ticket: ticket.mergedInto })}</AppText>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

interface TicketCardProps {
  ticket: Ticket;
  barangayName: string;
  onPress: () => void;
  selected?: boolean;
  /** "May bago" for the resident, priority for staff. */
  badge?: string | null;
  right?: React.ReactNode;
}

/** A ticket in a list: photo, what, where, when and status. */
export function TicketCard({
  ticket,
  barangayName,
  onPress,
  selected,
  badge,
  right,
}: TicketCardProps) {
  const { t } = useTranslation();
  const photo = ticket.photos[0] ?? {
    kind: 'sample' as const,
    id: CATEGORY_META[ticket.category].sample,
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${t(`reports.category.${ticket.category}`)}, ${barangayName}. ${t(`reports.status.${ticket.status}`)}. ${ticket.id}`}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.card,
        selected && styles.cardSelected,
        { opacity: pressed ? 0.85 : hovered ? 0.94 : 1 },
      ]}
    >
      <View style={styles.thumb}>
        <PhotoView photo={photo} accessibilityLabel="" />
      </View>
      <View style={styles.cardText}>
        <View style={styles.cardHead}>
          <AppText variant="bodyStrong" style={styles.cardTitle}>
            {t(`reports.category.${ticket.category}`)}
          </AppText>
          <TicketStatusPill status={ticket.status} />
        </View>
        <AppText variant="label" color={colors.textMuted}>
          {ticket.id}
          {barangayName ? ` · ${barangayName}` : ''}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {formatDate(t, ticket.createdAt)} · {formatClock(ticket.createdAt)}
        </AppText>
        {right || badge ? (
          <View style={styles.row}>
            {right}
            {badge ? (
              <View style={styles.badge}>
                <AppText variant="caption" color={colors.ink}>
                  {badge}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignItems: 'center',
    marginTop: 2,
  },
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
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.driver,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tileStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.sm },
  tileWords: { alignSelf: 'stretch' },
  tileIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { flexDirection: 'row', gap: spacing.xs },
  segment: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.border },
  segmentDone: { backgroundColor: colors.primary },
  timeline: { gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotCurrent: { borderColor: colors.yellow, borderWidth: 3 },
  // The words drop under the photo at 200% text instead of being squeezed beside it.
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
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.mintSoft },
  cardText: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0, gap: 2 },
  // The status sits beside the title, and drops under it when there is no room.
  cardHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  cardTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 96, minWidth: 0 },
  thumb: { width: 88 },
  badge: {
    backgroundColor: colors.yellow,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
});
