import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { useNarrow } from '@/components/ui/narrow';
import { HAULING_STATUS_META } from '@/features/hauling/status';
import { TICKET_STATUS_META } from '@/features/reports/components/TicketBits';
import { ENTRY_ICONS, formatPoints } from '@/features/rewards/format';
import { formatRelativeDay } from '@/features/resident/format';
import { formatClock } from '@/lib/time';
import { colors, radius, spacing } from '@/theme/tokens';

import { ALERT_META } from '../alertMeta';
import type { FeedItem } from '../feed';

interface FeedCardProps {
  item: FeedItem;
  /** Arrived after the resident last looked: mint, with a dot, and "Bago" for screen readers. */
  unread: boolean;
  now: number;
  /** Opens what the line is about (the report). Lines without one are not buttons. */
  onPress?: () => void;
}

/** One line of "Mga abiso": what happened, in a sentence or two, and when. */
export function FeedCard({ item, unread, now, onPress }: FeedCardProps) {
  const { t } = useTranslation();
  // On a very narrow screen the sentence takes the room of the icon and the arrow.
  const narrow = useNarrow();
  const meta =
    item.source === 'alert'
      ? ALERT_META[item.alert.kind]
      : item.source === 'ticket'
        ? TICKET_STATUS_META[item.event.status]
        : item.source === 'hauling'
          ? HAULING_STATUS_META[item.event.status]
          : { icon: ENTRY_ICONS[item.entry.kind], color: colors.primary };
  const title =
    item.source === 'alert'
      ? t(`alert.kind.${item.alert.kind}`)
      : item.source === 'ticket'
        ? t(`reports.event.${item.event.kind}`, {
            ticket: item.ticket.mergedInto ?? '',
            reason: item.ticket.rejectReason ?? '',
          })
        : item.source === 'hauling'
          ? t(`hauling.feed.${item.event.status}`)
          : t('rewards.feed.earned', { points: formatPoints(item.entry.points) });
  const body =
    item.source === 'alert'
      ? item.alert.text
      : item.source === 'ticket'
        ? [
            `${t(`reports.category.${item.ticket.category}`)} · ${item.ticket.id}`,
            item.event.kind === 'education' ? item.event.note : null,
          ]
            .filter(Boolean)
            .join('\n')
        : item.source === 'hauling'
          ? `${t('hauling.title')} · ${item.requestId}`
          : t(`rewards.entry.${item.entry.kind}`);
  const when = `${formatRelativeDay(t, item.at, now)} · ${formatClock(item.at)}`;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[unread ? t('resident.alerts.new') : null, title, body, when]
        .filter(Boolean)
        .join('. ')}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.card,
        unread && styles.unread,
        onPress && (pressed || hovered) && { opacity: pressed ? 0.8 : 0.92 },
      ]}
    >
      {narrow ? null : (
        <View style={[styles.icon, { backgroundColor: meta.color }]}>
          <Icon name={meta.icon} size={22} color={colors.textOnDark} />
        </View>
      )}
      <View style={styles.text}>
        <AppText variant="bodyStrong" color={colors.ink}>
          {title}
        </AppText>
        <AppText>{body}</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {when}
        </AppText>
      </View>
      {unread ? <View style={styles.dot} /> : null}
      {onPress && !narrow ? <Icon name="chevron-right" size={22} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unread: { backgroundColor: colors.mint, borderColor: colors.primary },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
});
