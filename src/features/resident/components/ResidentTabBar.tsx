import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { AppText } from '@/components/ui/AppText';
import { useMyFeed } from '@/features/resident/useMyFeed';
import { useIsOnline } from '@/lib/network';
import { colors, fonts, layout, radius, shadows, spacing, touch } from '@/theme/tokens';

/**
 * The four tabs, by route name, in the order the bar shows them. Icons only, as drawn in the
 * design; each keeps its name for screen readers. Every other resident screen is reached from
 * these or from Home.
 */
const TABS: Record<string, { labelKey: string; active: IconName; inactive: IconName }> = {
  index: { labelKey: 'resident.tabs.home', active: 'home', inactive: 'home-outline' },
  map: { labelKey: 'resident.tabs.map', active: 'map', inactive: 'map-outline' },
  alerts: { labelKey: 'resident.tabs.alerts', active: 'bell', inactive: 'bell-outline' },
  settings: { labelKey: 'resident.tabs.profile', active: 'account', inactive: 'account-outline' },
};

/** The pages under Profile (account settings and so on) keep the Profile tab marked. */
const tabOf = (routeName: string) => (routeName.startsWith('account/') ? 'settings' : routeName);

/** Profile and its pages are drawn on mint: the strip behind the bar takes the same colour. */
const MINT_TAB = 'settings';

/**
 * The floating mint bar of the resident app. The open tab is marked by a white circle behind a
 * filled icon, never by colour alone. The bell shows a dot while there is something unread. A
 * strip above the bar says when there is no signal.
 */
export function ResidentTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { t } = useTranslation();
  const online = useIsOnline();
  const { unread } = useMyFeed();
  const tabs = state.routes.filter((r) => TABS[r.name]);
  const openKey = state.routes[state.index]?.key;
  const openTab = tabOf(state.routes[state.index]?.name ?? '');
  const mint = openTab === MINT_TAB;

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, spacing.md) },
        mint && { backgroundColor: colors.mint },
      ]}
    >
      {online ? null : (
        <View style={styles.offline} accessibilityLiveRegion="polite">
          <Icon name="cloud-off-outline" size={18} color={colors.ink} />
          <AppText variant="caption" color={colors.ink} style={styles.offlineText}>
            {t('common.offline')}
          </AppText>
        </View>
      )}
      <View accessibilityRole="tablist" style={styles.bar}>
        {tabs.map((route) => {
          const tab = TABS[route.name];
          const focused = route.name === openTab;
          const label = t(tab.labelKey);
          const dot = route.name === 'alerts' && unread > 0;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            // From a page under the tab (Profile's account settings), the tab leads back to it.
            if (route.key !== openKey && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              aria-selected={focused}
              accessibilityLabel={
                dot ? `${label}. ${t('resident.home.alertsUnread', { count: unread })}` : label
              }
              onPress={onPress}
              style={({ pressed, hovered }: PressState) => [
                styles.tab,
                { opacity: pressed ? 0.7 : hovered ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.icon, focused && styles.iconFocused]}>
                <Icon name={focused ? tab.active : tab.inactive} size={26} color={colors.ink} />
                {dot ? (
                  <View style={styles.dot} importantForAccessibility="no-hide-descendants" />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.page,
  },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.yellowSoft,
    borderWidth: 1,
    borderColor: colors.yellow,
  },
  offlineText: { flexShrink: 1, fontFamily: fonts.semibold },
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    minHeight: touch.min,
  },
  icon: {
    width: '100%',
    maxWidth: 48,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFocused: { backgroundColor: colors.surface },
  dot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
