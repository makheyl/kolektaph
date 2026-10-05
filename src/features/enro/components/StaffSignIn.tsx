import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { OfflineError, ServerError, services } from '@/services';
import { useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

/**
 * City ENRO sign-in. Accounts are made by the City's administrator; nobody registers here.
 * The password goes straight to the sign-in service and is never kept by the app.
 */
export function StaffSignIn({ checking }: { checking: boolean }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) return setError(t('enro.signIn.missing'));
    setBusy(true);
    setError(null);
    try {
      await services.auth.signIn(email, password);
      setPassword('');
    } catch (e) {
      setError(
        e instanceof OfflineError
          ? t('enro.signIn.offline')
          : e instanceof ServerError && e.code === 'not_staff'
            ? t('enro.signIn.notStaff')
            : e instanceof ServerError && e.status === 429
              ? t('enro.signIn.tooMany')
              : t('enro.signIn.wrong'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          Kolekta
          <AppText variant="display" color={colors.green}>
            PH
          </AppText>
        </AppText>
        <AppText variant="title">
          {t('enro.brand')} · {t('enro.signIn.title')}
        </AppText>
        <View style={styles.row}>
          <Chip label="Filipino" selected={language === 'fil'} onPress={() => setLanguage('fil')} />
          <Chip label="English" selected={language === 'en'} onPress={() => setLanguage('en')} />
        </View>
      </View>

      {checking ? (
        <AppText accessibilityLiveRegion="polite">{t('enro.signIn.checking')}</AppText>
      ) : (
        <Card>
          <View style={styles.row}>
            <Icon name="shield-lock-outline" size={26} color={colors.navy} />
            <AppText style={styles.flex}>{t('enro.signIn.body')}</AppText>
          </View>
          <TextField
            label={t('enro.signIn.email')}
            icon="at"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            onSubmitEditing={() => void submit()}
          />
          <TextField
            label={t('enro.signIn.password')}
            icon="key"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            error={error}
            onSubmitEditing={() => void submit()}
          />
          <Button
            icon="shield-check"
            label={busy ? t('enro.signIn.busy') : t('enro.signIn.submit')}
            disabled={busy}
            onPress={() => void submit()}
          />
          <AppText variant="caption" color={colors.textMuted}>
            {t('enro.signIn.help')}
          </AppText>
        </Card>
      )}

      <Button
        variant="secondary"
        icon="arrow-left"
        label={t('enro.nav.backToDemo')}
        onPress={() => router.replace('/demo')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  flex: { flex: 1, minWidth: 200 },
});
