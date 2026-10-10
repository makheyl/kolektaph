import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/layout/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { BigTile } from '@/components/ui/BigTile';
import { type Role, useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

/**
 * Where the people who do sign in choose how: a truck crew (truck and PIN) or City ENRO staff
 * (email and password). Each tile opens that app, which asks for its own sign-in.
 */
export default function SignInChooser() {
  const { t } = useTranslation();
  const setRole = useSettings((s) => s.setRole);

  const open = (role: Role) => {
    setRole(role);
    router.push(`/${role}`);
  };

  return (
    <AuthShell exit="/welcome" brand="kolek" title={t('signIn.title')} subtitle={t('signIn.body')}>
      <View style={styles.tiles}>
        <BigTile
          icon="steering"
          label={t('roles.driver')}
          hint={t('signIn.driverHint')}
          accent={colors.ink}
          onPress={() => open('driver')}
        />
        <BigTile
          icon="monitor-dashboard"
          label={t('roles.enro')}
          hint={t('signIn.enroHint')}
          onPress={() => open('enro')}
        />
      </View>
      <AppText variant="label" color={colors.textMuted} style={styles.center}>
        {t('signIn.residentNote')}
      </AppText>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  tiles: { gap: spacing.md },
  center: { textAlign: 'center' },
});
