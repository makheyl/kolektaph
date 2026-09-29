import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { BarangayPicker } from '@/features/resident/components/BarangayPicker';
import { useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

/** Step 2 of 3. Picking a barangay is optional: residents can look around first. */
export default function BarangayStep() {
  const { t } = useTranslation();
  const { barangayId, setBarangayId } = useSettings();

  const choose = (id: string) => {
    setBarangayId(id);
    router.push('/onboarding/sms');
  };

  return (
    <Screen>
      <StepIndicator current={2} total={3} />
      <AppHeader
        title={t('onboarding.barangay.title')}
        leading={
          <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} />
        }
      />
      <AppText color={colors.textMuted}>{t('onboarding.barangay.subtitle')}</AppText>
      <BarangayPicker selectedId={barangayId} onSelect={choose} />
      <View style={styles.skip}>
        <Button
          variant="secondary"
          label={t('onboarding.barangay.skip')}
          onPress={() => router.push('/onboarding/sms')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skip: { paddingBottom: spacing.xl },
});
