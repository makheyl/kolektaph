import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { formatDate } from '@/features/resident/format';
import { formatPoints } from '@/features/rewards/format';
import { usePerks, useVouchers } from '@/features/rewards/hooks';
import { goBack } from '@/lib/navigation';
import { useSettings } from '@/stores/settings';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/** A voucher: the code to show at the counter, what it is for and until when. */
export default function VoucherScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const language = useSettings((s) => s.language);
  const voucher = useVouchers().find((v) => v.id === id);
  const perk = usePerks()?.find((p) => p.id === voucher?.perkId);

  const header = (
    <AppHeader
      title={t('rewards.voucher.title')}
      leading={
        <IconButton
          icon="arrow-left"
          label={t('common.back')}
          onPress={() => goBack('/resident/rewards')}
        />
      }
    />
  );

  if (!voucher) {
    return (
      <Screen header={header}>
        <EmptyState icon="ticket-confirmation-outline" title={t('rewards.voucher.notFound')}>
          <Button
            variant="secondary"
            label={t('rewards.title')}
            onPress={() => router.replace('/resident/rewards')}
          />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <Card variant="mint" style={styles.card}>
        <View style={styles.badge} aria-hidden>
          <Icon name="check" size={32} color={colors.textOnDark} />
        </View>
        <AppText variant="heading" color={colors.primary} style={styles.center}>
          {perk?.title[language] ?? t('rewards.voucher.title')}
        </AppText>
        {perk ? (
          <AppText variant="label" color={colors.textMuted} style={styles.center}>
            {perk.partner} · {t('rewards.cost', { points: formatPoints(perk.cost) })}
          </AppText>
        ) : null}
        <View style={styles.code} accessible accessibilityLabel={voucher.code.split('').join(' ')}>
          <AppText variant="title" selectable style={styles.codeText}>
            {voucher.code}
          </AppText>
        </View>
        <AppText style={styles.center}>{t('rewards.voucher.show')}</AppText>
        <AppText variant="label" color={colors.textMuted} style={styles.center}>
          {t(`rewards.voucher.status.${voucher.status}`)} ·{' '}
          {t('rewards.voucher.validUntil', { day: formatDate(t, voucher.validUntil) })}
        </AppText>
      </Card>

      {perk?.sample ? <Notice tone="warning" text={t('rewards.voucher.sample')} /> : null}

      <Button
        variant="secondary"
        icon="gift-outline"
        label={t('rewards.title')}
        onPress={() => router.replace('/resident/rewards')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center' },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  code: {
    maxWidth: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  codeText: { fontFamily: fonts.extrabold, letterSpacing: 2, textAlign: 'center' },
});
