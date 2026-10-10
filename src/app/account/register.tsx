import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { PhFlag } from '@/components/brand/Brand';
import { AuthShell } from '@/components/layout/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ListRow } from '@/components/ui/ListRow';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { MIN_PASSWORD } from '@/features/account/rules';
import { barangayLabel } from '@/features/resident/format';
import { useBarangays } from '@/features/tracking/hooks';
import { normalizePhMobile } from '@/lib/phone';
import { OfflineError, ServerError, services } from '@/services';
import { useSettings } from '@/stores/settings';
import { colors } from '@/theme/tokens';

type Field = 'name' | 'mobile' | 'email' | 'password' | 'again' | 'consent';

/** An email address, if the resident gives one (it is optional). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create an account. It is optional: registering turns this device's own identity into an
 * account, so the reports, points and bookings it already has stay with it.
 */
export default function ResidentRegister() {
  const { t } = useTranslation();
  const barangayId = useSettings((s) => s.barangayId);
  const onboarded = useSettings((s) => s.onboarded);
  const smsMobile = useSettings((s) => s.sms?.mobile ?? null);
  const setRole = useSettings((s) => s.setRole);
  const { data: barangays } = useBarangays();
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState(smsMobile ? `0${smsMobile.slice(3)}` : '');
  const [area, setArea] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (!services.features.accounts) return <Redirect href="/welcome" />;

  const home = barangays?.features.find((f) => f.properties.id === barangayId)?.properties;
  const e164 = normalizePhMobile(mobile);
  const problems: Partial<Record<Field, string>> = {
    ...(fullName.trim().length < 2 ? { name: t('account.errors.name') } : {}),
    ...(e164 ? {} : { mobile: t('account.errors.mobile') }),
    ...(!email.trim() || EMAIL.test(email.trim()) ? {} : { email: t('account.errors.email') }),
    ...(password.length < MIN_PASSWORD
      ? { password: t('account.errors.password', { count: MIN_PASSWORD }) }
      : {}),
    ...(again !== password ? { again: t('account.errors.again') } : {}),
    ...(consent ? {} : { consent: t('account.errors.consent') }),
  };
  const shown = tried ? problems : {};

  const submit = async () => {
    setTried(true);
    setFailed(null);
    if (busy || Object.keys(problems).length || !e164) return;
    setBusy(true);
    try {
      await services.account.register({
        fullName: fullName.trim(),
        mobile: e164,
        password,
        barangayId,
        area: area.trim(),
        email: email.trim() || null,
      });
      setPassword('');
      setAgain('');
      setRole('resident');
      router.replace(onboarded ? '/resident/settings' : '/onboarding/language');
    } catch (e) {
      setFailed(
        t(
          e instanceof OfflineError
            ? 'account.offline'
            : e instanceof ServerError && e.code === 'mobile_taken'
              ? 'account.errors.taken'
              : 'account.errors.other',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      back="/welcome"
      title={t('account.register.title')}
      subtitle={t('account.register.body')}
      footer={
        <>
          {failed ? (
            <AppText variant="label" color={colors.red} accessibilityLiveRegion="assertive">
              {failed}
            </AppText>
          ) : null}
          <Button
            icon="account-plus"
            label={t('account.register.submit')}
            loading={busy}
            onPress={() => void submit()}
          />
          <Button
            variant="ghost"
            label={t('account.register.toLogin')}
            onPress={() => router.replace('/account/login')}
          />
        </>
      }
    >
      <Notice tone="warning" text={t('account.sampleNotice')} />
      <TextField
        label={t('account.fullName')}
        value={fullName}
        onChangeText={setFullName}
        error={shown.name}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label={t('account.mobile')}
        hint={t('account.mobileHint')}
        prefix={<PhFlag />}
        value={mobile}
        onChangeText={setMobile}
        error={shown.mobile}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      {home ? (
        <ListRow
          variant="card"
          icon="map-marker"
          title={barangayLabel(home)}
          subtitle={t('account.register.barangay')}
          trailing="none"
        />
      ) : null}
      <TextField
        label={t('account.area')}
        placeholder={t('account.areaHint')}
        value={area}
        onChangeText={setArea}
        autoComplete="street-address"
      />
      <TextField
        label={t('account.email')}
        hint={t('account.emailHint')}
        value={email}
        onChangeText={setEmail}
        error={shown.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label={t('account.password')}
        hint={t('account.passwordHint', { count: MIN_PASSWORD })}
        icon="key"
        value={password}
        onChangeText={setPassword}
        error={shown.password}
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
        error={shown.again}
        secureTextEntry
        revealable
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <View>
        <Checkbox checked={consent} onChange={setConsent} label={t('account.register.consent')} />
        {shown.consent ? (
          <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
            {shown.consent}
          </AppText>
        ) : null}
      </View>
      <Button
        variant="ghost"
        icon="shield-account-outline"
        label={t('resident.settings.privacy')}
        onPress={() => router.push('/privacy')}
      />
    </AuthShell>
  );
}
