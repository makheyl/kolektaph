import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import { PhotoView } from '@/components/photos/PhotoView';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { TextField } from '@/components/ui/TextField';
import { CATEGORY_META } from '@/features/reports/categories';
import { TicketStatusPill, TicketTimeline } from '@/features/reports/components/TicketBits';
import { useTickets } from '@/features/reports/hooks';
import { canApply, collectedAt, REOPEN_WINDOW_MS } from '@/features/reports/lifecycle';
import { formatRelativeDay } from '@/features/resident/format';
import { useBarangays, useCityMeta, useSimNow } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import { services } from '@/services';
import { useMyReports } from '@/stores/myReports';
import { colors, radius, spacing, touch } from '@/theme/tokens';

/** A resident's ticket: timeline, photos, the crew's proof, reopen within 48 h, and a rating. */
export default function TicketDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tickets = useTickets();
  const now = useSimNow(10_000);
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const markSeen = useMyReports((s) => s.markSeen);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ticket = tickets.find((x) => x.id === id);

  const historyLength = ticket?.history.length ?? 0;
  useEffect(() => {
    if (id && historyLength) markSeen(id, historyLength);
  }, [id, historyLength, markSeen]);

  const back = (
    <IconButton
      icon="arrow-left"
      label={t('common.back')}
      onPress={() => goBack('/resident/reports')}
    />
  );
  if (!ticket || !barangays || !meta) {
    return (
      <Screen>
        <AppHeader title={t('reports.mine.title')} leading={back} />
        {tickets.length ? <AppText>{t('reports.detail.notFound')}</AppText> : null}
      </Screen>
    );
  }

  const barangay =
    barangays.features.find((f) => f.properties.id === ticket.barangayId)?.properties.name ?? '';
  const collected = collectedAt(ticket);
  const canReopen = canApply(ticket, { type: 'reopen', note: '' }, 'resident', now);
  const canRate = canApply(ticket, { type: 'rate', stars: 5 }, 'resident', now);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        eyebrow={ticket.id}
        title={t(`reports.category.${ticket.category}`)}
        leading={back}
      />
      <View style={styles.row}>
        <TicketStatusPill status={ticket.status} />
        {ticket.sample ? (
          <AppText variant="caption" color={colors.textMuted}>
            {t('reports.detail.sample')}
          </AppText>
        ) : null}
      </View>

      <Section title={t('reports.detail.timeline')}>
        <Card>
          <TicketTimeline ticket={ticket} />
          {ticket.dispatch?.due &&
          ['verified', 'scheduled', 'in_progress'].includes(ticket.status) ? (
            <AppText variant="label" color={colors.textMuted}>
              {t('reports.detail.due', {
                time: `${formatRelativeDay(t, ticket.dispatch.due, now)}, ${formatClock(ticket.dispatch.due)}`,
              })}
            </AppText>
          ) : null}
        </Card>
      </Section>

      {ticket.proof ? (
        <Section title={t('reports.detail.proof')}>
          <View style={styles.pair}>
            {ticket.proof.before ? (
              <View style={styles.flex}>
                <PhotoView
                  photo={ticket.proof.before}
                  accessibilityLabel={t('reports.detail.before')}
                />
                <AppText variant="caption">{t('reports.detail.before')}</AppText>
              </View>
            ) : null}
            <View style={styles.flex}>
              <PhotoView
                photo={ticket.proof.after}
                accessibilityLabel={t('reports.detail.after')}
              />
              <AppText variant="caption">{t('reports.detail.after')}</AppText>
            </View>
          </View>
        </Section>
      ) : null}

      {canReopen && collected ? (
        <Card style={styles.reopen}>
          <AppText>
            {t('reports.detail.reopenUntil', {
              time: `${formatRelativeDay(t, collected + REOPEN_WINDOW_MS, now)}, ${formatClock(collected + REOPEN_WINDOW_MS)}`,
            })}
          </AppText>
          <TextField
            label={t('reports.detail.reopenNote')}
            value={note}
            onChangeText={setNote}
            maxLength={200}
          />
          <Button
            variant="warning"
            icon="restore"
            label={t('reports.detail.reopen')}
            disabled={busy}
            onPress={() =>
              void run(() =>
                services.reports.act(ticket.id, { type: 'reopen', note: note.trim() }, 'resident'),
              )
            }
          />
        </Card>
      ) : null}

      {canRate ? (
        <Section title={t('reports.detail.rate')}>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((stars) => (
              <Pressable
                key={stars}
                accessibilityRole="button"
                accessibilityLabel={t('reports.detail.rateStars', { stars })}
                disabled={busy}
                onPress={() =>
                  void run(() =>
                    services.reports.act(ticket.id, { type: 'rate', stars }, 'resident'),
                  )
                }
                style={({ pressed }) => [
                  styles.star,
                  pressed && { backgroundColor: colors.yellowSoft },
                ]}
              >
                <Icon name="star-outline" size={34} color={colors.amber} />
              </Pressable>
            ))}
          </View>
        </Section>
      ) : ticket.rating ? (
        <View style={styles.row}>
          {Array.from({ length: ticket.rating }, (_, i) => (
            <Icon key={i} name="star" size={24} color={colors.amber} />
          ))}
          <AppText>{t('reports.detail.thanks')}</AppText>
        </View>
      ) : null}

      {ticket.photos.length ? (
        <Section title={t('reports.detail.photos')}>
          <View style={styles.pair}>
            {ticket.photos.map((p, i) => (
              <View key={i} style={styles.flex}>
                <PhotoView photo={p} accessibilityLabel={t('reports.detail.photos')} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title={t('reports.detail.where')}>
        <AppText>
          {barangay}
          {ticket.landmark ? ` · ${ticket.landmark}` : ''}
        </AppText>
        <View style={styles.map}>
          <KMap
            barangays={barangays}
            meta={meta}
            trucks={[]}
            initialCenter={{ center: ticket.location, zoom: 16 }}
            pins={[
              {
                id: ticket.id,
                position: ticket.location,
                color: colors.red,
                icon: CATEGORY_META[ticket.category].icon,
                label: t(`reports.category.${ticket.category}`),
              },
            ]}
            style={StyleSheet.absoluteFill}
            accessibilityLabel={t('reports.detail.where')}
          />
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  flex: { flex: 1, gap: spacing.xs },
  pair: { flexDirection: 'row', gap: spacing.sm },
  reopen: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
  stars: { flexDirection: 'row', gap: spacing.xs },
  star: {
    width: touch.large,
    height: touch.large,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    height: 200,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
