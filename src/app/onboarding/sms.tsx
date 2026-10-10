import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PhFlag } from '@/components/brand/Brand';
import { AuthShell } from '@/components/layout/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Notice } from '@/components/ui/Notice';
import { SmsBubble } from '@/components/ui/SmsBubble';
import { TextField } from '@/components/ui/TextField';
import { barangayLabel } from '@/features/resident/format';
import { useBarangays } from '@/features/tracking/hooks';
import { maskPhMobile, normalizePhMobile } from '@/lib/phone';
import { OfflineError, services } from '@/services';
import { smsKey, useSettings } from '@/stores/settings';
import { colors, spacing } from '@/theme/tokens';

type Phase = { kind: 'form' } | { kind: 'otp'; mobile: string; code: string };

/**
 * Step 3 of 3 (also reached from Settings with ?from=settings). SMS alerts reach residents
 * without smartphones or data. Explicit consent + OTP; the OTP is simulated in the prototype.
 */
export default function SmsStep() {
  const { t } = useTranslation();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const { barangayId, setSms, markSmsSynced, completeOnboarding, setRole } = useSettings();
  const { data: barangays } = useBarangays();
  const barangay = barangays?.features.find((f) => f.properties.id === barangayId);

  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [mobileInput, setMobileInput] = useState('');
  const [consent, setConsent] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    if (fromSettings) {
      router.back();
      return;
    }
    completeOnboarding();
    setRole('resident');
    router.replace('/resident');
  };

  const sendCode = () => {
    const mobile = normalizePhMobile(mobileInput);
    if (!mobile) return setError(t('onboarding.sms.mobileInvalid'));
    if (!consent) return setError(t('onboarding.sms.consentRequired'));
    setError(null);
    // Prototype: no SMS gateway yet, so the code is generated here and shown on screen.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setPhase({ kind: 'otp', mobile, code });
  };

  const verify = async () => {
    if (phase.kind !== 'otp' || !barangayId || busy) return;
    if (otpInput.trim() !== phase.code) return setError(t('onboarding.sms.otpInvalid'));
    const sms = { mobile: phase.mobile, barangayId, optedInAt: Date.now() };
    setBusy(true);
    setError(null);
    try {
      // The sign-up is confirmed with the server before the app says it is on.
      await services.resident.subscribeSms(sms.mobile, sms.barangayId);
      setSms(sms);
      markSmsSynced(smsKey(sms));
      finish();
    } catch (e) {
      setError(t(e instanceof OfflineError ? 'onboarding.sms.offline' : 'onboarding.sms.failed'));
    } finally {
      setBusy(false);
    }
  };

  const back: Href = fromSettings ? '/resident/settings' : '/onboarding/barangay';
  const shell = { back, step: fromSettings ? undefined : { current: 3, total: 3 } };

  if (!barangay) {
    return (
      <AuthShell
        {...shell}
        title={t('onboarding.sms.title')}
        footer={
          <>
            <Button
              icon="map-marker-outline"
              label={t('resident.home.pick')}
              onPress={() => router.back()}
            />
            <Button variant="ghost" label={t('onboarding.sms.later')} onPress={finish} />
          </>
        }
      >
        <Notice icon="map-marker-outline" text={t('resident.home.pickBody')} />
      </AuthShell>
    );
  }

  if (phase.kind === 'otp') {
    return (
      <AuthShell
        {...shell}
        title={t('onboarding.sms.otpTitle')}
        subtitle={t('onboarding.sms.otpSubtitle', { mobile: maskPhMobile(phase.mobile) })}
        footer={
          <>
            <Button
              icon="check"
              label={t('onboarding.sms.verify')}
              loading={busy}
              onPress={() => void verify()}
            />
            <Button
              variant="ghost"
              label={t('onboarding.sms.changeNumber')}
              onPress={() => {
                setError(null);
                setOtpInput('');
                setPhase({ kind: 'form' });
              }}
            />
          </>
        }
      >
        <Notice tone="warning" icon="flask-outline">
          <AppText variant="bodyStrong">
            {t('onboarding.sms.otpDemo', { code: phase.code })}
          </AppText>
        </Notice>
        <TextField
          label={t('onboarding.sms.otpLabel')}
          value={otpInput}
          onChangeText={(v) => setOtpInput(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          error={error}
          onSubmitEditing={() => void verify()}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      {...shell}
      title={t('onboarding.sms.title')}
      subtitle={t('onboarding.sms.subtitle')}
      footer={
        <>
          <Button icon="message-text" label={t('onboarding.sms.send')} onPress={sendCode} />
          <Button variant="ghost" label={t('onboarding.sms.later')} onPress={finish} />
        </>
      }
    >
      <View style={styles.preview}>
        <AppText variant="label">{t('onboarding.sms.previewLabel')}</AppText>
        <SmsBubble text={t('onboarding.sms.preview', { barangay: barangay.properties.name })} />
      </View>
      <TextField
        label={t('onboarding.sms.mobileLabel')}
        hint={t('onboarding.sms.mobileHint')}
        prefix={<PhFlag />}
        value={mobileInput}
        onChangeText={setMobileInput}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={error}
      />
      <Checkbox checked={consent} onChange={setConsent} label={t('onboarding.sms.consent')} />
      <AppText variant="caption" color={colors.textMuted}>
        {barangayLabel(barangay.properties)}
      </AppText>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  preview: { gap: spacing.sm },
});
