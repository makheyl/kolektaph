import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { driverStreets } from '@/features/driver/streets';
import { formatDistance } from '@/features/enro/format';
import { formatRelativeDay } from '@/features/resident/format';
import { useBarangays, useRoutes, useSimNow } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { formatClock } from '@/lib/time';
import { OfflineError, ServerError, services } from '@/services';
import type { ClaimResult } from '@/services/types';
import { useMyReports } from '@/stores/myReports';
import { useSettings } from '@/stores/settings';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

const LOOK: Record<ClaimResult['kind'], { icon: IconName; color: string; soft: string }> = {
  no_collection_today: { icon: 'calendar-blank', color: colors.ink, soft: colors.greySoft },
  not_yet: { icon: 'truck-fast', color: colors.primary, soft: colors.greenSoft },
  verified_miss: { icon: 'map-marker-alert', color: colors.red, soft: colors.redSoft },
  not_segregated: { icon: 'recycle', color: colors.amber, soft: colors.amberSoft },
  crew_not_at_fault: { icon: 'map-marker-alert', color: colors.red, soft: colors.redSoft },
  please_photo: { icon: 'camera-outline', color: colors.ink, soft: colors.greySoft },
  no_gps: { icon: 'signal-off', color: colors.grey, soft: colors.greySoft },
};

/**
 * "Hindi nadaanan" (HAKOT §10.2): one tap, then an instant answer from the truck's GPS and the
 * crew's log. The resident's street is kept on the phone only.
 */
export default function MissedClaim() {
  const { t } = useTranslation();
  const now = useSimNow(30_000);
  const barangayId = useSettings((s) => s.barangayId);
  const { data: barangays } = useBarangays();
  const { data: routes = [] } = useRoutes();
  const claimPlace = useMyReports((s) => s.claimPlace);
  const setClaimPlace = useMyReports((s) => s.setClaimPlace);
  const addTicket = useMyReports((s) => s.addTicket);
  const [checking, setChecking] = useState(false);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  /** Why the check could not be finished: no signal, or the server refused (its reason). */
  const [problem, setProblem] = useState<string | null>(null);

  const streets = useMemo(() => {
    if (!barangayId) return [];
    const seen = new Set<string>();
    return routes
      .filter((r) => r.barangayIds.includes(barangayId))
      .flatMap((r) => driverStreets(r).filter((s) => s.barangayId === barangayId))
      .filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)));
  }, [routes, barangayId]);

  const place = claimPlace?.barangayId === barangayId ? claimPlace : null;
  const placeStreet = streets.find((s) => s.key === place?.streetKey);
  const barangayName =
    barangays?.features.find((f) => f.properties.id === barangayId)?.properties.name ?? '';
  const back = (
    <IconButton icon="arrow-left" label={t('common.back')} onPress={() => goBack('/resident')} />
  );

  if (!barangayId) {
    return (
      <Screen
        header={<AppHeader title={t('claims.title')} leading={back} />}
        footer={
          <Button
            icon="map-marker-outline"
            label={t('resident.home.pick')}
            onPress={() => router.push('/resident/barangay')}
          />
        }
      >
        <EmptyState icon="map-marker-outline" title={t('resident.home.pickBody')} />
      </Screen>
    );
  }

  const locateMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setClaimPlace({
        barangayId,
        streetKey: null,
        point: [pos.coords.longitude, pos.coords.latitude],
      });
      setResult(null);
    } catch {
      // Keep the street list as the way in.
    } finally {
      setLocating(false);
    }
  };

  const check = async () => {
    if (!place) return;
    setChecking(true);
    setProblem(null);
    try {
      const r = await services.reports.checkMissed(place);
      if ('ticketId' in r) addTicket(r.ticketId);
      setResult(r);
    } catch (e) {
      setResult(null);
      setProblem(
        e instanceof OfflineError ? 'offline' : e instanceof ServerError ? e.code : 'other',
      );
    } finally {
      setChecking(false);
    }
  };

  const outcome = (r: ClaimResult) => {
    const k = `claims.outcome.${r.kind}`;
    switch (r.kind) {
      case 'no_collection_today':
        return {
          title: t(`${k}.title`),
          body: r.nextStart
            ? t(`${k}.body`, {
                day: `${formatRelativeDay(t, r.nextStart, now)}, ${formatClock(r.nextStart)}`,
              })
            : t(`${k}.bodyNone`),
        };
      case 'not_yet':
        return {
          title: t(`${k}.title`),
          body: r.arriveAt
            ? t(`${k}.body`, { time: formatClock(r.arriveAt) })
            : t(`${k}.bodyNoTime`),
        };
      case 'not_segregated':
        return { title: t(`${k}.title`), body: t(`${k}.body`, { time: formatClock(r.at) }) };
      case 'crew_not_at_fault':
        return { title: t(`${k}.title`), body: t(`${k}.${r.reason}`) };
      case 'please_photo':
        return {
          title: t(`${k}.title`),
          body:
            r.passedFrom && r.passedTo
              ? t(`${k}.body`, { from: formatClock(r.passedFrom), to: formatClock(r.passedTo) })
              : t(`${k}.bodyNoTime`),
        };
      default:
        return { title: t(`${k}.title`), body: t(`${k}.body`) };
    }
  };

  return (
    <Screen
      header={<AppHeader eyebrow={barangayName} title={t('claims.title')} leading={back} />}
      footer={
        place ? (
          <Button
            icon="magnify"
            label={checking ? t('claims.checking') : t('claims.check')}
            loading={checking}
            onPress={() => void check()}
          />
        ) : undefined
      }
    >
      <AppText color={colors.textMuted}>{t('claims.intro')}</AppText>

      {place ? (
        <Card>
          <View style={styles.row}>
            <Icon name="home-map-marker" size={24} color={colors.ink} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {placeStreet
                ? t('claims.streetLabel', { street: placeStreet.name ?? t('truck.unnamedRoad') })
                : t('claims.pointLabel')}
            </AppText>
          </View>
          <Button
            variant="secondary"
            size="compact"
            label={t('claims.changePlace')}
            onPress={() => {
              setClaimPlace(null);
              setResult(null);
            }}
          />
        </Card>
      ) : (
        <Section title={t('claims.whereTitle')}>
          <AppText variant="label" color={colors.textMuted}>
            {t('claims.whereHint')}
          </AppText>
          <Button
            icon="crosshairs-gps"
            label={locating ? t('reports.wizard.locating') : t('claims.useLocation')}
            loading={locating}
            onPress={() => void locateMe()}
          />
          <AppText variant="bodyStrong">{t('claims.pickStreet')}</AppText>
          {streets.length === 0 ? (
            <EmptyState icon="road-variant" title={t('claims.noStreets')} />
          ) : (
            <Card style={styles.streets}>
              {streets.map((s) => (
                <ListRow
                  key={s.key}
                  icon="road-variant"
                  title={s.name ?? t('truck.unnamedRoad')}
                  subtitle={formatDistance(t, s.lengthM)}
                  trailing="chevron"
                  onPress={() => {
                    setClaimPlace({ barangayId, streetKey: s.key, point: null });
                    setResult(null);
                  }}
                />
              ))}
            </Card>
          )}
        </Section>
      )}

      {problem ? (
        <Notice
          tone="danger"
          live="assertive"
          text={t(`claims.refused.${problem}`, { defaultValue: t('claims.refused.other') })}
        />
      ) : null}

      {result ? (
        <View
          style={[
            styles.result,
            { backgroundColor: LOOK[result.kind].soft, borderColor: LOOK[result.kind].color },
          ]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${outcome(result).title}. ${outcome(result).body}`}
        >
          <View style={styles.row}>
            <View style={[styles.resultIcon, { backgroundColor: LOOK[result.kind].color }]}>
              <Icon name={LOOK[result.kind].icon} size={26} color={colors.textOnDark} />
            </View>
            <AppText variant="heading" style={styles.flex}>
              {outcome(result).title}
            </AppText>
          </View>
          <AppText>{outcome(result).body}</AppText>
          {result.kind === 'not_segregated' ? (
            <View style={styles.guide}>
              <AppText variant="bodyStrong">
                {t('claims.outcome.not_segregated.guideTitle')}
              </AppText>
              {['guide1', 'guide2', 'guide3'].map((g) => (
                <AppText key={g}>• {t(`claims.outcome.not_segregated.${g}`)}</AppText>
              ))}
            </View>
          ) : null}
          {'ticketId' in result ? (
            <>
              <AppText variant="label">{t('claims.ticket', { ticket: result.ticketId })}</AppText>
              <Button
                variant="secondary"
                icon="file-document-outline"
                label={t('claims.seeTicket')}
                onPress={() =>
                  router.push({
                    pathname: '/resident/reports/[id]',
                    params: { id: result.ticketId },
                  })
                }
              />
            </>
          ) : null}
          {result.kind === 'please_photo' ? (
            <Button
              icon="camera"
              label={t('claims.outcome.please_photo.action')}
              onPress={() =>
                router.push({ pathname: '/resident/report', params: { category: 'MISSED' } })
              }
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  result: {
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streets: { padding: spacing.sm, gap: 0 },
  guide: { gap: spacing.xs },
});
