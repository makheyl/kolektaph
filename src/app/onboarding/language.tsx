import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { type Language, useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'fil', label: 'Filipino' },
  { id: 'en', label: 'English' },
];

/** Step 1 of 3. Two big choices and nothing else. */
export default function LanguageStep() {
  const { t } = useTranslation();
  const { language, setLanguage, largeText, setLargeText } = useSettings();

  return (
    <Screen>
      <StepIndicator current={1} total={3} />
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          Kolekta
          <AppText variant="display" color={colors.green}>
            PH
          </AppText>
        </AppText>
        <AppText variant="title">{t('onboarding.language.title')}</AppText>
        <AppText color={colors.textMuted}>{t('onboarding.language.subtitle')}</AppText>
      </View>

      <View style={styles.choices} accessibilityRole="radiogroup">
        {LANGUAGES.map((l) => (
          <Button
            key={l.id}
            label={language === l.id ? `✓ ${l.label}` : l.label}
            variant={language === l.id ? 'primary' : 'secondary'}
            onPress={() => setLanguage(l.id)}
          />
        ))}
      </View>

      <View style={styles.largeText}>
        <Chip
          label={t('common.largeText')}
          selected={largeText}
          onPress={() => setLargeText(!largeText)}
        />
        <AppText variant="label" color={colors.textMuted} style={styles.hint}>
          {t('onboarding.language.largeTextHint')}
        </AppText>
      </View>

      <Button
        variant="success"
        icon="arrow-right"
        label={t('common.continue')}
        onPress={() => router.push('/onboarding/barangay')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  choices: { gap: spacing.md },
  largeText: { gap: spacing.sm },
  hint: { flexShrink: 1 },
});
