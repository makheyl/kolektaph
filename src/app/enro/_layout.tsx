import { type Href, router, Slot, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useStaffAuth } from '@/features/admin/hooks';
import { StaffSignIn } from '@/features/enro/components/StaffSignIn';
import { services } from '@/services';
import type { FeatureFlags } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, fonts, radius, spacing, touch } from '@/theme/tokens';

const WIDE = 1024;

interface NavItem {
  href?: Href;
  icon: IconName;
  labelKey: string;
  /** Not built yet: shown disabled with the sprint it arrives in. */
  sprint?: string;
  /** A newer feature: listed only while its switch is on (see services.features). */
  feature?: keyof FeatureFlags;
}

const NAV: NavItem[] = [
  { href: '/enro', icon: 'monitor-dashboard', labelKey: 'enro.nav.liveOps' },
  { href: '/enro/sms', icon: 'message-text-outline', labelKey: 'enro.nav.sms' },
  { href: '/enro/reports', icon: 'file-document-outline', labelKey: 'enro.nav.reports' },
  {
    href: '/enro/hauling',
    icon: 'truck-delivery',
    labelKey: 'enro.nav.hauling',
    feature: 'hauling',
  },
  { href: '/enro/missed', icon: 'map-marker-remove', labelKey: 'enro.nav.missed' },
  { href: '/enro/trucks', icon: 'truck-outline', labelKey: 'enro.nav.trucks' },
  { href: '/enro/rewards', icon: 'gift', labelKey: 'enro.nav.rewards', feature: 'rewards' },
  { href: '/enro/stats', icon: 'chart-bar', labelKey: 'enro.nav.stats' },
  { href: '/enro/schedules', icon: 'calendar-edit', labelKey: 'enro.nav.schedules' },
  { href: '/enro/settings', icon: 'cog-outline', labelKey: 'enro.nav.settings' },
];

/** City ENRO dashboard shell: sidebar on desktop, top bar with nav chips on smaller screens. */
export default function EnroLayout() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { language, setLanguage } = useSettings();
  const auth = useStaffAuth();
  const isActive = (href?: Href) => href === pathname;
  const items = NAV.filter((n) => !n.feature || services.features[n.feature]);

  // On the server's data the dashboard is for City ENRO staff only.
  if (auth.status !== 'signed_in') return <StaffSignIn checking={auth.status === 'loading'} />;
  // The sample data has no accounts, so there is nobody to show or to sign out.
  const who = services.auth.required
    ? `${auth.staff.name} · ${t(`enro.settings.roles.${auth.staff.role}`)}`
    : null;
  const signOut = () => void services.auth.signOut();

  if (width < WIDE) {
    return (
      <View style={styles.fill}>
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.topBar}>
          <AppText variant="heading" color={colors.ink}>
            Kolekta
            <AppText variant="heading" color={colors.primary}>
              PH
            </AppText>{' '}
            · {t('enro.brand')}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topNav}
          >
            {items.map((n) => (
              <Chip
                key={n.labelKey}
                label={t(n.labelKey)}
                selected={isActive(n.href)}
                onPress={() => router.navigate(n.href!)}
              />
            ))}
            <Chip label={t('enro.nav.backToDemo')} onPress={() => router.replace('/demo')} />
            <Chip label={t('enro.nav.exit')} onPress={() => router.replace('/welcome')} />
            {who ? <Chip label={t('enro.signIn.signOut')} onPress={signOut} /> : null}
          </ScrollView>
          {who ? (
            <AppText variant="caption" color={colors.textMuted}>
              {who}
            </AppText>
          ) : null}
        </SafeAreaView>
        <Slot />
      </View>
    );
  }

  return (
    <View style={[styles.fill, styles.row]}>
      <SafeAreaView edges={['top', 'left', 'bottom']} style={styles.sidebar}>
        <View style={styles.brand}>
          <AppText variant="title" color={colors.ink}>
            Kolekta
            <AppText variant="title" color={colors.primary}>
              PH
            </AppText>
          </AppText>
          <AppText variant="label" color={colors.textMuted}>
            {t('enro.brand')} · Carmona
          </AppText>
        </View>
        <View accessibilityRole="menu" style={styles.nav}>
          {items.map((n) => {
            const active = isActive(n.href);
            const disabled = !n.href;
            return (
              <Pressable
                key={n.labelKey}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
                onPress={() => n.href && router.navigate(n.href)}
                style={({ pressed }) => [
                  styles.navItem,
                  active && styles.navItemActive,
                  pressed && !disabled && { backgroundColor: colors.mintSoft },
                ]}
              >
                <Icon
                  name={n.icon}
                  size={22}
                  color={disabled ? colors.grey : active ? colors.primary : colors.ink}
                />
                <AppText
                  variant="label"
                  color={disabled ? colors.grey : active ? colors.primary : colors.ink}
                  style={[styles.navLabel, active && { fontFamily: fonts.bold }]}
                >
                  {t(n.labelKey)}
                </AppText>
                {n.sprint ? (
                  <View style={styles.soon}>
                    <AppText variant="caption" color={colors.grey}>
                      {t('enro.nav.soon', { sprint: n.sprint })}
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.sidebarFooter}>
          <View style={styles.langRow}>
            <Chip
              label="Filipino"
              selected={language === 'fil'}
              onPress={() => setLanguage('fil')}
            />
            <Chip label="English" selected={language === 'en'} onPress={() => setLanguage('en')} />
          </View>
          {who ? (
            <>
              <AppText variant="caption" color={colors.textMuted} style={styles.who}>
                {who}
              </AppText>
              <Pressable accessibilityRole="button" onPress={signOut} style={styles.navItem}>
                <Icon name="logout" size={22} color={colors.ink} />
                <AppText variant="label" color={colors.ink}>
                  {t('enro.signIn.signOut')}
                </AppText>
              </Pressable>
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/demo')}
            style={styles.navItem}
          >
            <Icon name="swap-horizontal" size={22} color={colors.ink} />
            <AppText variant="label" color={colors.ink}>
              {t('enro.nav.backToDemo')}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/welcome')}
            style={styles.navItem}
          >
            <Icon name="exit-to-app" size={22} color={colors.ink} />
            <AppText variant="label" color={colors.ink}>
              {t('enro.nav.exit')}
            </AppText>
          </Pressable>
        </View>
      </SafeAreaView>
      <View style={styles.fill}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.dashboard },
  row: { flexDirection: 'row' },
  // A white column with a hairline, so the dashboard's cards and the sidebar read as one page.
  sidebar: {
    width: 248,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.xl,
  },
  brand: { paddingHorizontal: spacing.sm, gap: 2 },
  nav: { gap: spacing.xs, flex: 1 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  // Active item: mint fill AND a green bar AND bold green text (never colour alone).
  navItemActive: { backgroundColor: colors.mint, borderLeftColor: colors.primary },
  navLabel: { flex: 1 },
  soon: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grey,
    paddingHorizontal: 6,
  },
  sidebarFooter: { gap: spacing.md },
  who: { paddingHorizontal: spacing.md },
  langRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  // Below the wide layout the bar is mint, the same as the resident app's bars.
  topBar: {
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  topNav: { gap: spacing.sm, paddingTop: spacing.sm },
});
