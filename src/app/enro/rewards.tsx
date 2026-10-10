import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useStaffRights } from '@/features/admin/hooks';
import { KpiTile } from '@/features/enro/components/KpiTile';
import { Panel } from '@/features/enro/components/Panel';
import { formatDate } from '@/features/resident/format';
import { formatPoints, PERK_ICONS } from '@/features/rewards/format';
import { useCleanups, usePerks, usePoints } from '@/features/rewards/hooks';
import { voucherState } from '@/features/rewards/vouchers';
import { useBarangays, useSimNow } from '@/features/tracking/hooks';
import { formatClock } from '@/lib/time';
import { services } from '@/services';
import type { Voucher } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, radius, spacing } from '@/theme/tokens';

const TWO_COLUMNS = 1200;

/**
 * City ENRO Eco Points (sample): the perks on offer, the voucher lookup at the counter, and the
 * clean-up drives. Nothing is saved here yet; the buttons say so. The points rules are in
 * Settings.
 */
export default function EnroRewards() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;
  const now = useSimNow(10_000);
  const language = useSettings((s) => s.language);
  const perks = usePerks();
  const drives = useCleanups();
  const points = usePoints();
  const { data: barangays } = useBarangays();
  const rights = useStaffRights();
  const [code, setCode] = useState('');
  const [looked, setLooked] = useState(false);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [sampleNote, setSampleNote] = useState(false);

  if (!services.features.rewards)
    return (
      <Screen width="dashboard" safeTop={false}>
        <EmptyState icon="gift" title={t('enro.rewards.off')} />
      </Screen>
    );

  const list = perks ?? [];
  const driveList = drives ?? [];
  const upcoming = driveList.filter((d) => d.startsAt > now).length;
  const perkOf = (id: string) => list.find((p) => p.id === id);
  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const state = voucher ? voucherState(voucher, now) : null;
  const perAttendee = points?.rules.earn.cleanup_drive ?? null;

  const lookUp = async () => {
    setSampleNote(false);
    setVoucher(await services.rewards.findVoucher(code));
    setLooked(true);
  };

  const lookPanel = (
    <Panel title={t('enro.rewards.voucherTitle')}>
      <AppText color={colors.textMuted}>{t('enro.rewards.voucherHint')}</AppText>
      <TextField
        label={t('enro.rewards.voucherCode')}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => void lookUp()}
      />
      <Button
        variant="secondary"
        icon="magnify"
        label={t('enro.rewards.find')}
        disabled={code.trim().length === 0}
        onPress={() => void lookUp()}
      />
      {looked && !voucher ? (
        <Notice tone="danger" live="polite" text={t('enro.rewards.notFound')} />
      ) : null}
      {voucher && state ? (
        <View style={styles.voucher} accessibilityLiveRegion="polite">
          <AppText variant="bodyStrong">
            {perkOf(voucher.perkId)?.title[language] ?? t('rewards.voucher.title')}
          </AppText>
          <AppText variant="heading" color={colors.primary} selectable>
            {voucher.code}
          </AppText>
          <AppText variant="label" color={colors.textMuted}>
            {t('rewards.voucher.validUntil', { day: formatDate(t, voucher.validUntil) })}
          </AppText>
          <AppText variant="bodyStrong">{t(`rewards.voucher.status.${state}`)}</AppText>
          {rights.act && state === 'issued' ? (
            <Button
              variant="secondary"
              icon="check"
              label={t('enro.rewards.markUsed')}
              onPress={() => setSampleNote(true)}
            />
          ) : null}
        </View>
      ) : null}
    </Panel>
  );

  const perksPanel = (
    <Panel title={t('enro.rewards.perksTitle')}>
      {list.length === 0 ? (
        <AppText color={colors.textMuted}>{t('rewards.noPerks')}</AppText>
      ) : (
        list.map((p) => (
          <View key={p.id} style={styles.row}>
            <Icon name={PERK_ICONS[p.group]} size={24} color={colors.primary} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{p.title[language]}</AppText>
              <AppText variant="label" color={colors.textMuted}>
                {p.partner} · {t(`rewards.group.${p.group}`)}
                {p.sample ? ` · ${t('rewards.samplePerk')}` : ''}
              </AppText>
            </View>
            <AppText variant="bodyStrong">
              {t('rewards.cost', { points: formatPoints(p.cost) })}
            </AppText>
          </View>
        ))
      )}
      {rights.act ? (
        <Button
          variant="secondary"
          icon="plus"
          label={t('enro.rewards.addPerk')}
          onPress={() => setSampleNote(true)}
        />
      ) : null}
    </Panel>
  );

  const drivesPanel = (
    <Panel title={t('enro.rewards.drivesTitle')}>
      <AppText color={colors.textMuted}>{t('enro.rewards.drivesHint')}</AppText>
      {driveList.length === 0 ? (
        <AppText color={colors.textMuted}>{t('enro.rewards.noDrives')}</AppText>
      ) : (
        driveList.map((d) => (
          <View key={d.id} style={styles.row}>
            <Icon name="account-group" size={24} color={colors.primary} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{d.place}</AppText>
              <AppText variant="label" color={colors.textMuted}>
                {nameOf(d.barangayId)} · {formatDate(t, d.startsAt)} · {formatClock(d.startsAt)}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {t(d.startsAt > now ? 'enro.rewards.upcoming' : 'enro.rewards.done')} ·{' '}
                {t('enro.rewards.attendees', { count: d.attendees })}
                {perAttendee != null
                  ? ` · ${t('enro.rewards.perAttendee', { points: formatPoints(perAttendee) })}`
                  : ''}
              </AppText>
            </View>
          </View>
        ))
      )}
      {rights.act ? (
        <Button
          variant="secondary"
          icon="plus"
          label={t('enro.rewards.newDrive')}
          onPress={() => setSampleNote(true)}
        />
      ) : null}
    </Panel>
  );

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.rewards.title')}
        </AppText>
        <AppText color={colors.textMuted}>{t('enro.rewards.subtitle')}</AppText>
        <SampleDataBadge />
      </View>

      <View style={styles.kpis}>
        <KpiTile icon="gift" label={t('enro.rewards.kpiPerks')} value={String(list.length)} />
        <KpiTile
          icon="account-group"
          label={t('enro.rewards.kpiDrives')}
          value={String(upcoming)}
        />
      </View>

      {sampleNote ? <Notice tone="warning" live="polite" text={t('enro.sampleAction')} /> : null}

      {wide ? (
        <View style={styles.columns}>
          <View style={styles.mainCol}>
            {perksPanel}
            {drivesPanel}
          </View>
          <View style={styles.sideCol}>{lookPanel}</View>
        </View>
      ) : (
        <>
          {lookPanel}
          {perksPanel}
          {drivesPanel}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  mainCol: { flex: 3, gap: spacing.lg, minWidth: 0 },
  sideCol: { flex: 2, gap: spacing.lg, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 200, gap: 2 },
  voucher: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.mintSoft,
  },
});
