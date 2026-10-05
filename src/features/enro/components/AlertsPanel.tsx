import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useStaffRights } from '@/features/admin/hooks';
import { formatClock } from '@/lib/time';
import { services } from '@/services';
import type { BackupSuggestion, OpsSnapshot, SuggestionDecision, Truck } from '@/services/types';
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
  const rights = useStaffRights();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const truckName = (id: string) => trucks.find((tr) => tr.id === id)?.name ?? id;
  const decide = async (sg: BackupSuggestion, decision: SuggestionDecision) => {
    setBusy(sg.id);
    setFailed(null);
    try {
      await services.ops.decideSuggestion(sg, decision);
    } catch {
      setFailed(sg.id);
    } finally {
      setBusy(null);
    }
  };

  const fullWithoutSuggestion = ops.states.filter(
    (s) => s.status === 'full' && !ops.suggestions.some((sg) => sg.fullTruckId === s.truckId),
  );
  const breakdowns = ops.states.filter((s) => s.status === 'breakdown' && s.incident);
  const empty = !ops.suggestions.length && !fullWithoutSuggestion.length && !breakdowns.length;

  return (
    <Panel title={t('enro.live.alertsTitle')}>
      {empty ? <AppText color={colors.textMuted}>{t('enro.live.noAlerts')}</AppText> : null}

      {ops.suggestions.map((sg) => {
        const decision = ops.decisions[sg.id];
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
            ) : rights.act ? (
              <View style={styles.actions}>
                <View style={styles.flex}>
                  <Button
                    variant="success"
                    icon="truck-fast"
                    label={t('enro.live.dispatch')}
                    disabled={busy === sg.id}
                    onPress={() => void decide(sg, 'dispatched')}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    variant="secondary"
                    label={t('enro.live.dismiss')}
                    disabled={busy === sg.id}
                    onPress={() => void decide(sg, 'dismissed')}
                  />
                </View>
              </View>
            ) : null}
            {failed === sg.id ? (
              <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
                {t('enro.notSaved')}
              </AppText>
            ) : null}
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
