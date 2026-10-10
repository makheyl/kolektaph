import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { LoadBar } from '@/components/ui/LoadBar';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatClock } from '@/lib/time';
import type { Truck, TruckState } from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

import { Panel } from './Panel';

interface LoadPanelProps {
  states: TruckState[];
  trucks: Truck[];
  nameOf: (barangayId: string) => string;
  selectedTruckId: string | null;
  onSelect: (truckId: string) => void;
}

/** "Truck load now" (pitch slide 14): every truck's status, place and load. */
export function LoadPanel({ states, trucks, nameOf, selectedTruckId, onSelect }: LoadPanelProps) {
  const { t } = useTranslation();
  return (
    <Panel title={t('enro.live.loadTitle')}>
      {states.map((s) => {
        const truck = trucks.find((tr) => tr.id === s.truckId);
        const offDuty = s.status === 'off_duty';
        const selected = s.truckId === selectedTruckId;
        return (
          <Pressable
            key={s.truckId}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: offDuty }}
            disabled={offDuty}
            onPress={() => onSelect(s.truckId)}
            style={[styles.row, selected && styles.selected]}
          >
            <View style={styles.head}>
              <AppText variant="bodyStrong" style={styles.name}>
                {truck?.name}
              </AppText>
              <StatusPill status={s.status} />
            </View>
            {offDuty ? (
              <AppText variant="label" color={colors.textMuted}>
                {t('enro.live.offDuty')}
              </AppText>
            ) : (
              <>
                {s.barangayId ? (
                  <AppText variant="label" color={colors.textMuted}>
                    {t('truck.location', {
                      street: s.streetName ?? t('enro.live.unnamed'),
                      barangay: nameOf(s.barangayId),
                    })}
                  </AppText>
                ) : null}
                <LoadBar value={s.load} />
                {s.loadReportedAt != null ? (
                  <AppText variant="caption" color={colors.textMuted}>
                    {t('enro.live.loadReported', { time: formatClock(s.loadReportedAt) })}
                  </AppText>
                ) : null}
              </>
            )}
          </Pressable>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.mintSoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { flex: 1 },
});
