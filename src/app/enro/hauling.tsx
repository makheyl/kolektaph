import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { useStaffRights } from '@/features/admin/hooks';
import { KpiTile } from '@/features/enro/components/KpiTile';
import { Panel } from '@/features/enro/components/Panel';
import {
  HaulingStatusPill,
  QuoteBreakdown,
  useSlotText,
  VOLUME_ICONS,
} from '@/features/hauling/components/HaulingBits';
import { useAllHauling, useHaulingRates } from '@/features/hauling/hooks';
import { haulingGroup, haulingView } from '@/features/hauling/status';
import { usePoints } from '@/features/rewards/hooks';
import { useBarangays, useSimNow } from '@/features/tracking/hooks';
import { DAY } from '@/lib/time';
import { services } from '@/services';
import type { HaulingQuote, HaulingRequest } from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

const TWO_COLUMNS = 1200;

/**
 * City ENRO private hauling (sample): the requests, the quotation for the one chosen, and the
 * next step. Nothing is sent or saved here yet; the buttons say so.
 */
export default function EnroHauling() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;
  const now = useSimNow(10_000);
  const requests = useAllHauling();
  const rates = useHaulingRates();
  const points = usePoints();
  const { data: barangays } = useBarangays();
  const rights = useStaffRights();
  const slotText = useSlotText();
  const [chosen, setChosen] = useState<string | null>(null);
  const [sampleNote, setSampleNote] = useState(false);

  if (!services.features.hauling)
    return (
      <Screen width="dashboard" safeTop={false}>
        <EmptyState icon="truck-delivery" title={t('enro.hauling.off')} />
      </Screen>
    );

  const list = requests ?? [];
  const selected: HaulingRequest | null =
    list.find((r) => r.id === (chosen ?? list[0]?.id)) ?? null;
  const view = selected ? haulingView(selected, now) : null;
  const countOf = (status: 'requested' | 'quoted') =>
    list.filter((r) => haulingView(r, now) === status).length;
  const scheduled = list.filter((r) => haulingGroup(haulingView(r, now)) === 'scheduled').length;
  const pesosPer100 = points?.rules.pesosPer100 ?? 0;
  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';

  // The fee the City would set from its rates: shown for a request that has no quotation yet.
  // It is worked out here and never stored.
  const suggested: HaulingQuote | null =
    selected && rates && selected.volume !== 'unsure'
      ? {
          day: selected.day,
          slot: selected.slot,
          volume: selected.volume,
          baseFee: rates.base[selected.volume],
          distanceFee: rates.distanceFee,
          disposalFee: rates.disposalFee,
          quotedAt: now,
          validUntil: now + DAY,
        }
      : null;

  const pick = (id: string) => {
    setChosen(id);
    setSampleNote(false);
  };

  const listPanel = (
    <Panel title={t('enro.hauling.listTitle')}>
      {list.length === 0 ? (
        <AppText color={colors.textMuted}>{t('enro.hauling.empty')}</AppText>
      ) : (
        list.map((r) => {
          const on = selected?.id === r.id;
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => pick(r.id)}
              style={[styles.item, on && styles.itemOn]}
            >
              <Icon name={VOLUME_ICONS[r.volume]} size={24} color={colors.primary} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">
                  {r.id} · {r.businessName ?? r.contactName}
                </AppText>
                <AppText variant="label" color={colors.textMuted}>
                  {nameOf(r.barangayId)} · {slotText(r.day, r.slot)}
                </AppText>
              </View>
              <HaulingStatusPill view={haulingView(r, now)} />
            </Pressable>
          );
        })
      )}
    </Panel>
  );

  const detailPanel = selected ? (
    <Panel title={t('enro.hauling.detailTitle')}>
      <AppText variant="heading" color={colors.primary}>
        {selected.id}
      </AppText>
      {view ? <HaulingStatusPill view={view} /> : null}
      <Field
        label={t('enro.hauling.requester')}
        value={[t(`hauling.requester.${selected.requester}`), selected.businessName ?? null]
          .filter(Boolean)
          .join(' · ')}
      />
      <Field
        label={t('enro.hauling.contact')}
        value={`${selected.contactName} · ${selected.contactMobile}`}
      />
      <Field
        label={t('enro.hauling.place')}
        value={[nameOf(selected.barangayId), selected.landmark].filter(Boolean).join(' · ')}
      />
      <Field label={t('enro.hauling.when')} value={slotText(selected.day, selected.slot)} />
      <Field label={t('enro.hauling.volume')} value={t(`hauling.volume.${selected.volume}`)} />
      <Field
        label={t('enro.hauling.loads')}
        value={selected.loadTypes.map((l) => t(`hauling.load.${l}`)).join(', ')}
      />
      {selected.description ? (
        <AppText color={colors.textMuted}>{selected.description}</AppText>
      ) : null}
    </Panel>
  ) : null;

  const quotePanel = selected ? (
    <Panel title={t('enro.hauling.quoteTitle')}>
      {selected.quote ? (
        <QuoteBreakdown
          quote={selected.quote}
          pointsUsed={selected.payment?.pointsUsed ?? 0}
          rules={{ pesosPer100 }}
        />
      ) : suggested ? (
        <>
          <AppText variant="label" color={colors.amber}>
            {t('enro.hauling.suggested')}
          </AppText>
          <QuoteBreakdown quote={suggested} pointsUsed={0} rules={{ pesosPer100 }} />
        </>
      ) : (
        <AppText color={colors.textMuted}>
          {selected.volume === 'unsure'
            ? t('enro.hauling.unsureVolume')
            : rates
              ? t('enro.hauling.noQuote')
              : t('enro.hauling.noRates')}
        </AppText>
      )}
      {!rights.act ? (
        <AppText variant="label" color={colors.textMuted}>
          {t('enro.viewOnly')}
        </AppText>
      ) : view === 'requested' ? (
        <View style={styles.actions}>
          <Button
            icon="send"
            label={t('enro.hauling.actions.quote')}
            onPress={() => setSampleNote(true)}
          />
          <Button
            variant="secondary"
            icon="close-octagon"
            label={t('enro.hauling.actions.decline')}
            onPress={() => setSampleNote(true)}
          />
        </View>
      ) : view === 'accepted' ? (
        <View style={styles.actions}>
          <Button
            icon="calendar-clock"
            label={t('enro.hauling.actions.schedule')}
            onPress={() => setSampleNote(true)}
          />
        </View>
      ) : null}
      {sampleNote ? <Notice tone="warning" live="polite" text={t('enro.sampleAction')} /> : null}
    </Panel>
  ) : null;

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.hauling.title')}
        </AppText>
        <AppText color={colors.textMuted}>{t('enro.hauling.subtitle')}</AppText>
        <SampleDataBadge />
      </View>

      <View style={styles.kpis}>
        <KpiTile
          icon="inbox-arrow-down"
          label={t('enro.hauling.kpiNew')}
          value={String(countOf('requested'))}
        />
        <KpiTile
          icon="file-document-outline"
          label={t('enro.hauling.kpiQuoted')}
          value={String(countOf('quoted'))}
        />
        <KpiTile
          icon="calendar-clock"
          label={t('enro.hauling.kpiScheduled')}
          value={String(scheduled)}
        />
      </View>

      {wide ? (
        <View style={styles.columns}>
          <View style={styles.listCol}>{listPanel}</View>
          <View style={styles.detailCol}>
            {detailPanel}
            {quotePanel}
          </View>
        </View>
      ) : (
        <>
          {listPanel}
          {detailPanel}
          {quotePanel}
        </>
      )}
    </Screen>
  );
}

/** One labelled line of a request's details: the label small, the value bold. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <AppText variant="label" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  listCol: { flex: 2, minWidth: 0 },
  detailCol: { flex: 3, gap: spacing.lg, minWidth: 0 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  itemOn: { borderColor: colors.primary, backgroundColor: colors.mintSoft },
  flex: { flex: 1, minWidth: 200, gap: 2 },
  field: { gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
