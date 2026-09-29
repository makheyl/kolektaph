import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SmsBubble } from '@/components/ui/SmsBubble';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { TextField } from '@/components/ui/TextField';
import { barangayLabel } from '@/features/resident/format';
import { useBarangays } from '@/features/tracking/hooks';
import { maskPhMobile, normalizePhMobile } from '@/lib/phone';
import { useSettings } from '@/stores/settings';
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
  const { barangayId, setSms, completeOnboarding, setRole } = useSettings();
  const { data: barangays } = useBarangays();
  const barangay = barangays?.features.find((f) => f.properties.id === barangayId);

  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [mobileInput, setMobileInput] = useState('');
  const [consent, setConsent] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  const verify = () => {
    if (phase.kind !== 'otp' || !barangayId) return;
    if (otpInput.trim() !== phase.code) return setError(t('onboarding.sms.otpInvalid'));
    setSms({ mobile: phase.mobile, barangayId, optedInAt: Date.now() });
    finish();
  };

  const header = (
    <>
      {fromSettings ? null : <StepIndicator current={3} total={3} />}
      <AppHeader
        title={phase.kind === 'otp' ? t('onboarding.sms.otpTitle') : t('onboarding.sms.title')}
        leading={
          <IconButton icon="arrow-left" label={t('common.back')} onPress={() => router.back()} />
        }
      />
    </>
  );

  if (!barangay) {
    return (
      <Screen>
        {header}
        <Card>
          <AppText>{t('resident.home.pickBody')}</AppText>
          <Button
            variant="secondary"
            icon="map-marker-outline"
            label={t('resident.home.pick')}
            onPress={() => router.back()}
          />
        </Card>
        <Button variant="primary" label={t('onboarding.sms.later')} onPress={finish} />
      </Screen>
    );
  }

  if (phase.kind === 'otp') {
    return (
      <Screen>
        {header}
        <AppText>{t('onboarding.sms.otpSubtitle', { mobile: maskPhMobile(phase.mobile) })}</AppText>
        <Card style={styles.demoNote}>
          <AppText variant="label">{t('onboarding.sms.otpDemo', { code: phase.code })}</AppText>
        </Card>
        <TextField
          label={t('onboarding.sms.otpLabel')}
          value={otpInput}
          onChangeText={(v) => setOtpInput(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          error={error}
        />
        <Button
          variant="success"
          icon="check"
          label={t('onboarding.sms.verify')}
          onPress={verify}
        />
        <Button
          variant="secondary"
          label={t('onboarding.sms.changeNumber')}
          onPress={() => {
            setError(null);
            setOtpInput('');
            setPhase({ kind: 'form' });
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <AppText color={colors.textMuted}>{t('onboarding.sms.subtitle')}</AppText>
      <View style={styles.preview}>
        <AppText variant="label">{t('onboarding.sms.previewLabel')}</AppText>
        <SmsBubble text={t('onboarding.sms.preview', { barangay: barangay.properties.name })} />
      </View>
      <TextField
        label={t('onboarding.sms.mobileLabel')}
        hint={t('onboarding.sms.mobileHint')}
        icon="cellphone"
        value={mobileInput}
        onChangeText={setMobileInput}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={error}
      />
      <Checkbox checked={consent} onChange={setConsent} label={t('onboarding.sms.consent')} />
      <Button
        variant="success"
        icon="message-text"
        label={t('onboarding.sms.send')}
        onPress={sendCode}
      />
      <Button variant="secondary" label={t('onboarding.sms.later')} onPress={finish} />
      <AppText variant="caption" color={colors.textMuted}>
        {barangayLabel(barangay.properties)}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { gap: spacing.sm },
  demoNote: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
});
