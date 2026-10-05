import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { barangayLabel } from '@/features/resident/format';
import { useBarangays } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { maskPhMobile } from '@/lib/phone';
import { OfflineError, services } from '@/services';
import { useMyReports } from '@/stores/myReports';
import { useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const {
    language,
    setLanguage,
    largeText,
    setLargeText,
    barangayId,
    sms,
    setSms,
    markSmsSynced,
    deleteMyData,
  } = useSettings();
  const { data: barangays } = useBarangays();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Which change could not reach the server, and why (no signal, or refused). */
  const [failed, setFailed] = useState<{ what: 'sms' | 'delete'; offline: boolean } | null>(null);

  /** The server must hear it first: otherwise texts would go on after the app says "off". */
  const withServer = async (what: 'sms' | 'delete', change: () => Promise<void>) => {
    setBusy(true);
    setFailed(null);
    try {
      await change();
      return true;
    } catch (e) {
      setFailed({ what, offline: e instanceof OfflineError });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const failure = (what: 'sms' | 'delete') =>
    failed?.what === what ? (
      <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
        {t(failed.offline ? 'resident.settings.needsSignal' : 'resident.settings.notDone')}
      </AppText>
    ) : null;
  const props = barangays?.features.find((f) => f.properties.id === barangayId)?.properties;

  return (
    <Screen>
      <AppHeader
        title={t('common.settings')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/resident')}
          />
        }
      />

      <Section title={t('common.language')}>
        <View style={styles.chips}>
          <Chip label="Filipino" selected={language === 'fil'} onPress={() => setLanguage('fil')} />
          <Chip label="English" selected={language === 'en'} onPress={() => setLanguage('en')} />
          <Chip
            label={t('common.largeText')}
            selected={largeText}
            onPress={() => setLargeText(!largeText)}
          />
        </View>
      </Section>

      <Section title={t('resident.settings.barangay')}>
        <Card>
          <ListRow
            icon="map-marker"
            title={props ? barangayLabel(props) : t('resident.home.pickTitle')}
            subtitle={t('resident.settings.changeBarangay')}
            onPress={() => router.push('/resident/barangay')}
          />
        </Card>
      </Section>

      <Section title={t('resident.settings.sms')}>
        <Card>
          <AppText>
            {sms
              ? t('resident.settings.smsOn', { mobile: maskPhMobile(sms.mobile) })
              : t('resident.settings.smsOff')}
          </AppText>
          {sms ? (
            <Button
              variant="secondary"
              icon="message-off-outline"
              label={t('resident.settings.smsTurnOff')}
              disabled={busy}
              onPress={async () => {
                if (!(await withServer('sms', () => services.resident.unsubscribeSms()))) return;
                setSms(null);
                markSmsSynced(null);
              }}
            />
          ) : (
            <Button
              variant="success"
              icon="message-text"
              label={t('resident.settings.smsTurnOn')}
              onPress={() =>
                router.push({ pathname: '/onboarding/sms', params: { from: 'settings' } })
              }
            />
          )}
          {failure('sms')}
        </Card>
      </Section>

      <Card>
        <ListRow
          icon="shield-account-outline"
          title={t('resident.settings.privacy')}
          onPress={() => router.push('/resident/privacy')}
        />
        <ListRow
          icon="delete-outline"
          title={t('resident.settings.deleteData')}
          danger
          onPress={() => setConfirmDelete(true)}
        />
      </Card>

      {confirmDelete ? (
        // Inline confirmation: works the same on web, where native alert dialogs don't.
        <Card style={styles.confirm} accessibilityLiveRegion="polite">
          <AppText variant="heading">{t('resident.settings.deleteConfirmTitle')}</AppText>
          <AppText>{t('resident.settings.deleteConfirmBody')}</AppText>
          <Button
            variant="danger"
            icon="delete"
            label={t('resident.settings.deleteConfirm')}
            disabled={busy}
            onPress={async () => {
              // The server forgets this device first (its text sign-up goes with it).
              if (!(await withServer('delete', () => services.resident.forgetMe()))) return;
              deleteMyData();
              // Report numbers and the claim street are the resident's data too.
              useMyReports.getState().clear();
              router.replace('/onboarding/language');
            }}
          />
          {failure('delete')}
          <Button
            variant="secondary"
            label={t('common.cancel')}
            onPress={() => setConfirmDelete(false)}
          />
        </Card>
      ) : null}

      <Button
        variant="secondary"
        icon="swap-horizontal"
        label={t('resident.settings.switchRole')}
        onPress={() => router.replace('/demo')}
      />
      <AppText variant="caption" color={colors.textMuted} style={styles.footer}>
        {t('app.name')} · {t('common.sampleDataHint')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  confirm: { borderColor: colors.red, borderWidth: 2 },
  footer: { textAlign: 'center', paddingBottom: spacing.xl },
});
