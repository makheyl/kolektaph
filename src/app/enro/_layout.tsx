import { type Href, router, Slot, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useSettings } from '@/stores/settings';
import { colors, fonts, radius, spacing, touch } from '@/theme/tokens';

const WIDE = 1024;

interface NavItem {
  href?: Href;
  icon: IconName;
  labelKey: string;
  /** Not built yet: shown disabled with the sprint it arrives in. */
  sprint?: string;
}

const NAV: NavItem[] = [
  { href: '/enro', icon: 'monitor-dashboard', labelKey: 'enro.nav.liveOps' },
  { href: '/enro/sms', icon: 'message-text-outline', labelKey: 'enro.nav.sms' },
  { icon: 'file-document-outline', labelKey: 'enro.nav.reports', sprint: 'S5' },
  { icon: 'truck-outline', labelKey: 'enro.nav.trucks', sprint: 'S4' },
  { icon: 'chart-bar', labelKey: 'enro.nav.stats', sprint: 'S6' },
  { icon: 'calendar-edit', labelKey: 'enro.nav.schedules', sprint: 'S6' },
];

/** City ENRO dashboard shell: sidebar on desktop, top bar with nav chips on smaller screens. */
export default function EnroLayout() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { language, setLanguage } = useSettings();
  const isActive = (href?: Href) => href === pathname;

  if (width < WIDE) {
    return (
      <View style={styles.fill}>
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.topBar}>
          <AppText variant="heading" color={colors.textOnDark}>
            Kolekta
            <AppText variant="heading" color={colors.yellow}>
              PH
            </AppText>{' '}
            · {t('enro.brand')}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topNav}
          >
            {NAV.filter((n) => n.href).map((n) => (
              <Chip
                key={n.labelKey}
                label={t(n.labelKey)}
                selected={isActive(n.href)}
                onPress={() => router.navigate(n.href!)}
              />
            ))}
            <Chip label={t('enro.nav.backToDemo')} onPress={() => router.replace('/demo')} />
          </ScrollView>
        </SafeAreaView>
        <Slot />
      </View>
    );
  }

  return (
    <View style={[styles.fill, styles.row]}>
      <SafeAreaView edges={['top', 'left', 'bottom']} style={styles.sidebar}>
        <View style={styles.brand}>
          <AppText variant="title" color={colors.textOnDark}>
            Kolekta
            <AppText variant="title" color={colors.yellow}>
              PH
            </AppText>
          </AppText>
          <AppText variant="label" color={colors.mint}>
            {t('enro.brand')} · Carmona
          </AppText>
        </View>
        <View accessibilityRole="menu" style={styles.nav}>
          {NAV.map((n) => {
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
                  pressed && !disabled && { backgroundColor: colors.navy },
                ]}
              >
                <Icon name={n.icon} size={22} color={disabled ? colors.grey : colors.textOnDark} />
                <AppText
                  variant="label"
                  color={disabled ? colors.grey : colors.textOnDark}
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
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/demo')}
            style={styles.navItem}
          >
            <Icon name="swap-horizontal" size={22} color={colors.mint} />
            <AppText variant="label" color={colors.mint}>
              {t('enro.nav.backToDemo')}
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
  fill: { flex: 1, backgroundColor: colors.cream },
  row: { flexDirection: 'row' },
  sidebar: {
    width: 248,
    backgroundColor: colors.navyDark,
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
  // Active item: brighter background AND a yellow bar AND bold text (not colour alone).
  navItemActive: { backgroundColor: colors.navy, borderLeftColor: colors.yellow },
  navLabel: { flex: 1 },
  soon: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.grey,
    paddingHorizontal: 6,
  },
  sidebarFooter: { gap: spacing.md },
  langRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  topBar: {
    backgroundColor: colors.navyDark,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  topNav: { gap: spacing.sm, paddingTop: spacing.sm },
});
