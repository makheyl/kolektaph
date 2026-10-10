import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthShell } from '@/components/layout/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { OfflineError, ServerError, services } from '@/services';
import { colors } from '@/theme/tokens';

/**
 * City ENRO sign-in. Accounts are made by the City's administrator; nobody registers here.
 * The password goes straight to the sign-in service and is never kept by the app.
 */
export function StaffSignIn({ checking }: { checking: boolean }) {
  const { t } = useTranslation();
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
    <AuthShell
      exit="/sign-in"
      brand="kolek"
      eyebrow={t('enro.brand')}
      title={t('enro.signIn.title')}
      subtitle={checking ? t('enro.signIn.checking') : t('enro.signIn.body')}
    >
      {checking ? (
        <SkeletonGroup>
          <Skeleton height={56} round={16} />
          <Skeleton height={56} round={16} />
          <Skeleton height={56} round={16} />
        </SkeletonGroup>
      ) : (
        <>
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
            revealable
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
            loading={busy}
            onPress={() => void submit()}
          />
          <AppText variant="label" color={colors.textMuted} style={{ textAlign: 'center' }}>
            {t('enro.signIn.help')}
          </AppText>
        </>
      )}
    </AuthShell>
  );
}
