import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { colors, layout, radius, shadows, spacing, touch } from '@/theme/tokens';

/** The four screens of a shift that the bar reaches. Each other driver screen is reached from these. */
const TABS = [
  { href: '/driver/shift', labelKey: 'driver.tabs.home', icon: 'home', shiftOnly: false },
  { href: '/driver/streets', labelKey: 'driver.tabs.route', icon: 'routes', shiftOnly: true },
  { href: '/driver/gps', labelKey: 'driver.tabs.gps', icon: 'crosshairs-gps', shiftOnly: true },
  {
    href: '/driver/more',
    labelKey: 'driver.tabs.more',
    icon: 'account-circle-outline',
    shiftOnly: false,
  },
] as const satisfies readonly {
  href: string;
  labelKey: string;
  icon: IconName;
  /** Opens only during a shift: before it, the tab is shown but cannot be pressed. */
  shiftOnly: boolean;
}[];

/** The screens the bar is shown on. */
export const DRIVER_BAR_SCREENS: readonly string[] = [
  ...TABS.map((tab) => tab.href),
  // The load page is part of the shift too, as in the design.
  '/driver/load',
];

/**
 * The floating bar of the driver's shift: the same mint pill as the resident app, icons only,
 * the open screen marked by a white circle and a filled icon. Taps replace the screen, so the
 * back arrow of a page still goes to the page the crew came from.
 */
export function DriverTabBar({ onShift }: { onShift: boolean }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
      accessibilityRole="tablist"
    >
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const focused = pathname === tab.href;
          const label = t(tab.labelKey);
          const disabled = tab.shiftOnly && !onShift;
          return (
            <Pressable
              key={tab.href}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused, disabled }}
              disabled={disabled}
              aria-selected={focused}
              onPress={() => {
                if (!focused) router.replace(tab.href);
              }}
              style={({ pressed, hovered }: PressState) => [
                styles.tab,
                { opacity: disabled ? 0.4 : pressed ? 0.7 : hovered ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.icon, focused && styles.iconFocused]}>
                <Icon name={tab.icon} size={28} color={colors.ink} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.page },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: layout.tabBarHeight,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    ...shadows.card,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  icon: {
    width: '100%',
    maxWidth: 56,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFocused: { backgroundColor: colors.surface },
});
