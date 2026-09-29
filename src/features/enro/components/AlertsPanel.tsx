import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatClock } from '@/lib/time';
import type { OpsSnapshot, Truck } from '@/services/types';
import { useEnro } from '@/stores/enro';
import { colors, radius, spacing } from '@/theme/tokens';

import { formatDistance, percent } from '../format';
import { Panel } from './Panel';

interface AlertsPanelProps {
  ops: OpsSnapshot;
  trucks: Truck[];
  nameOf: (barangayId: string) => string;
}

/**
 * Operational alerts (pitch slide 14): full trucks with streets left, with a suggested backup
 * truck that staff can send or dismiss, and breakdowns. Suggestions never act on their own.
 */
export function AlertsPanel({ ops, trucks, nameOf }: AlertsPanelProps) {
  const { t } = useTranslation();
  const { decisions, decide } = useEnro();
  const truckName = (id: string) => trucks.find((tr) => tr.id === id)?.name ?? id;

  const fullWithoutSuggestion = ops.states.filter(
    (s) => s.status === 'full' && !ops.suggestions.some((sg) => sg.fullTruckId === s.truckId),
  );
  const breakdowns = ops.states.filter((s) => s.status === 'breakdown' && s.incident);
  const empty = !ops.suggestions.length && !fullWithoutSuggestion.length && !breakdowns.length;

  return (
    <Panel title={t('enro.live.alertsTitle')}>
      {empty ? <AppText color={colors.textMuted}>{t('enro.live.noAlerts')}</AppText> : null}

      {ops.suggestions.map((sg) => {
        const decision = decisions[sg.id];
        return (
          <View key={sg.id} style={styles.alert} accessibilityLiveRegion="polite">
            <View style={styles.titleRow}>
              <Icon name="truck-alert" size={22} color={colors.red} />
              <AppText variant="bodyStrong" style={styles.flex}>
                {t('enro.live.fullAlert', {
                  truck: truckName(sg.fullTruckId),
                  count: sg.streetsLeft,
                  barangay: nameOf(sg.barangayId),
                })}
              </AppText>
            </View>
            <AppText>
              {t('enro.live.suggestion', {
                truck: truckName(sg.candidateTruckId),
                load: percent(sg.candidateLoad),
                distance: formatDistance(t, sg.distanceM),
              })}
            </AppText>
            {decision ? (
              <AppText
                variant="label"
                color={decision.decision === 'dispatched' ? colors.green : colors.textMuted}
              >
                {decision.decision === 'dispatched'
                  ? t('enro.live.dispatched', {
                      truck: truckName(sg.candidateTruckId),
                      time: formatClock(decision.at),
                    })
                  : t('enro.live.dismissed', { time: formatClock(decision.at) })}
              </AppText>
            ) : (
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <Button
                    variant="success"
                    icon="truck-fast"
                    label={t('enro.live.dispatch')}
                    onPress={() => decide(sg.id, 'dispatched', ops.at)}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    variant="secondary"
                    label={t('enro.live.dismiss')}
                    onPress={() => decide(sg.id, 'dismissed', ops.at)}
                  />
                </View>
              </View>
            )}
            <AppText variant="caption" color={colors.textMuted}>
              {t('enro.live.humansDecide')}
            </AppText>
          </View>
        );
      })}

      {fullWithoutSuggestion.map((s) => (
        <View key={s.truckId} style={styles.alert}>
          <View style={styles.titleRow}>
            <Icon name="truck-alert" size={22} color={colors.red} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {t('truck.status.full')}: {truckName(s.truckId)}
            </AppText>
          </View>
          <AppText>{t('enro.live.noCandidate')}</AppText>
        </View>
      ))}

      {breakdowns.map((s) => (
        <View key={s.truckId} style={styles.alert}>
          <View style={styles.titleRow}>
            <Icon name="car-wrench" size={22} color={colors.red} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {t('enro.live.breakdownAlert', {
                truck: truckName(s.truckId),
                incident: t(`incident.${s.incident!.kind}`),
                time: formatClock(s.incident!.until),
              })}
            </AppText>
          </View>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  alert: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 120 },
});
