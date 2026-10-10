import { type Href, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLockup, DriverLockup, KolekAvatar, Wordmark } from '@/components/brand/Brand';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { LanguageSwitch } from '@/components/ui/LanguageSwitch';
import { useNarrow } from '@/components/ui/narrow';
import { Screen } from '@/components/ui/Screen';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { goBack } from '@/lib/navigation';
import { useWebTitle } from '@/lib/webTitle';
import { colors, spacing } from '@/theme/tokens';

/** From this width the logo moves to its own panel beside the form (a laptop, a tablet on its side). */
const SPLIT = 900;

interface AuthShellProps {
  children: ReactNode;
  /** Shows a back button: back in history, or to this route when there is none. */
  back?: Href;
  /**
   * Shows a back button that always goes to this route. For the sign-ins: after signing out, the
   * page before this one would only send the person straight back here.
   */
  exit?: Href;
  /** False on the welcome screen itself: elsewhere the logo is a button back to it. */
  brandLink?: boolean;
  /** Above the form: the full logo (welcome), or Kolek beside the name (signing in). */
  brand?: 'lockup' | 'driver' | 'kolek' | 'none';
  /** Small line above the title: which part of KolektaPH this is ("City ENRO", "Driver"). */
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** "Hakbang 2 sa 3" above the title, for the set-up steps. */
  step?: { current: number; total: number };
  /** Replaces the language switch (it is on by default: these screens are read first). */
  topRight?: ReactNode;
  /** The screen's main action, kept at the bottom in reach of the thumb. */
  footer?: ReactNode;
  /** "mint" = the stronger brand mint behind the page (the driver sign-in, as in the design). */
  tone?: 'tint' | 'mint';
  /** A smaller title, when the logo above it already says where the person is. */
  quietTitle?: boolean;
}

/**
 * The frame of every screen a person sees before they are in: welcome, onboarding and the
 * sign-ins. Pale mint page, logo, one green title, the form. On wide screens the logo and
 * tagline take the left half.
 */
export function AuthShell({
  children,
  back,
  exit,
  brandLink = true,
  brand = 'none',
  eyebrow,
  title,
  subtitle,
  step,
  topRight,
  footer,
  tone = 'tint',
  quietTitle = false,
}: AuthShellProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const split = width >= SPLIT;
  // On a very narrow screen the headline is a size smaller, so its words are not broken.
  const narrow = useNarrow();
  // Beside the mint logo panel of a wide screen, the form keeps the pale tint.
  const pageTone = split ? 'tint' : tone;
  useWebTitle(title);
  const target = exit ?? back;
  // The logo is the way out of any screen before sign-in: it always leads to the first screen.
  const toStart = (logo: ReactNode) =>
    brandLink ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('app.name')}. ${t('common.toStart')}`}
        onPress={() => router.replace('/welcome')}
      >
        {logo}
      </Pressable>
    ) : (
      logo
    );

  return (
    <View style={[styles.root, pageTone === 'mint' && styles.rootMint]}>
      {/* The design's green strip behind the phone's status bar (nothing to colour on the web). */}
      {insets.top > 0 ? (
        <>
          <StatusBar style="light" />
          <View style={[styles.strip, { height: insets.top }]} />
        </>
      ) : null}
      {split ? (
        <View style={[styles.panel, { paddingTop: insets.top }]}>
          {toStart(brand === 'driver' ? <DriverLockup width={300} /> : <BrandLockup width={320} />)}
        </View>
      ) : null}
      <View style={styles.form}>
        <Screen tone={pageTone} width="form" footer={footer} centered={split}>
          <View style={styles.top}>
            {target ? (
              <IconButton
                icon="arrow-left"
                label={t('common.back')}
                onPress={() => (exit ? router.replace(exit) : goBack(target))}
              />
            ) : (
              <View />
            )}
            {topRight ?? <LanguageSwitch />}
          </View>
          {step ? <StepIndicator current={step.current} total={step.total} /> : null}

          {brand === 'lockup' && !split ? (
            <View style={styles.brand}>{toStart(<BrandLockup width={narrow ? 140 : 220} />)}</View>
          ) : null}
          {brand === 'driver' && !split ? (
            <View style={styles.brand}>{toStart(<DriverLockup width={narrow ? 130 : 200} />)}</View>
          ) : null}
          {brand === 'kolek'
            ? toStart(
                <View style={styles.kolek}>
                  <KolekAvatar size={64} />
                  <Wordmark variant="title" />
                </View>,
              )
            : null}

          {title ? (
            <View style={styles.heading}>
              {eyebrow ? (
                <AppText variant="label" color={colors.textMuted} style={styles.center}>
                  {eyebrow}
                </AppText>
              ) : null}
              <AppText
                variant={quietTitle ? 'heading' : narrow ? 'title' : 'display'}
                color={colors.primary}
                accessibilityRole="header"
                style={styles.center}
              >
                {title}
              </AppText>
              {subtitle ? (
                <AppText color={colors.textMuted} style={styles.center}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          ) : null}

          {children}
        </Screen>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.mintSoft },
  rootMint: { backgroundColor: colors.mint },
  strip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: colors.primary,
  },
  panel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.xxl,
    backgroundColor: colors.mint,
  },
  form: { flex: 1 },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    // The back button's own padding lines its arrow up with the form's edge.
    marginLeft: -spacing.sm,
  },
  brand: { alignItems: 'center' },
  kolek: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  heading: { gap: spacing.xs },
  center: { textAlign: 'center' },
});
