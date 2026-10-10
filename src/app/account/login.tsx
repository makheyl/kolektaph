import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PhFlag } from '@/components/brand/Brand';
import { AuthShell } from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { normalizePhMobile } from '@/lib/phone';
import { OfflineError, services } from '@/services';
import { useSettings } from '@/stores/settings';

/**
 * Resident log in: mobile number and password. An account is optional; the app works without
 * one. The password goes straight to the sign-in service and is never kept by the app.
 */
export default function ResidentLogin() {
  const { t } = useTranslation();
  const onboarded = useSettings((s) => s.onboarded);
  const setRole = useSettings((s) => s.setRole);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!services.features.accounts) return <Redirect href="/welcome" />;

  const submit = async () => {
    if (busy) return;
    const e164 = normalizePhMobile(mobile);
    if (!e164 || !password) return setError(t('account.login.missing'));
    setBusy(true);
    setError(null);
    try {
      await services.account.logIn(e164, password);
      setPassword('');
      setRole('resident');
      // A device that has not been set up yet still chooses its language and barangay first.
      router.replace(onboarded ? '/resident' : '/onboarding/language');
    } catch (e) {
      setError(t(e instanceof OfflineError ? 'account.offline' : 'account.login.wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      back="/welcome"
      brand="kolek"
      title={t('account.login.title')}
      subtitle={t('account.login.body')}
    >
      <Notice tone="warning" text={t('account.sampleNotice')} />
      <TextField
        label={t('account.mobile')}
        hint={t('account.mobileHint')}
        prefix={<PhFlag />}
        value={mobile}
        onChangeText={(v) => {
          setMobile(v);
          setError(null);
        }}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <TextField
        label={t('account.password')}
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
        icon="login"
        label={t('account.login.submit')}
        loading={busy}
        onPress={() => void submit()}
      />
      <Button
        variant="ghost"
        label={t('account.login.forgot')}
        onPress={() => router.push('/account/recover')}
      />
      <Button
        variant="secondary"
        icon="account-plus"
        label={t('account.login.toRegister')}
        onPress={() => router.push('/account/register')}
      />
    </AuthShell>
  );
}
