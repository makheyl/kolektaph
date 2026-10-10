import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAccount } from '@/features/account/hooks';
import { MIN_PASSWORD } from '@/features/account/rules';
import { goBack } from '@/lib/navigation';
import { OfflineError, ServerError, services } from '@/services';
import { colors } from '@/theme/tokens';

/** Sign-in and security of a registered resident: changing the password. */
export default function SignInAndSecurity() {
  const { t } = useTranslation();
  const account = useAccount();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (account.status !== 'registered') return <Redirect href="/resident/settings" />;

  const change = async () => {
    if (busy) return;
    const problem = !current
      ? t('account.security.currentMissing')
      : next.length < MIN_PASSWORD
        ? t('account.errors.password', { count: MIN_PASSWORD })
        : again !== next
          ? t('account.errors.again')
          : null;
    if (problem) return setResult({ ok: false, text: problem });
    setBusy(true);
    setResult(null);
    try {
      await services.account.changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setResult({ ok: true, text: t('account.security.changed') });
    } catch (e) {
      setResult({
        ok: false,
        text: t(
          e instanceof OfflineError
            ? 'account.offline'
            : e instanceof ServerError && e.code === 'invalid_credentials'
              ? 'account.security.wrongCurrent'
              : 'account.errors.other',
        ),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      tone="mint"
      header={
        <AppHeader
          tone="green"
          title={t('account.security.title')}
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
      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('account.security.change')}
        </AppText>
        <TextField
          label={t('account.security.current')}
          icon="key"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
        />
        <TextField
          label={t('account.recover.newPassword')}
          hint={t('account.passwordHint', { count: MIN_PASSWORD })}
          icon="key"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label={t('account.passwordAgain')}
          icon="key"
          value={again}
          onChangeText={setAgain}
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {result ? (
          <AppText
            variant="label"
            color={result.ok ? colors.primary : colors.red}
            accessibilityLiveRegion="polite"
          >
            {result.text}
          </AppText>
        ) : null}
        <Button
          icon="lock-reset"
          label={t('account.security.submit')}
          loading={busy}
          onPress={() => void change()}
        />
      </Card>
    </Screen>
  );
}
