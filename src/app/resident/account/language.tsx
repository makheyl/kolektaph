import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { ListRow } from '@/components/ui/ListRow';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { goBack } from '@/lib/navigation';
import { type Language, useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'fil', label: 'Filipino' },
  { id: 'en', label: 'English' },
];

/** Language and text size: how the app reads on this device. */
export default function LanguageSettings() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);
  const largeText = useSettings((s) => s.largeText);
  const setLargeText = useSettings((s) => s.setLargeText);

  return (
    <Screen
      tone="mint"
      header={
        <AppHeader
          tone="green"
          title={t('resident.account.language')}
          leading={
            <IconButton
              icon="arrow-left"
              color={colors.textOnDark}
              label={t('common.back')}
              onPress={() => goBack('/resident/account')}
            />
          }
        />
      }
    >
      <View style={styles.group} accessibilityRole="radiogroup">
        <AppText variant="heading" accessibilityRole="header">
          {t('common.language')}
        </AppText>
        {LANGUAGES.map((l) => (
          <ListRow
            key={l.id}
            variant="card"
            title={l.label}
            selected={language === l.id}
            trailing="radio"
            onPress={() => setLanguage(l.id)}
          />
        ))}
        <AppText variant="label" color={colors.textMuted}>
          {t('resident.account.languageHint')}
        </AppText>
      </View>
      <SwitchRow
        title={t('common.largeText')}
        subtitle={t('resident.account.largeTextHint')}
        value={largeText}
        onChange={setLargeText}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
