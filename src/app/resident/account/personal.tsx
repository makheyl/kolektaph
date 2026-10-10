import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAccount } from '@/features/account/hooks';
import { goBack } from '@/lib/navigation';
import { maskPhMobile } from '@/lib/phone';
import { OfflineError, services } from '@/services';
import type { ResidentProfile } from '@/services/types';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Personal information of a registered resident: name, email and the part of the barangay. */
export default function PersonalInformation() {
  const account = useAccount();
  if (account.status !== 'registered') return <Redirect href="/resident/settings" />;
  // Keyed by the number: logging in to another account starts the form afresh.
  return <PersonalForm key={account.profile.mobile} profile={account.profile} />;
}

function PersonalForm({ profile }: { profile: ResidentProfile }) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(profile.fullName);
  const [email, setEmail] = useState(profile.email ?? '');
  const [area, setArea] = useState(profile.area);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'saved' | 'offline' | 'other' | null>(null);

  const nameProblem = fullName.trim().length < 2 ? t('account.errors.name') : null;
  const emailProblem = email.trim() && !EMAIL.test(email.trim()) ? t('account.errors.email') : null;

  const save = async () => {
    setTried(true);
    setResult(null);
    if (busy || nameProblem || emailProblem) return;
    setBusy(true);
    try {
      await services.account.saveProfile({
        ...profile,
        fullName: fullName.trim(),
        email: email.trim() || null,
        area: area.trim(),
      });
      setResult('saved');
    } catch (e) {
      setResult(e instanceof OfflineError ? 'offline' : 'other');
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
          title={t('account.personal.title')}
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
      footer={
        <>
          {result ? (
            <AppText
              variant="label"
              color={result === 'saved' ? colors.primary : colors.red}
              accessibilityLiveRegion="polite"
            >
              {t(
                result === 'saved'
                  ? 'account.personal.saved'
                  : result === 'offline'
                    ? 'account.offline'
                    : 'account.errors.other',
              )}
            </AppText>
          ) : null}
          <Button
            icon="content-save"
            label={t('account.personal.save')}
            loading={busy}
            onPress={() => void save()}
          />
        </>
      }
    >
      <View style={styles.who} aria-hidden>
        <View style={styles.avatar}>
          <Icon name="account" size={56} color={colors.textOnDark} />
        </View>
      </View>
      <TextField
        label={t('account.fullName')}
        value={fullName}
        onChangeText={setFullName}
        error={tried ? nameProblem : null}
        autoCapitalize="words"
        autoComplete="name"
      />
      <TextField
        label={t('account.mobile')}
        hint={t('account.personal.mobileFixed')}
        value={maskPhMobile(profile.mobile)}
        editable={false}
      />
      <TextField
        label={t('account.email')}
        hint={t('account.emailHint')}
        value={email}
        onChangeText={setEmail}
        error={tried ? emailProblem : null}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
      />
      <TextField
        label={t('account.area')}
        placeholder={t('account.areaHint')}
        value={area}
        onChangeText={setArea}
        autoComplete="street-address"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { alignItems: 'center' },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.raised,
  },
});
