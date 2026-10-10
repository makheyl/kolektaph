import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useBarangays } from '@/features/tracking/hooks';
import { colors, spacing } from '@/theme/tokens';

import { barangayLabel } from '../format';
import { useLocateBarangay } from '../useLocateBarangay';

interface BarangayPickerProps {
  selectedId: string | null;
  onSelect: (barangayId: string) => void;
  /** Offer "use my location" (not needed when browsing other barangays' schedules). */
  allowLocate?: boolean;
}

/** Search + list of Carmona's 14 barangays, with optional "Gamitin ang lokasyon ko". */
export function BarangayPicker({ selectedId, onSelect, allowLocate = true }: BarangayPickerProps) {
  const { t } = useTranslation();
  const { data: barangays } = useBarangays();
  const [query, setQuery] = useState('');
  const { state, locate } = useLocateBarangay(barangays);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (barangays?.features ?? [])
      .map((f) => ({
        id: f.properties.id,
        label: barangayLabel(f.properties),
        alt: f.properties.altNames,
      }))
      .filter(
        (o) =>
          !q || o.label.toLowerCase().includes(q) || o.alt.some((a) => a.toLowerCase().includes(q)),
      );
  }, [barangays, query]);

  const locateMessage =
    state.kind === 'outside'
      ? t('onboarding.barangay.outside')
      : state.kind === 'denied'
        ? t('onboarding.barangay.denied')
        : state.kind === 'error'
          ? t('onboarding.barangay.error')
          : null;

  return (
    <View style={styles.wrap}>
      {allowLocate ? (
        <Card variant="mint">
          {state.kind === 'found' ? (
            <>
              <View style={styles.row}>
                <Icon name="map-marker-check" size={28} color={colors.ink} />
                <AppText variant="bodyStrong" accessibilityLiveRegion="polite" style={styles.flex}>
                  {t('onboarding.barangay.found', {
                    barangay: barangayLabel(state.barangay.properties),
                  })}
                </AppText>
              </View>
              <Button
                icon="check"
                label={t('onboarding.barangay.confirm')}
                onPress={() => onSelect(state.barangay.properties.id)}
              />
            </>
          ) : (
            <>
              <Button
                icon="crosshairs-gps"
                label={
                  state.kind === 'locating'
                    ? t('onboarding.barangay.locating')
                    : t('onboarding.barangay.useLocation')
                }
                loading={state.kind === 'locating'}
                onPress={locate}
              />
              <AppText
                variant="label"
                color={colors.textMuted}
                accessibilityLiveRegion={locateMessage ? 'polite' : 'none'}
              >
                {locateMessage ?? t('onboarding.barangay.locationWhy')}
              </AppText>
            </>
          )}
        </Card>
      ) : null}

      <TextField
        label={t('onboarding.barangay.search')}
        icon="magnify"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {barangays ? (
        <Card style={styles.list}>
          <View role="list">
            {options.map((o) => (
              <View key={o.id} role="listitem">
                <ListRow
                  title={o.label}
                  icon="map-marker-outline"
                  selected={o.id === selectedId}
                  trailing="check"
                  onPress={() => onSelect(o.id)}
                />
              </View>
            ))}
          </View>
          {options.length === 0 ? (
            <AppText color={colors.textMuted} style={styles.empty}>
              {t('onboarding.barangay.noResults', { query })}
            </AppText>
          ) : null}
        </Card>
      ) : (
        <SkeletonGroup>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={44} />
          ))}
        </SkeletonGroup>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  list: { padding: spacing.sm, gap: 0 },
  empty: { padding: spacing.md },
});
