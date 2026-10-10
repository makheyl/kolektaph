import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/layout/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { services } from '@/services';
import { useDemo } from '@/stores/demo';
import { useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

/**
 * The first screen for someone new. Residents need no account: one button takes them to the
 * three short set-up steps. Those who made one log in under it; crews and City ENRO staff sign
 * in from the last button.
 */
export default function Welcome() {
  const { t } = useTranslation();
  const setRole = useSettings((s) => s.setRole);
  const role = useSettings((s) => s.role);
  const demoMode = useDemo((s) => s.demoMode);

  // Reaching this screen means the person left the crew or staff app: forget that choice, so the
  // next launch opens here and not on a sign-in they cannot pass.
  useEffect(() => {
    if (role === 'driver' || role === 'enro') setRole(null);
  }, [role, setRole]);

  const start = () => {
    setRole('resident');
    // The resident area sends a newcomer through language, barangay and text alerts first.
    router.push('/resident');
  };

  return (
    <AuthShell brand="lockup" brandLink={false}>
      <View style={styles.intro}>
        <AppText
          variant="title"
          color={colors.ink}
          accessibilityRole="header"
          style={styles.center}
        >
          {t('app.tagline')}
        </AppText>
        <AppText color={colors.textMuted} style={styles.center}>
          {t('welcome.body')}
        </AppText>
        <SampleDataBadge centered />
      </View>

      <View style={styles.actions}>
        <Button
          icon="arrow-right"
          label={t('welcome.start')}
          accessibilityHint={t('welcome.startHint')}
          onPress={start}
        />
        <AppText variant="label" color={colors.textMuted} style={styles.center}>
          {t('welcome.startHint')}
        </AppText>
        {services.features.accounts ? (
          <Button
            variant="ghost"
            icon="login"
            label={t('welcome.logIn')}
            onPress={() => router.push('/account/login')}
          />
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon="shield-account-outline"
          label={t('welcome.staff')}
          onPress={() => router.push('/sign-in')}
        />
        {demoMode ? (
          <Button
            variant="ghost"
            icon="flask-outline"
            label={t('welcome.demoTools')}
            onPress={() => router.push('/demo')}
          />
        ) : null}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm },
  center: { textAlign: 'center' },
  actions: { gap: spacing.sm },
});
