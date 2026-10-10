import { Image } from 'expo-image';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, fonts, radius, shadows, type TextVariant } from '@/theme/tokens';

// The KolektaPH logo and Kolek, from the Figma file, cut down for the app (the full-size
// originals are in assets/brand/source/; `npm run icons` builds the app icons from them).
const MARK = { source: require('../../../assets/brand/logo-mark.webp'), ratio: 300 / 229 };
const LOCKUP = {
  // On the web the launch screen (public/index.html) has already downloaded this picture from
  // /brand/, so the welcome screen shows that copy instead of fetching a second one.
  source:
    Platform.OS === 'web'
      ? { uri: '/brand/logo-lockup.webp' }
      : require('../../../assets/brand/logo-lockup.webp'),
  ratio: 520 / 480,
};
const KOLEK = { source: require('../../../assets/brand/kolek.webp'), ratio: 240 / 177 };
const FLAG = { source: require('../../../assets/brand/ph-flag.webp'), ratio: 2 };

/** The truck on its own: decoration next to the name, so screen readers skip it. */
export function BrandMark({ height = 40 }: { height?: number }) {
  return (
    <View aria-hidden>
      <Image
        source={MARK.source}
        style={{ height, width: height * MARK.ratio }}
        contentFit="contain"
      />
    </View>
  );
}

/** The truck with "KolektaPH" under it, for the welcome and sign-in screens. */
export function BrandLockup({ width = 220 }: { width?: number }) {
  return (
    <Image
      source={LOCKUP.source}
      style={{ width, height: width / LOCKUP.ratio }}
      contentFit="contain"
      accessibilityLabel="KolektaPH"
    />
  );
}

/** "KolektaPH" as text, in the logo's two greens. */
export function Wordmark({ variant = 'heading' }: { variant?: TextVariant }) {
  return (
    <AppText variant={variant} color={colors.ink} accessibilityRole="header">
      Kolekta
      <AppText variant={variant} color={colors.primary}>
        PH
      </AppText>
    </AppText>
  );
}

/** "KolektaPH Driver" as text: the name in the logo's greens, "Driver" in its orange. */
export function DriverWordmark({ variant = 'heading' }: { variant?: TextVariant }) {
  return (
    <AppText variant={variant} color={colors.ink} accessibilityRole="header">
      Kolekta
      <AppText variant={variant} color={colors.primary}>
        PH
      </AppText>{' '}
      <AppText variant={variant} color={colors.brandOrange}>
        Driver
      </AppText>
    </AppText>
  );
}

/**
 * The driver app's logo, as in the design: the truck, "KolektaPH" under it, then three speed
 * lines and "Driver" in orange. Drawn from the truck picture and text, so it stays sharp at any
 * size.
 */
export function DriverLockup({ width = 220 }: { width?: number }) {
  const unit = width / 220;
  const line = (length: number, color: string) => (
    <View
      style={{
        width: length * unit,
        height: 4 * unit,
        borderRadius: 2 * unit,
        backgroundColor: color,
      }}
    />
  );
  return (
    <View
      style={styles.driver}
      accessible
      accessibilityRole="image"
      accessibilityLabel="KolektaPH Driver"
    >
      <Image
        source={MARK.source}
        style={{ width, height: width / MARK.ratio }}
        contentFit="contain"
      />
      <AppText
        color={colors.ink}
        style={{ fontFamily: fonts.extrabold, fontSize: 34 * unit, lineHeight: 38 * unit }}
        aria-hidden
      >
        Kolekta
        <AppText
          color={colors.primary}
          style={{ fontFamily: fonts.extrabold, fontSize: 34 * unit, lineHeight: 38 * unit }}
        >
          PH
        </AppText>
      </AppText>
      <View style={[styles.driverRow, { gap: 6 * unit }]} aria-hidden>
        <View style={[styles.lines, { gap: 3 * unit }]}>
          {line(58, colors.brandOrange)}
          {line(44, colors.primary)}
          {line(52, colors.brandOrange)}
        </View>
        <AppText
          color={colors.brandOrange}
          style={{ fontFamily: fonts.extrabold, fontSize: 32 * unit, lineHeight: 34 * unit }}
        >
          Driver
        </AppText>
      </View>
    </View>
  );
}

/** Kolek, the assistant, in a white circle. Decoration: the bubble next to it carries the name. */
export function KolekAvatar({ size = 44 }: { size?: number }) {
  const width = size * 0.8;
  return (
    <View style={[styles.avatar, { width: size, height: size }]} aria-hidden>
      <Image
        source={KOLEK.source}
        style={{ width, height: width / KOLEK.ratio }}
        contentFit="contain"
      />
    </View>
  );
}

/** The Philippine flag before a mobile number's +63. */
export function PhFlag({ height = 18 }: { height?: number }) {
  return (
    <View aria-hidden style={styles.flag}>
      <Image source={FLAG.source} style={{ height, width: height * FLAG.ratio }} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  flag: { borderRadius: 2, overflow: 'hidden' },
  driver: { alignItems: 'center' },
  driverRow: { flexDirection: 'row', alignItems: 'center' },
  lines: { alignItems: 'flex-end' },
});
