import { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

import type { KMapProps } from './types';

/**
 * maplibre-gl is the biggest part of the web app, so it loads only when a map is on screen:
 * Home and the other screens without a map stay light on 3G.
 */
const MapLibreMap = lazy(() => import('./KMapMapLibre.web'));

export function KMap(props: KMapProps) {
  return (
    <Suspense
      fallback={
        <View
          style={[props.style, styles.loading]}
          accessible
          accessibilityLabel={props.accessibilityLabel}
        >
          <ActivityIndicator color={colors.navy} />
        </View>
      }
    >
      <MapLibreMap {...props} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greySoft },
});
