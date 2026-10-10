import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import type { PressState } from '@/components/ui/interaction';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { useNarrow } from '@/components/ui/narrow';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { Skeleton, SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { firstName, useAccount } from '@/features/account/hooks';
import { KolekBar } from '@/features/resident/components/KolekBar';
import { MiniMap } from '@/features/resident/components/MiniMap';
import { type Shortcut, ShortcutGrid } from '@/features/resident/components/ShortcutGrid';
import { StatusCard } from '@/features/resident/components/StatusCard';
import { barangayLabel } from '@/features/resident/format';
import { useMyFeed } from '@/features/resident/useMyFeed';
import { useResidentToday } from '@/features/resident/useResidentToday';
import { useBarangays, useCityMeta } from '@/features/tracking/hooks';
import { TRUCK_STATUS_META } from '@/features/tracking/statusMeta';
import { formatClock } from '@/lib/time';
import { services } from '@/services';
import { useDemo } from '@/stores/demo';
import { useMyReports } from '@/stores/myReports';
import { colors, radius, spacing, touch } from '@/theme/tokens';

/** How far the status card reaches up over the mini-map. */
const MAP_OVERLAP = 72;
/** The round shortcuts of Home, with every feature switched on (two rows of four). */
const SHORTCUTS_PER_PAGE = 8;

/** Home: answers "Kailan darating ang truck?" at the top, without scrolling. */
export default function ResidentHome() {
  const { t } = useTranslation();
  const narrow = useNarrow();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const { barangayId, now, status, truck, ready } = useResidentToday();
  const { unread } = useMyFeed();
  const myCount = useMyReports((s) => s.ticketIds.length + s.pending.length);
  const demoMode = useDemo((s) => s.demoMode);
  const account = useAccount();
  const name = account.status === 'registered' ? firstName(account.profile.fullName) : '';
  const profile = useRef<View>(null);
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);

  const props = barangays?.features.find((f) => f.properties.id === barangayId)?.properties;
  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';

  const openMenu = () =>
    profile.current?.measureInWindow((x, y, width, height) =>
      setMenu({ top: y + height, right: Dimensions.get('window').width - (x + width) }),
    );
  const places: MenuItem[] = [
    {
      icon: 'account-cog-outline',
      label: t('resident.profile.title'),
      onPress: () => router.push('/resident/settings'),
    },
    {
      icon: 'clipboard-list-outline',
      label: t('reports.mine.linkFromHome'),
      onPress: () => router.push('/resident/reports'),
    },
    {
      icon: 'shield-account-outline',
      label: t('resident.settings.privacy'),
      onPress: () => router.push('/resident/privacy'),
    },
    {
      icon: 'chat-question-outline',
      label: t('kolek.title'),
      onPress: () => router.push('/resident/kolek'),
    },
    ...(services.features.accounts
      ? [
          account.status === 'registered'
            ? {
                icon: 'logout' as const,
                label: t('account.logOut'),
                onPress: () => void services.account.logOut(),
              }
            : {
                icon: 'login' as const,
                label: t('account.logInOrRegister'),
                onPress: () => router.push('/account/login'),
              },
        ]
      : []),
    ...(demoMode
      ? [
          {
            icon: 'swap-horizontal' as const,
            label: t('resident.settings.switchRole'),
            onPress: () => router.replace('/demo'),
          },
        ]
      : []),
  ];

  // The round shortcuts, in the order of the design. A feature that is switched off leaves its
  // place; "Hindi nadaanan?" takes a free place, and Report and My Reports link to it too.
  const shortcuts: Shortcut[] = [
    {
      key: 'schedule',
      icon: 'calendar-month',
      label: t('resident.home.actions.schedule'),
      onPress: () => router.push('/resident/schedule'),
    },
    ...(services.features.scanner
      ? [
          {
            key: 'scanner',
            icon: 'line-scan' as const,
            label: t('scanner.short'),
            onPress: () => router.push('/resident/scanner'),
          },
        ]
      : []),
    {
      key: 'report',
      icon: 'camera',
      label: t('resident.home.actions.report'),
      onPress: () => router.push('/resident/report'),
    },
    ...(services.features.hauling
      ? [
          {
            key: 'hauling',
            icon: 'truck' as const,
            label: t('hauling.short'),
            onPress: () => router.push('/resident/hauling/new'),
          },
        ]
      : []),
    {
      key: 'impact',
      icon: 'chart-bar',
      label: t('impact.short'),
      onPress: () => router.push('/resident/impact'),
    },
    ...(services.features.rewards
      ? [
          {
            key: 'redeem',
            icon: 'cash' as const,
            label: t('resident.home.actions.redeem'),
            onPress: () => router.push('/resident/rewards/redeem'),
          },
          {
            key: 'rewards',
            icon: 'gift' as const,
            label: t('rewards.title'),
            onPress: () => router.push('/resident/rewards'),
          },
        ]
      : []),
    {
      key: 'reports',
      icon: 'clipboard-list-outline',
      label: t('reports.mine.linkFromHome'),
      badge: myCount ? String(myCount) : null,
      badgeLabel: myCount ? t('reports.mine.count', { count: myCount }) : null,
      onPress: () => router.push('/resident/reports'),
    },
  ];
  if (shortcuts.length < SHORTCUTS_PER_PAGE)
    shortcuts.push({
      key: 'missed',
      icon: 'map-marker-remove',
      label: t('resident.home.actions.missed'),
      onPress: () => router.push('/resident/missed'),
    });

  const header = (
    <AppHeader
      variant="brand"
      title={t('app.name')}
      onBrandPress={() => router.push('/welcome')}
      brandLabel={`${t('app.name')}. ${t('common.toStart')}`}
      subtitle={name ? t('resident.home.greetingName', { name }) : t('resident.home.greeting')}
      actions={
        <>
          <IconButton
            icon={unread ? 'bell-badge' : 'bell'}
            badge={unread}
            label={
              unread
                ? t('resident.home.alertsUnread', { count: unread })
                : t('resident.home.alertsLabel')
            }
            onPress={() => router.push('/resident/alerts')}
          />
          <View ref={profile} collapsable={false}>
            <IconButton
              icon="account-circle"
              label={t('resident.home.menu')}
              expanded={menu != null}
              onPress={openMenu}
            />
          </View>
        </>
      }
    />
  );

  if (!ready || !barangays || !meta) {
    return (
      <Screen header={header}>
        <SkeletonGroup>
          <Skeleton height={176} round={radius.lg} />
          <SkeletonCard lines={4} />
          <View style={styles.loadingRow}>
            <Skeleton width={64} height={64} round={radius.pill} />
            <Skeleton width={64} height={64} round={radius.pill} />
            <Skeleton width={64} height={64} round={radius.pill} />
            <Skeleton width={64} height={64} round={radius.pill} />
          </View>
          <Skeleton height={64} round={radius.lg} />
        </SkeletonGroup>
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <View style={styles.top}>
        <SampleDataBadge />
        {props ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('resident.home.yourBarangay')}: ${barangayLabel(props)}. ${t('resident.home.change')}`}
            onPress={() => router.push('/resident/barangay')}
            style={({ pressed, hovered }: PressState) => [
              styles.place,
              (pressed || hovered) && { backgroundColor: pressed ? colors.mint : colors.mintSoft },
            ]}
          >
            <Icon name="map-marker" size={22} color={colors.ink} />
            <View style={styles.placeText}>
              <AppText variant="caption" color={colors.textMuted}>
                {t('resident.home.yourBarangay')}
              </AppText>
              <AppText variant="bodyStrong">{barangayLabel(props)}</AppText>
            </View>
            <AppText variant="label" color={colors.primary} style={styles.link}>
              {t('resident.home.change')}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View>
        <MiniMap
          barangays={barangays}
          meta={meta}
          highlightId={barangayId}
          coveredBottom={MAP_OVERLAP}
          truck={truck?.status === 'off_duty' ? null : truck?.position}
          truckColor={truck ? TRUCK_STATUS_META[truck.status].color : undefined}
        />
        {/* The answer sits half over the map, as in the design: the map is the backdrop. */}
        <View style={[styles.status, narrow && styles.statusNarrow]}>
          <StatusCard
            status={status}
            now={now}
            barangayId={barangayId ?? ''}
            barangayName={props?.name ?? ''}
            nameOf={nameOf}
          />
        </View>
      </View>

      <ShortcutGrid items={shortcuts} />

      <KolekBar />

      {truck ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.updated}>
          {t('resident.home.lastUpdate', { time: formatClock(truck.at) })}
        </AppText>
      ) : null}

      <Menu
        visible={menu != null}
        onClose={() => setMenu(null)}
        anchor={menu ?? { top: 0, right: 0 }}
        label={t('resident.home.menu')}
        items={places}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.sm },
  place: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.greySoft,
  },
  placeText: { flexGrow: 1, flexShrink: 1, flexBasis: 110, minWidth: 0 },
  link: { textDecorationLine: 'underline' },
  status: { marginTop: -MAP_OVERLAP, marginHorizontal: spacing.sm },
  statusNarrow: { marginHorizontal: 0 },
  loadingRow: { flexDirection: 'row', justifyContent: 'space-around' },
  updated: { textAlign: 'center' },
});
