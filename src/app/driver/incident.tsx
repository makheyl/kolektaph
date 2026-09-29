import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import type { IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { DriverTile } from '@/features/driver/components/DriverTile';
import { goBack } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import type { IncidentKind } from '@/services/types';
import { useDriver, useDriverLive } from '@/stores/driver';
import { colors, spacing } from '@/theme/tokens';

const KINDS: { kind: IncidentKind; icon: IconName }[] = [
  { kind: 'breakdown', icon: 'car-wrench' },
  { kind: 'flat_tire', icon: 'tire' },
  { kind: 'flood', icon: 'home-flood' },
  { kind: 'road_blocked', icon: 'sign-caution' },
];
const DURATIONS = [30, 60, 120, 240];

/**
 * Aberya: what happened and roughly how long. The affected barangays get a delay SMS with the
 * new estimated time; the City ENRO sees it on Live Operations.
 */
export default function DriverIncident() {
  const { t } = useTranslation();
  const shift = useDriver((s) => s.shift);
  const report = useDriver((s) => s.report);
  const truck = useDriverLive((s) => s.truck);
  const [kind, setKind] = useState<IncidentKind | null>(null);
  const [minutes, setMinutes] = useState(60);

  if (!shift || shift.endedAt != null) return <Redirect href="/driver" />;
  const back = () => goBack('/driver/shift');

  return (
    <Screen>
      <AppHeader
        title={t('driver.incident.title')}
        leading={<IconButton icon="arrow-left" label={t('common.back')} onPress={back} />}
      />

      {truck?.status === 'breakdown' && truck.incident ? (
        <Card style={styles.active} accessibilityLiveRegion="polite">
          <AppText variant="heading" color={colors.red}>
            {t('driver.incident.active', { incident: t(`incident.${truck.incident.kind}`) })}
          </AppText>
          <AppText>
            {t('driver.incident.activeUntil', { time: formatClock(truck.incident.until) })}
          </AppText>
          <Button
            size="driver"
            variant="success"
            icon="check-circle"
            label={t('driver.shift.incidentResolved')}
            onPress={() => {
              report({ kind: 'incident_end' });
              back();
            }}
          />
        </Card>
      ) : null}

      <Section title={t('driver.incident.what')}>
        <View style={styles.tiles}>
          {KINDS.slice(0, 2).map((k) => (
            <DriverTile
              key={k.kind}
              icon={k.icon}
              label={t(`incident.${k.kind}`)}
              selected={kind === k.kind}
              tone={colors.red}
              onPress={() => setKind(k.kind)}
            />
          ))}
        </View>
        <View style={styles.tiles}>
          {KINDS.slice(2).map((k) => (
            <DriverTile
              key={k.kind}
              icon={k.icon}
              label={t(`incident.${k.kind}`)}
              selected={kind === k.kind}
              tone={colors.red}
              onPress={() => setKind(k.kind)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('driver.incident.howLong')}>
        <View style={styles.chips}>
          {DURATIONS.map((m) => (
            <Chip
              key={m}
              label={t(`driver.incident.minutes.${m}`)}
              selected={minutes === m}
              onPress={() => setMinutes(m)}
            />
          ))}
        </View>
      </Section>

      <AppText color={colors.textMuted}>{t('driver.incident.willText')}</AppText>
      <Button
        size="driver"
        variant="danger"
        icon="alert"
        label={t('driver.incident.send')}
        disabled={!kind}
        onPress={() => {
          if (!kind) return;
          report({ kind: 'incident', incident: kind, minutes });
          back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  active: { backgroundColor: colors.redSoft, borderColor: colors.red },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
