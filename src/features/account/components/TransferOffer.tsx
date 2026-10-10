import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatPoints } from '@/features/rewards/format';
import { OfflineError, services } from '@/services';
import type { GuestTransferOffer } from '@/services/types';
import { colors, spacing } from '@/theme/tokens';

/**
 * Offered once after signing in to an account, when this device held reports or points as a
 * guest: take them over, or leave them here (they come back when the account signs out).
 */
export function TransferOffer({ offer }: { offer: GuestTransferOffer }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const answer = async (accept: boolean) => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await (accept ? services.account.acceptTransfer() : services.account.declineTransfer());
    } catch (e) {
      setFailed(t(e instanceof OfflineError ? 'account.offline' : 'account.transfer.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="mint" style={styles.card}>
      <View style={styles.head}>
        <AppText variant="heading" color={colors.primary} accessibilityRole="header">
          {t('account.transfer.title')}
        </AppText>
      </View>
      <AppText>
        {t('account.transfer.body', { reports: offer.reports, points: formatPoints(offer.points) })}
      </AppText>
      <Button
        icon="swap-horizontal"
        label={t('account.transfer.move')}
        loading={busy}
        onPress={() => void answer(true)}
      />
      <Button
        variant="secondary"
        label={t('account.transfer.leave')}
        disabled={busy}
        onPress={() => void answer(false)}
      />
      {failed ? (
        <AppText variant="label" color={colors.red} accessibilityLiveRegion="assertive">
          {failed}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  head: { gap: spacing.xs },
});
