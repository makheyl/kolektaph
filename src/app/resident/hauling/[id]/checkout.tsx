import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import type { PressState } from '@/components/ui/interaction';
import { useNarrow } from '@/components/ui/narrow';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { BookingSummary, QuoteBreakdown } from '@/features/hauling/components/HaulingBits';
import { useMyHauling } from '@/features/hauling/hooks';
import {
  amountDue,
  formatPesos,
  maxPointsFor,
  POINTS_STEP,
  pointsDiscount,
} from '@/features/hauling/pricing';
import { canPay, PAYMENT_METHODS } from '@/features/hauling/status';
import { formatPoints } from '@/features/rewards/format';
import { usePoints } from '@/features/rewards/hooks';
import { useBarangays, useSimNow } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { OfflineError, services } from '@/services';
import type { HaulingRequest, PaymentMethod } from '@/services/types';
import { colors, fonts, radius, spacing, touch } from '@/theme/tokens';

/**
 * The checkout of a hauling request: the booking, the fee, an Eco Points discount and the way
 * to pay. No payment provider is connected: the online methods are a sample and say so.
 */
export default function HaulingCheckout() {
  const { t } = useTranslation();
  const narrow = useNarrow();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useSimNow(30_000);
  const requests = useMyHauling();
  const summary = usePoints();
  const { data: barangays } = useBarangays();
  const [method, setMethod] = useState<PaymentMethod>('gcash');
  const [points, setPoints] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'offline' | 'other' | null>(null);
  const [paid, setPaid] = useState<HaulingRequest | null>(null);

  const toBooking = () =>
    router.replace({ pathname: '/resident/hauling/[id]', params: { id: id ?? '' } });
  const header = (
    <AppHeader
      title={t('hauling.checkout.title')}
      leading={
        <IconButton
          icon="close"
          label={t('common.close')}
          onPress={() => goBack('/resident/reports')}
        />
      }
    />
  );

  if (paid?.payment) {
    const cash = paid.payment.method === 'cash';
    return (
      <Screen header={header}>
        <Card variant="mint" style={styles.done}>
          <View style={styles.doneBadge} aria-hidden>
            <Icon name="check" size={36} color={colors.textOnDark} />
          </View>
          <AppText variant="title" color={colors.primary} style={styles.center}>
            {t(cash ? 'hauling.checkout.doneCash' : 'hauling.checkout.donePaid')}
          </AppText>
          <AppText variant="bodyStrong" style={styles.center}>
            {paid.id} · {t('hauling.pesos', { amount: formatPesos(paid.payment.total) })}
          </AppText>
          <AppText style={styles.center}>
            {t(cash ? 'hauling.checkout.doneCashBody' : 'hauling.checkout.donePaidBody')}
          </AppText>
        </Card>
        {cash ? null : <Notice tone="warning" text={t('hauling.checkout.sample')} />}
        <Button icon="clipboard-text-outline" label={t('hauling.sent.open')} onPress={toBooking} />
      </Screen>
    );
  }

  const request = requests?.find((r) => r.id === id);
  if (!request || !summary) {
    return (
      <Screen header={header}>
        {requests && !request ? (
          <EmptyState icon="truck" title={t('hauling.detail.notFound')} />
        ) : (
          <SkeletonGroup>
            <SkeletonCard lines={5} />
            <SkeletonCard lines={5} />
          </SkeletonGroup>
        )}
      </Screen>
    );
  }
  const { quote } = request;
  if (!quote || !canPay(request, now)) {
    return (
      <Screen header={header}>
        <EmptyState icon="timer-off-outline" title={t('hauling.checkout.nothingToPay')}>
          <Button variant="secondary" label={t('hauling.sent.open')} onPress={toBooking} />
        </EmptyState>
      </Screen>
    );
  }

  const { rules } = summary;
  const most = services.features.rewards ? maxPointsFor(quote, summary.balance, rules) : 0;
  const used = Math.min(points, most);
  const due = amountDue(quote, used, rules);
  const barangayName =
    barangays?.features.find((f) => f.properties.id === request.barangayId)?.properties.name ?? '';

  const pay = async () => {
    setBusy(true);
    setFailed(null);
    try {
      setPaid(await services.hauling.pay(request.id, method, used));
    } catch (e) {
      setFailed(e instanceof OfflineError ? 'offline' : 'other');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={header}
      footer={
        <>
          {failed ? (
            <AppText variant="label" color={colors.red} accessibilityLiveRegion="assertive">
              {t(`hauling.form.failed.${failed}`)}
            </AppText>
          ) : null}
          <Button
            icon={method === 'cash' ? 'check' : 'cash-multiple'}
            label={
              method === 'cash'
                ? t('hauling.checkout.confirmCash')
                : t('hauling.checkout.pay', { amount: formatPesos(due) })
            }
            loading={busy}
            onPress={() => void pay()}
          />
        </>
      }
    >
      <BookingSummary request={request} barangayName={barangayName} />
      <QuoteBreakdown quote={quote} pointsUsed={used} rules={rules} />

      {most > 0 ? (
        <Card>
          <AppText variant="bodyStrong" color={colors.primary} accessibilityRole="header">
            {t('hauling.checkout.pointsTitle')}
          </AppText>
          <AppText variant="label" color={colors.textMuted}>
            {t('hauling.checkout.pointsHint', {
              balance: formatPoints(summary.balance),
              pesos: formatPesos(rules.pesosPer100),
            })}
          </AppText>
          {/* The number first, then the two buttons: it fits a narrow screen at any text size. */}
          <View
            style={styles.stepperValue}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('hauling.checkout.pointsUsed', {
              points: formatPoints(used),
              pesos: formatPesos(pointsDiscount(used, rules)),
            })}
          >
            <AppText variant="heading">{formatPoints(used)}</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {t('rewards.pts')}
            </AppText>
          </View>
          <View style={styles.stepper}>
            <IconButton
              icon="minus"
              label={t('hauling.checkout.pointsLess')}
              onPress={() => setPoints(Math.max(0, used - POINTS_STEP))}
            />
            <IconButton
              icon="plus"
              label={t('hauling.checkout.pointsMore')}
              onPress={() => setPoints(Math.min(most, used + POINTS_STEP))}
            />
          </View>
        </Card>
      ) : null}

      <View style={styles.block}>
        <AppText variant="heading" color={colors.primary} accessibilityRole="header">
          {t('hauling.checkout.method')}
        </AppText>
        <View style={styles.methods} accessibilityRole="radiogroup">
          {PAYMENT_METHODS.map((m) => {
            const selected = method === m.id;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                accessibilityLabel={`${t(`hauling.payment.${m.id}`)}${m.id === 'cash' ? '' : `. ${t('hauling.checkout.sampleShort')}`}`}
                onPress={() => setMethod(m.id)}
                style={({ pressed, hovered }: PressState) => [
                  styles.method,
                  selected && styles.methodOn,
                  (pressed || hovered) && { backgroundColor: colors.mintSoft },
                ]}
              >
                {narrow ? null : <Icon name={m.icon} size={26} color={colors.primary} />}
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" color={colors.primary}>
                    {t(`hauling.payment.${m.id}`)}
                  </AppText>
                  {m.id === 'cash' ? null : (
                    <AppText variant="caption" color={colors.amber} style={styles.sample}>
                      {t('hauling.checkout.sampleShort')}
                    </AppText>
                  )}
                </View>
                <Icon
                  name={selected ? 'check-circle' : 'checkbox-blank-circle-outline'}
                  size={24}
                  color={selected ? colors.primary : colors.fieldBorder}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      {method === 'cash' ? null : <Notice tone="warning" text={t('hauling.checkout.sample')} />}
      <AppText variant="label" color={colors.textMuted}>
        {t('hauling.checkout.terms')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  methods: { gap: spacing.sm },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.large,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
  },
  methodOn: { borderWidth: 2.5, borderColor: colors.primary },
  sample: { fontFamily: fonts.semibold },
  flex: { flex: 1, minWidth: 0 },
  stepper: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  stepperValue: { alignItems: 'center' },
  center: { textAlign: 'center' },
  done: { alignItems: 'center' },
  doneBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
