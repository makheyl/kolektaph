import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { useAccount, useTransferOffer } from '@/features/account/hooks';
import { TransferOffer } from '@/features/account/components/TransferOffer';
import { barangayLabel } from '@/features/resident/format';
import { useBarangays } from '@/features/tracking/hooks';
import { maskPhMobile } from '@/lib/phone';
import { services } from '@/services';
import { useDemo } from '@/stores/demo';
import { useMyReports } from '@/stores/myReports';
import { useSettings } from '@/stores/settings';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

/**
 * The Profile tab. A resident needs no account: without one, "who you are" is a barangay and,
 * if they chose it, a number for text alerts. With one, it is their name. The rows lead to
 * everything the app keeps about them.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const barangayId = useSettings((s) => s.barangayId);
  const sms = useSettings((s) => s.sms);
  const { data: barangays } = useBarangays();
  const demoMode = useDemo((s) => s.demoMode);
  const myCount = useMyReports((s) => s.ticketIds.length + s.pending.length);
  const account = useAccount();
  const transfer = useTransferOffer();
  const registered = account.status === 'registered' ? account.profile : null;
  const props = barangays?.features.find((f) => f.properties.id === barangayId)?.properties;
  const place = props ? barangayLabel(props) : t('resident.home.pickTitle');

  return (
    <Screen tone="mint" header={<AppHeader title={t('resident.profile.title')} />}>
      <View style={styles.who}>
        <View style={styles.avatar} aria-hidden>
          <Icon name="account" size={64} color={colors.textOnDark} />
        </View>
        <AppText variant="title" color={colors.primary} style={styles.center}>
          {registered ? registered.fullName : place}
        </AppText>
        <AppText variant="label" color={colors.ink} style={styles.center}>
          {registered ? place : t('resident.profile.guest')}
        </AppText>
      </View>

      {transfer ? <TransferOffer offer={transfer} /> : null}

      {services.features.accounts && !registered ? (
        <Card>
          <AppText variant="bodyStrong">{t('account.invite.title')}</AppText>
          <AppText variant="label" color={colors.textMuted}>
            {t('account.invite.body')}
          </AppText>
          <View style={styles.invite}>
            <View style={styles.inviteAction}>
              <Button
                size="compact"
                icon="account-plus"
                label={t('account.invite.register')}
                onPress={() => router.push('/account/register')}
              />
            </View>
            <View style={styles.inviteAction}>
              <Button
                variant="secondary"
                size="compact"
                icon="login"
                label={t('account.invite.logIn')}
                onPress={() => router.push('/account/login')}
              />
            </View>
          </View>
        </Card>
      ) : null}

      <View style={styles.links}>
        <ListRow
          variant="card"
          icon="account-cog"
          title={t('resident.account.title')}
          subtitle={t('resident.account.hint')}
          onPress={() => router.push('/resident/account')}
        />
        <ListRow
          variant="card"
          icon="bell"
          title={t('resident.account.notifications')}
          subtitle={
            sms
              ? t('resident.settings.smsOn', { mobile: maskPhMobile(sms.mobile) })
              : t('resident.account.smsOffShort')
          }
          onPress={() => router.push('/resident/account/notifications')}
        />
        <ListRow
          variant="card"
          icon="clipboard-list-outline"
          title={t('reports.mine.linkFromHome')}
          subtitle={myCount ? t('reports.mine.count', { count: myCount }) : undefined}
          onPress={() => router.push('/resident/reports')}
        />
        {services.features.hauling ? (
          <ListRow
            variant="card"
            icon="truck"
            title={t('hauling.bookings')}
            subtitle={t('hauling.bookingsHint')}
            onPress={() => router.push('/resident/reports')}
          />
        ) : null}
        {services.features.rewards ? (
          <ListRow
            variant="card"
            icon="gift"
            title={t('rewards.title')}
            onPress={() => router.push('/resident/rewards')}
          />
        ) : null}
        <ListRow
          variant="card"
          icon="help-circle"
          title={t('resident.account.help')}
          onPress={() => router.push('/resident/account/help')}
        />
        <ListRow
          variant="card"
          icon="shield-account-outline"
          title={t('resident.profile.staff')}
          subtitle={t('resident.profile.staffHint')}
          onPress={() => router.push('/sign-in')}
        />
        {demoMode ? (
          <ListRow
            variant="card"
            icon="swap-horizontal"
            title={t('resident.settings.switchRole')}
            onPress={() => router.replace('/demo')}
          />
        ) : null}
      </View>

      {registered ? (
        <View style={styles.logOut}>
          <Button
            variant="danger"
            icon="logout"
            label={t('account.logOut')}
            onPress={() => void services.account.logOut()}
          />
        </View>
      ) : null}

      <AppText variant="caption" color={colors.ink} style={styles.center}>
        {t('app.name')} · {t('common.sampleDataHint')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.raised,
  },
  center: { textAlign: 'center' },
  links: { gap: spacing.md },
  invite: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inviteAction: { flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0 },
  logOut: { alignSelf: 'center', minWidth: 200, maxWidth: '100%' },
});
