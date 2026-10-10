import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { goBack } from '@/lib/navigation';
import { colors, spacing } from '@/theme/tokens';

const SECTIONS = ['collect', 'account', 'why', 'who', 'rights'] as const;

const openSettings = () => {
  Linking.openSettings().catch(() => undefined);
};

/** Plain-language privacy notice (Data Privacy Act, RA 10173). Draft pending DPO review. */
export default function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <Screen
      header={
        <AppHeader
          tone="green"
          title={t('privacy.title')}
          leading={
            <IconButton
              icon="arrow-left"
              color={colors.textOnDark}
              label={t('common.back')}
              onPress={() => goBack('/resident')}
            />
          }
        />
      }
    >
      <Notice tone="warning" text={t('privacy.draft')} />
      {/* The phone's own switches for the location and the camera. A web page has no such settings. */}
      {Platform.OS !== 'web' ? (
        <View style={styles.devices}>
          <AppText variant="heading" accessibilityRole="header">
            {t('resident.privacyPage.devices')}
          </AppText>
          <ListRow
            variant="card"
            icon="map-marker"
            title={t('resident.privacyPage.location')}
            subtitle={t('resident.privacyPage.locationHint')}
            onPress={() => openSettings()}
          />
          <ListRow
            variant="card"
            icon="camera"
            title={t('resident.privacyPage.camera')}
            subtitle={t('resident.privacyPage.cameraHint')}
            onPress={() => openSettings()}
          />
          <AppText variant="label" color={colors.textMuted}>
            {t('resident.privacyPage.openSettings')}
          </AppText>
        </View>
      ) : null}
      {SECTIONS.map((s) => (
        <Card key={s}>
          <AppText variant="heading" color={colors.primary} accessibilityRole="header">
            {t(`privacy.${s}Title`)}
          </AppText>
          <AppText>{t(`privacy.${s}Body`)}</AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  devices: { gap: spacing.sm },
});
