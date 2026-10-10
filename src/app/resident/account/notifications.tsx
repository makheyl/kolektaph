import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { goBack } from '@/lib/navigation';
import { maskPhMobile } from '@/lib/phone';
import { OfflineError, services } from '@/services';
import { useSettings } from '@/stores/settings';
import { colors } from '@/theme/tokens';

/** Notification preferences: the text alerts, and the way to the list of what was sent. */
export default function NotificationPreferences() {
  const { t } = useTranslation();
  const sms = useSettings((s) => s.sms);
  const setSms = useSettings((s) => s.setSms);
  const markSmsSynced = useSettings((s) => s.markSmsSynced);
  const [busy, setBusy] = useState(false);
  /** Why the server could not be told (no signal, or it refused). */
  const [failed, setFailed] = useState<'offline' | 'refused' | null>(null);

  /** The server must hear it first: otherwise texts would go on after the app says "off". */
  const turnOff = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await services.resident.unsubscribeSms();
    } catch (e) {
      setFailed(e instanceof OfflineError ? 'offline' : 'refused');
      return;
    } finally {
      setBusy(false);
    }
    setSms(null);
    markSmsSynced(null);
  };

  return (
    <Screen
      tone="mint"
      header={
        <AppHeader
          tone="green"
          title={t('resident.account.notifications')}
          leading={
            <IconButton
              icon="arrow-left"
              color={colors.textOnDark}
              label={t('common.back')}
              onPress={() => goBack('/resident/settings')}
            />
          }
        />
      }
    >
      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('resident.account.preferences')}
        </AppText>
        {/* Turning text alerts on goes through the sign-up form; off is sent to the server first. */}
        <SwitchRow
          icon="message-text"
          title={t('resident.settings.sms')}
          subtitle={
            sms
              ? t('resident.settings.smsOn', { mobile: maskPhMobile(sms.mobile) })
              : t('resident.settings.smsOff')
          }
          value={!!sms}
          disabled={busy}
          onChange={(on) =>
            on
              ? router.push({ pathname: '/onboarding/sms', params: { from: 'settings' } })
              : void turnOff()
          }
        />
        <AppText variant="label" color={colors.textMuted}>
          {t('resident.account.smsHint')}
        </AppText>
        {failed ? (
          <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
            {t(
              failed === 'offline' ? 'resident.settings.needsSignal' : 'resident.settings.notDone',
            )}
          </AppText>
        ) : null}
      </Card>

      <ListRow
        variant="card"
        icon="bell-outline"
        title={t('resident.alerts.title')}
        subtitle={t('resident.account.alertsHint')}
        onPress={() => router.push('/resident/alerts')}
      />
    </Screen>
  );
}
