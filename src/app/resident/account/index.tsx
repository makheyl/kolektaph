import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { useAccount } from '@/features/account/hooks';
import { barangayLabel } from '@/features/resident/format';
import { useBarangays } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { OfflineError, services } from '@/services';
import { useMyReports } from '@/stores/myReports';
import { useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

/** Account settings: where the resident lives, how the app reads, and what it keeps. */
export default function AccountSettings() {
  const { t } = useTranslation();
  const barangayId = useSettings((s) => s.barangayId);
  const language = useSettings((s) => s.language);
  const largeText = useSettings((s) => s.largeText);
  const deleteMyData = useSettings((s) => s.deleteMyData);
  const { data: barangays } = useBarangays();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Why the server could not be told (no signal, or it refused). */
  const [failed, setFailed] = useState<'offline' | 'refused' | null>(null);
  const props = barangays?.features.find((f) => f.properties.id === barangayId)?.properties;
  const registered = useAccount().status === 'registered';

  const erase = async () => {
    setBusy(true);
    setFailed(null);
    try {
      // The server forgets this device first (its text sign-up goes with it).
      await services.resident.forgetMe();
    } catch (e) {
      setFailed(e instanceof OfflineError ? 'offline' : 'refused');
      return;
    } finally {
      setBusy(false);
    }
    deleteMyData();
    // Report numbers and the claim street are the resident's data too.
    useMyReports.getState().clear();
    router.replace('/onboarding/language');
  };

  return (
    <Screen
      tone="mint"
      header={
        <AppHeader
          tone="green"
          title={t('resident.account.title')}
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
      <View style={styles.links}>
        {registered ? (
          <>
            <ListRow
              variant="card"
              icon="account"
              title={t('account.personal.title')}
              onPress={() => router.push('/resident/account/personal')}
            />
            <ListRow
              variant="card"
              icon="shield-lock-outline"
              title={t('account.security.title')}
              onPress={() => router.push('/resident/account/security')}
            />
          </>
        ) : null}
        <ListRow
          variant="card"
          icon="map-marker"
          title={t('resident.account.address')}
          subtitle={props ? barangayLabel(props) : t('resident.home.pickTitle')}
          onPress={() => router.push('/resident/barangay')}
        />
        <ListRow
          variant="card"
          icon="translate"
          title={t('resident.account.language')}
          subtitle={[
            language === 'en' ? 'English' : 'Filipino',
            largeText ? t('common.largeText') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => router.push('/resident/account/language')}
        />
        <ListRow
          variant="card"
          icon="shield-account-outline"
          title={t('resident.account.privacy')}
          subtitle={t('resident.settings.privacy')}
          onPress={() => router.push('/resident/privacy')}
        />
      </View>

      {confirmDelete ? (
        // Inline confirmation: works the same on web, where native alert dialogs don't.
        <Notice tone="danger" icon="delete" live="polite">
          <AppText variant="heading">{t('resident.settings.deleteConfirmTitle')}</AppText>
          <AppText>{t('resident.settings.deleteConfirmBody')}</AppText>
          <Button
            variant="danger"
            icon="delete"
            label={t('resident.settings.deleteConfirm')}
            loading={busy}
            onPress={() => void erase()}
          />
          {failed ? (
            <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
              {t(
                failed === 'offline'
                  ? 'resident.settings.needsSignal'
                  : 'resident.settings.notDone',
              )}
            </AppText>
          ) : null}
          <Button
            variant="secondary"
            label={t('common.cancel')}
            onPress={() => setConfirmDelete(false)}
          />
        </Notice>
      ) : (
        <View style={styles.delete}>
          <Button
            variant="danger"
            icon="delete-outline"
            label={t('resident.settings.deleteData')}
            onPress={() => setConfirmDelete(true)}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: { gap: spacing.md },
  delete: { marginTop: spacing.lg },
});
