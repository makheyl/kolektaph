import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import { PhotoCapture } from '@/components/photos/PhotoCapture';
import { PhotoView } from '@/components/photos/PhotoView';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { taskState } from '@/features/driver/tasks';
import { CATEGORY_META } from '@/features/reports/categories';
import { useTickets } from '@/features/reports/hooks';
import { formatRelativeDay } from '@/features/resident/format';
import { useBarangays, useCityMeta, useSimNow, useTrucks } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import type { PhotoRef } from '@/services/types';
import { useDriver, useDriverLive } from '@/stores/driver';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * A special pickup for the crew (HAKOT: ad-hoc task with before and after photos). The report
 * goes through the same offline queue as every other tap, so it works without signal.
 */
export default function DriverTask() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const shift = useDriver((s) => s.shift);
  const outbox = useDriver((s) => s.outbox);
  const report = useDriver((s) => s.report);
  const truck = useDriverLive((s) => s.truck);
  const tickets = useTickets();
  const now = useSimNow(30_000);
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const { data: trucks = [] } = useTrucks();
  const [before, setBefore] = useState<PhotoRef | null>(null);
  const [after, setAfter] = useState<PhotoRef | null>(null);

  if (!shift || shift.endedAt != null) return <Redirect href="/driver" />;
  const ticket = tickets.find((x) => x.id === id);
  const back = (
    <IconButton
      icon="arrow-left"
      label={t('common.back')}
      onPress={() => goBack('/driver/shift')}
    />
  );
  if (!ticket || !barangays || !meta) {
    return (
      <Screen header={<AppHeader title={t('driver.tasks.title')} leading={back} />}>
        <SkeletonGroup>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const local = outbox.map((o) => o.event);
  const state = taskState(ticket, local);
  const barangay =
    barangays.features.find((f) => f.properties.id === ticket.barangayId)?.properties.name ?? '';
  const me = trucks.find((tr) => tr.id === shift.truckId);

  return (
    <Screen
      header={
        <AppHeader
          eyebrow={ticket.id}
          title={t(`reports.category.${ticket.category}`)}
          leading={back}
        />
      }
      footer={
        state === 'done' ? undefined : (
          <>
            {!before || !after ? (
              <AppText variant="label" color={colors.textMuted}>
                {t('driver.tasks.needPhotos')}
              </AppText>
            ) : null}
            <Button
              size="driver"
              icon="check-circle"
              label={t('driver.tasks.done')}
              disabled={!before || !after}
              onPress={() => {
                if (!before || !after) return;
                report({ kind: 'task', ticketId: ticket.id, action: 'done', before, after });
                goBack('/driver/shift');
              }}
            />
          </>
        )
      }
    >
      <Card>
        <View style={styles.row}>
          <Icon name={CATEGORY_META[ticket.category].icon} size={28} color={colors.ink} />
          <View style={styles.flex}>
            <AppText variant="heading">{barangay}</AppText>
            {ticket.landmark ? (
              <AppText>{t('driver.tasks.landmark', { landmark: ticket.landmark })}</AppText>
            ) : null}
            <AppText color={colors.textMuted}>
              {t(`reports.size.${ticket.size}`)}
              {ticket.dispatch?.due
                ? ` · ${t('driver.tasks.due', { time: `${formatRelativeDay(t, ticket.dispatch.due, now)}, ${formatClock(ticket.dispatch.due)}` })}`
                : ''}
            </AppText>
          </View>
        </View>
        {ticket.category === 'HAZARD' ? (
          <AppText variant="bodyStrong" color={colors.red}>
            {t('reports.categoryHint.HAZARD')}
          </AppText>
        ) : null}
      </Card>

      <View style={styles.map}>
        <KMap
          barangays={barangays}
          meta={meta}
          trucks={
            truck?.position && me
              ? [
                  {
                    id: me.id,
                    code: me.code,
                    name: me.name,
                    status: truck.status,
                    position: truck.position,
                  },
                ]
              : []
          }
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

      {ticket.photos.length ? (
        <Section title={t('driver.tasks.residentPhotos')}>
          <View style={styles.pair}>
            {ticket.photos.map((p, i) => (
              <View key={i} style={styles.flex}>
                <PhotoView photo={p} accessibilityLabel={t('driver.tasks.residentPhotos')} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {state === 'done' ? (
        <Card variant="mint">
          <Icon name="check-circle" size={36} color={colors.primary} />
          <AppText variant="heading" color={colors.primary}>
            {t('driver.tasks.doneState')}
          </AppText>
          <AppText>{t('driver.tasks.sent')}</AppText>
        </Card>
      ) : (
        <>
          {state === 'todo' ? (
            <Button
              size="driver"
              variant="secondary"
              icon="truck-fast"
              label={t('driver.tasks.start')}
              onPress={() =>
                report({
                  kind: 'task',
                  ticketId: ticket.id,
                  action: 'start',
                  before: null,
                  after: null,
                })
              }
            />
          ) : (
            <AppText variant="bodyStrong" color={colors.primary}>
              {t('driver.tasks.startedNote')}
            </AppText>
          )}
          <Section title={t('driver.tasks.before')}>
            {before ? (
              <PhotoView photo={before} accessibilityLabel={t('driver.tasks.before')} />
            ) : null}
            <PhotoCapture
              guide="before"
              label={before ? t('reports.wizard.retake') : t('driver.tasks.before')}
              variant={before ? 'secondary' : 'primary'}
              sample={CATEGORY_META[ticket.category].sample}
              onCaptured={setBefore}
            />
          </Section>
          <Section title={t('driver.tasks.after')}>
            {after ? (
              <PhotoView photo={after} accessibilityLabel={t('driver.tasks.after')} />
            ) : null}
            <PhotoCapture
              guide="after"
              label={after ? t('reports.wizard.retake') : t('driver.tasks.after')}
              variant={after ? 'secondary' : 'primary'}
              sample="clean"
              onCaptured={setAfter}
            />
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.sm },
  map: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
