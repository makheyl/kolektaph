import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { barangayAt, metresBetween } from '@/lib/geo';
import type { BarangayCollection, CityMeta, LngLat } from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

interface LocationPickerProps {
  barangays: BarangayCollection;
  meta: CityMeta;
  /** Where the map starts when there is no GPS fix (e.g. the resident's barangay). */
  fallback: LngLat;
  value: LngLat | null;
  onChange: (point: LngLat, accuracyM: number | null) => void;
  /** Ask for the phone's location as soon as the step opens (HAKOT SNAP-02). */
  autoLocate?: boolean;
}

type GpsState = 'idle' | 'locating' | 'denied';

/** One GPS reading (permission asked first); 'denied' if there is none. */
async function readFix(): Promise<
  { point: LngLat; accuracy: number | null; at: number } | 'denied'
> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return 'denied';
    // No Google "Location Accuracy" prompt: declining it would fail the reading, and the phone's
    // own GPS is enough for a pin.
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: false,
    });
    return {
      point: [pos.coords.longitude, pos.coords.latitude],
      accuracy: pos.coords.accuracy ?? null,
      at: pos.timestamp,
    };
  } catch {
    return 'denied';
  }
}

/**
 * "Pin in the middle": the resident moves the map until the fixed pin sits on the spot. Works
 * the same with a finger, a mouse or a screen reader (the GPS button), unlike dragging a pin.
 */
export function LocationPicker({
  barangays,
  meta,
  fallback,
  value,
  onChange,
  autoLocate = true,
}: LocationPickerProps) {
  const { t } = useTranslation();
  // Asking for the location as the step opens: start in "locating" rather than setting it in
  // an effect.
  const [gps, setGps] = useState<GpsState>(() => (autoLocate ? 'locating' : 'idle'));
  const [fix, setFix] = useState<{ point: LngLat; accuracy: number | null } | null>(null);
  const [flyTo, setFlyTo] = useState<{ center: LngLat; zoom: number; key: string } | null>(null);
  const [initial] = useState(() => ({ center: value ?? fallback, zoom: 17 }));

  const applyFix = (result: Awaited<ReturnType<typeof readFix>>) => {
    if (result === 'denied') {
      setGps('denied');
      return;
    }
    setFix(result);
    setFlyTo({ center: result.point, zoom: 18, key: `${result.at}` });
    onChange(result.point, result.accuracy);
    setGps('idle');
  };

  const locate = async () => {
    setGps('locating');
    applyFix(await readFix());
  };

  useEffect(() => {
    if (!autoLocate) return;
    let cancelled = false;
    const run = async () => {
      const result = await readFix();
      if (!cancelled) applyFix(result);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // Only when the step opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCenterChange = (center: LngLat) => {
    // Keep the GPS accuracy while the map is still on the GPS point.
    const onFix = fix && metresBetween(fix.point, center) < 5;
    onChange(center, onFix ? fix.accuracy : null);
  };

  const here = value ? barangayAt(value, barangays) : null;

  return (
    <View style={styles.wrap}>
      {value ? (
        <View style={[styles.place, !here && styles.placeOutside]} accessibilityLiveRegion="polite">
          <Icon
            name={here ? 'map-marker-check' : 'map-marker-alert'}
            size={22}
            color={here ? colors.ink : colors.red}
          />
          <AppText
            variant="bodyStrong"
            color={here ? colors.text : colors.red}
            style={styles.placeText}
          >
            {here
              ? t('reports.wizard.inBarangay', { barangay: here.properties.name })
              : t('reports.wizard.outside')}
          </AppText>
        </View>
      ) : null}
      <View style={styles.mapBox}>
        <KMap
          barangays={barangays}
          meta={meta}
          trucks={[]}
          initialCenter={initial}
          flyTo={flyTo}
          onCenterChange={onCenterChange}
          cooperative={false}
          highlightBarangayId={here?.properties.id ?? null}
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('reports.wizard.whereHint')}
        />
        {/* The fixed pin: its tip marks the chosen spot (the map centre). */}
        <View style={styles.pin} pointerEvents="none">
          <Icon name="map-marker" size={48} color={colors.red} />
        </View>
      </View>
      <AppText variant="label" color={colors.textMuted}>
        {t('reports.wizard.whereHint')}
      </AppText>
      <Button
        variant="secondary"
        icon="crosshairs-gps"
        label={
          gps === 'locating' ? t('reports.wizard.locating') : t('reports.wizard.useMyLocation')
        }
        loading={gps === 'locating'}
        onPress={() => void locate()}
      />
      {gps === 'denied' ? (
        <AppText color={colors.amber}>{t('reports.wizard.locationDenied')}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  // The green frame of the design's camera view, around the map the pin is set on.
  mapBox: {
    height: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.primary,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.greySoft,
  },
  placeOutside: { backgroundColor: colors.redSoft },
  placeText: { flex: 1 },
  pin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -24,
    marginTop: -46,
  },
});
