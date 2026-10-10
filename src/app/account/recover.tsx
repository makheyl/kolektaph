import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PhFlag } from '@/components/brand/Brand';
import { AuthShell } from '@/components/layout/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { cleanCode, MIN_PASSWORD } from '@/features/account/rules';
import { maskPhMobile, normalizePhMobile } from '@/lib/phone';
import { OfflineError, ServerError, services } from '@/services';
import { colors } from '@/theme/tokens';

type Step = 'mobile' | 'code' | 'done';

/**
 * Forgot password: the account's number, a one-time code, then a new password. On the sample
 * data no text is sent and the code is shown on screen.
 */
export default function AccountRecovery() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [sampleCode, setSampleCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!services.features.accounts) return <Redirect href="/welcome" />;

  const e164 = normalizePhMobile(mobile);
  const fail = (e: unknown, fallback: string) =>
    setError(t(e instanceof OfflineError ? 'account.offline' : fallback));

  const sendCode = async () => {
    if (busy) return;
    if (!e164) return setError(t('account.errors.mobile'));
    setBusy(true);
    setError(null);
    try {
      setSampleCode((await services.account.requestRecovery(e164)).sampleCode);
      setCode('');
      setStep('code');
    } catch (e) {
      fail(
        e,
        e instanceof ServerError && e.code === 'unknown_account'
          ? 'account.recover.unknown'
          : 'account.errors.other',
      );
    } finally {
      setBusy(false);
    }
  };

  const setNew = async () => {
    if (busy || !e164) return;
    if (code.length < 6) return setError(t('account.recover.codeMissing'));
    if (password.length < MIN_PASSWORD) {
      return setError(t('account.errors.password', { count: MIN_PASSWORD }));
    }
    setBusy(true);
    setError(null);
    try {
      await services.account.confirmRecovery(e164, code, password);
      setPassword('');
      setStep('done');
    } catch (e) {
      fail(
        e,
        e instanceof ServerError && e.code === 'wrong_code'
          ? 'account.recover.wrongCode'
          : 'account.errors.other',
      );
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done') {
    return (
      <AuthShell brand="kolek" title={t('account.recover.doneTitle')}>
        <Notice tone="success" text={t('account.recover.doneBody')} />
        <Button
          icon="login"
          label={t('account.login.submit')}
          onPress={() => router.replace('/account/login')}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      back="/account/login"
      brand="kolek"
      title={t(step === 'mobile' ? 'account.recover.title' : 'account.recover.codeTitle')}
      subtitle={
        step === 'mobile'
          ? t('account.recover.body')
          : t('account.recover.codeBody', { mobile: e164 ? maskPhMobile(e164) : '' })
      }
    >
      {step === 'mobile' ? (
        <>
          <TextField
            label={t('account.mobile')}
            hint={t('account.mobileHint')}
            prefix={<PhFlag />}
            value={mobile}
            onChangeText={(v) => {
              setMobile(v);
              setError(null);
            }}
            error={error}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            onSubmitEditing={() => void sendCode()}
          />
          <Button
            icon="message-text"
            label={t('account.recover.send')}
            loading={busy}
            onPress={() => void sendCode()}
          />
        </>
      ) : (
        <>
          {sampleCode ? (
            <Notice tone="warning">
              <AppText>{t('account.recover.sampleCode')}</AppText>
              <AppText variant="title" selectable>
                {sampleCode}
              </AppText>
            </Notice>
          ) : null}
          <TextField
            label={t('account.recover.code')}
            value={code}
            onChangeText={(v) => {
              setCode(cleanCode(v));
              setError(null);
            }}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <TextField
            label={t('account.recover.newPassword')}
            hint={t('account.passwordHint', { count: MIN_PASSWORD })}
            icon="key"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            error={error}
            secureTextEntry
            revealable
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={() => void setNew()}
          />
          <Button
            icon="check"
            label={t('account.recover.save')}
            loading={busy}
            onPress={() => void setNew()}
          />
          <Button
            variant="ghost"
            label={t('account.recover.resend')}
            onPress={() => void sendCode()}
          />
          <AppText variant="label" color={colors.textMuted} style={{ textAlign: 'center' }}>
            {t('account.recover.wait')}
          </AppText>
        </>
      )}
    </AuthShell>
  );
}
