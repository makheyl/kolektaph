import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { SmsBubble } from '@/components/ui/SmsBubble';
import { ALERT_META } from '@/features/alerts/alertMeta';
import { formatRelativeDay } from '@/features/resident/format';
import { useMyAlerts } from '@/features/resident/useMyAlerts';
import { useBarangays, useSimNow } from '@/features/tracking/hooks';
import { formatClock } from '@/lib/time';
import { goBack } from '@/lib/navigation';
import { useSettings } from '@/stores/settings';
import { colors, radius, spacing } from '@/theme/tokens';

/** "Mga abiso": an in-app copy of every alert sent to the resident's barangay. */
export default function AlertsScreen() {
  const { t } = useTranslation();
  const now = useSimNow(5000);
  const { barangayId, alerts, seenAt } = useMyAlerts();
  const sms = useSettings((s) => s.sms);
  const markAlertsSeen = useSettings((s) => s.markAlertsSeen);
  const { data: barangays } = useBarangays();
  const name = barangays?.features.find((f) => f.properties.id === barangayId)?.properties.name;

  // Remember what was unread when the screen opened, so "Bago" stays visible while reading.
  const [unreadSince] = useState(seenAt);
  const newest = alerts[0]?.sentAt ?? 0;
  useEffect(() => {
    if (newest) markAlertsSeen(newest);
  }, [newest, markAlertsSeen]);

  return (
    <Screen>
      <AppHeader
        title={t('resident.alerts.title')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/resident')}
          />
        }
      />
      <SampleDataBadge />
      {name ? (
        <AppText color={colors.textMuted}>
          {t('resident.alerts.subtitle', { barangay: name })}
        </AppText>
      ) : (
        <AppText color={colors.textMuted}>{t('resident.alerts.pickBarangay')}</AppText>
      )}

      {barangayId && alerts.length === 0 ? (
        <Card>
          <AppText color={colors.textMuted}>{t('resident.alerts.empty')}</AppText>
        </Card>
      ) : null}

      {alerts.map((a) => {
        const meta = ALERT_META[a.kind];
        const isNew = a.sentAt > unreadSince;
        return (
          <Card key={a.id} style={isNew ? styles.newCard : undefined}>
            <View style={styles.header}>
              <View style={[styles.icon, { backgroundColor: meta.soft }]}>
                <Icon name={meta.icon} size={22} color={meta.color} />
              </View>
              <View style={styles.headerText}>
                <AppText variant="bodyStrong">{t(`alert.kind.${a.kind}`)}</AppText>
                <AppText variant="label" color={colors.textMuted}>
                  {formatRelativeDay(t, a.sentAt, now)} · {formatClock(a.sentAt)}
                </AppText>
              </View>
              {isNew ? (
                <View style={styles.newPill}>
                  <AppText variant="caption" color={colors.textOnDark}>
                    {t('resident.alerts.new')}
                  </AppText>
                </View>
              ) : null}
            </View>
            <SmsBubble text={a.text} />
            <AppText variant="caption" color={colors.textMuted}>
              {sms ? t('resident.alerts.viaSms') : t('resident.alerts.smsOff')}
            </AppText>
          </Card>
        );
      })}

      {!sms && barangayId ? (
        <Button
          variant="success"
          icon="message-text"
          label={t('resident.settings.smsTurnOn')}
          onPress={() => router.push({ pathname: '/onboarding/sms', params: { from: 'settings' } })}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  newCard: { borderColor: colors.navy, borderWidth: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  newPill: {
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
