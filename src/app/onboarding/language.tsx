import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/layout/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Icon } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { type Language, useSettings } from '@/stores/settings';
import { colors, radius, shadows, spacing, touch } from '@/theme/tokens';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'fil', label: 'Filipino' },
  { id: 'en', label: 'English' },
];

/** Step 1 of 3. Two big choices and nothing else. */
export default function LanguageStep() {
  const { t } = useTranslation();
  const { language, setLanguage, largeText, setLargeText } = useSettings();

  return (
    <AuthShell
      back="/welcome"
      brand="kolek"
      topRight={<View />}
      step={{ current: 1, total: 3 }}
      title={t('onboarding.language.title')}
      subtitle={t('onboarding.language.subtitle')}
      footer={
        <Button
          icon="arrow-right"
          label={t('common.continue')}
          onPress={() => router.push('/onboarding/barangay')}
        />
      }
    >
      <View
        style={styles.choices}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('common.language')}
      >
        {LANGUAGES.map((l) => {
          const selected = language === l.id;
          return (
            <Pressable
              key={l.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              accessibilityLabel={l.label}
              onPress={() => setLanguage(l.id)}
              style={({ pressed, hovered }: PressState) => [
                styles.choice,
                selected && styles.chosen,
                { opacity: pressed ? 0.8 : hovered ? 0.92 : 1 },
              ]}
            >
              <AppText variant="heading" style={styles.choiceLabel}>
                {l.label}
              </AppText>
              <Icon
                name={selected ? 'check-circle' : 'circle-outline'}
                size={28}
                color={selected ? colors.primary : colors.fieldBorder}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.largeText}>
        <Checkbox checked={largeText} onChange={setLargeText} label={t('common.largeText')} />
        <AppText variant="label" color={colors.textMuted}>
          {t('onboarding.language.largeTextHint')}
        </AppText>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  choices: { gap: spacing.md },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.driver,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  // Chosen = green outline AND a filled check, so it never depends on colour alone.
  chosen: { borderColor: colors.primary },
  choiceLabel: { flex: 1 },
  largeText: { gap: spacing.xs },
});
