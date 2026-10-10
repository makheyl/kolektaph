import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PhotoView } from '@/components/photos/PhotoView';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import {
  BookingSummary,
  HaulingStatusPill,
  QuoteBreakdown,
} from '@/features/hauling/components/HaulingBits';
import { useMyHauling } from '@/features/hauling/hooks';
import { formatPesos } from '@/features/hauling/pricing';
import { canCancel, HAULING_STEPS, haulingView } from '@/features/hauling/status';
import { formatDate } from '@/features/resident/format';
import { usePoints } from '@/features/rewards/hooks';
import { useBarangays, useSimNow } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import { OfflineError, services } from '@/services';
import { colors, radius, spacing } from '@/theme/tokens';

/** One hauling request: where it stands, the City's quotation, and what was paid. */
export default function HaulingDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useSimNow(30_000);
  const requests = useMyHauling();
  const summary = usePoints();
  const { data: barangays } = useBarangays();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'offline' | 'other' | null>(null);

  const back = (
    <IconButton
      icon="arrow-left"
      label={t('common.back')}
      onPress={() => goBack('/resident/reports')}
    />
  );
  const request = requests?.find((r) => r.id === id);

  if (!request) {
    return (
      <Screen header={<AppHeader title={t('hauling.title')} leading={back} />}>
        {requests ? (
          <EmptyState icon="truck" title={t('hauling.detail.notFound')} />
        ) : (
          <SkeletonGroup>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </SkeletonGroup>
        )}
      </Screen>
    );
  }

  const view = haulingView(request, now);
  const rules = summary?.rules ?? { pesosPer100: 0 };
  const barangayName =
    barangays?.features.find((f) => f.properties.id === request.barangayId)?.properties.name ?? '';
  const reached = (status: string) => request.history.findLast((h) => h.status === status);
  const ended = ['declined', 'cancelled'].includes(request.status);
  const steps = ended ? HAULING_STEPS.filter((s) => reached(s)) : HAULING_STEPS;
  const index = HAULING_STEPS.indexOf(request.status);

  const cancel = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await services.hauling.cancel(request.id);
      setConfirmCancel(false);
    } catch (e) {
      setFailed(e instanceof OfflineError ? 'offline' : 'other');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<AppHeader eyebrow={request.id} title={t('hauling.title')} leading={back} />}
      footer={
        view === 'quoted' ? (
          <Button
            icon="cash-multiple"
            label={t('hauling.detail.pay')}
            onPress={() =>
              router.push({
                pathname: '/resident/hauling/[id]/checkout',
                params: { id: request.id },
              })
            }
          />
        ) : undefined
      }
    >
      <View style={styles.top}>
        <HaulingStatusPill view={view} />
        <AppText color={colors.textMuted}>{t(`hauling.detail.next.${view}`)}</AppText>
        {request.sample ? <Notice tone="warning" text={t('hauling.sampleRequest')} /> : null}
      </View>

      <BookingSummary request={request} barangayName={barangayName} />

      {request.quote && view !== 'expired' ? (
        <View style={styles.block}>
          <QuoteBreakdown
            quote={request.quote}
            pointsUsed={request.payment?.pointsUsed ?? 0}
            rules={rules}
          />
          {view === 'quoted' ? (
            <AppText variant="label" color={colors.textMuted}>
              {t('hauling.detail.validUntil', {
                day: formatDate(t, request.quote.validUntil),
                time: formatClock(request.quote.validUntil),
              })}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {request.payment ? (
        <Card>
          <AppText variant="bodyStrong" color={colors.primary} accessibilityRole="header">
            {t('hauling.detail.payment')}
          </AppText>
          <AppText>
            {t(`hauling.payment.${request.payment.method}`)} ·{' '}
            {t('hauling.pesos', { amount: formatPesos(request.payment.total) })} ·{' '}
            {t(`hauling.detail.paymentState.${request.payment.state}`)}
          </AppText>
          {request.payment.sample ? (
            <AppText variant="label" color={colors.amber}>
              {t('hauling.checkout.sampleShort')}
            </AppText>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <AppText variant="bodyStrong" color={colors.primary} accessibilityRole="header">
          {t('hauling.detail.progress')}
        </AppText>
        <View style={styles.steps}>
          {steps.map((s, i) => {
            const event = reached(s);
            const done = ended ? !!event : i <= index;
            return (
              <View
                key={s}
                style={styles.step}
                accessible
                accessibilityLabel={`${t(`hauling.status.${s}`)}${event ? `, ${formatDate(t, event.at)} ${formatClock(event.at)}` : ''}`}
              >
                <View style={[styles.dot, done && styles.dotDone]}>
                  {done ? <Icon name="check" size={14} color={colors.textOnDark} /> : null}
                </View>
                <View style={styles.flex}>
                  <AppText
                    variant={s === request.status ? 'bodyStrong' : 'body'}
                    color={done ? colors.text : colors.textMuted}
                  >
                    {t(`hauling.status.${s}`)}
                  </AppText>
                  {event ? (
                    <AppText variant="caption" color={colors.textMuted}>
                      {formatDate(t, event.at)} · {formatClock(event.at)}
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })}
          {ended ? (
            <View style={styles.step}>
              <View style={[styles.dot, styles.dotEnded]}>
                <Icon name="close" size={14} color={colors.textOnDark} />
              </View>
              <AppText variant="bodyStrong" style={styles.flex}>
                {t(`hauling.status.${request.status}`)}
              </AppText>
            </View>
          ) : null}
        </View>
      </Card>

      {request.description ? (
        <Card>
          <AppText variant="bodyStrong" color={colors.primary} accessibilityRole="header">
            {t('hauling.form.description')}
          </AppText>
          <AppText>{request.description}</AppText>
        </Card>
      ) : null}

      {request.photos.length ? (
        <View style={styles.photos}>
          {request.photos.map((p, i) => (
            <View key={i} style={styles.photo}>
              <PhotoView photo={p} accessibilityLabel={t('hauling.form.photoN', { n: i + 1 })} />
            </View>
          ))}
        </View>
      ) : null}

      {canCancel(request) ? (
        confirmCancel ? (
          // Inline confirmation: works the same on web, where native alert dialogs don't.
          <Notice tone="danger" icon="cancel" live="polite">
            <AppText variant="bodyStrong">{t('hauling.detail.cancelTitle')}</AppText>
            <AppText>{t('hauling.detail.cancelBody')}</AppText>
            <Button
              variant="danger"
              label={t('hauling.detail.cancelYes')}
              loading={busy}
              onPress={() => void cancel()}
            />
            {failed ? (
              <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
                {t(`hauling.form.failed.${failed}`)}
              </AppText>
            ) : null}
            <Button
              variant="secondary"
              label={t('common.cancel')}
              onPress={() => setConfirmCancel(false)}
            />
          </Notice>
        ) : (
          <Button
            variant="ghost"
            icon="cancel"
            label={t('hauling.detail.cancel')}
            onPress={() => setConfirmCancel(true)}
          />
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.sm },
  block: { gap: spacing.sm },
  steps: { gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotEnded: { backgroundColor: colors.grey, borderColor: colors.grey },
  flex: { flex: 1, minWidth: 0 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photo: { flexGrow: 1, flexBasis: 130, maxWidth: 240 },
});
