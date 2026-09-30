import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { KMap } from '@/components/map/KMap';
import type { MapTruck } from '@/components/map/types';
import { PhotoCapture } from '@/components/photos/PhotoCapture';
import { PhotoView } from '@/components/photos/PhotoView';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { CATEGORY_META, responseDue } from '@/features/reports/categories';
import {
  PriorityPill,
  TicketStatusPill,
  TicketTimeline,
} from '@/features/reports/components/TicketBits';
import type { DispatchSuggestion } from '@/features/reports/dispatch';
import { canApply } from '@/features/reports/lifecycle';
import type { Priority } from '@/features/reports/priority';
import { formatRelativeDay } from '@/features/resident/format';
import { metresBetween } from '@/lib/geo';
import { maskPhMobile } from '@/lib/phone';
import { formatClock } from '@/lib/time';
import { services } from '@/services';
import type {
  BarangayCollection,
  CityMeta,
  DispatchMode,
  PhotoRef,
  Ticket,
  TicketAction,
  Truck,
  TruckState,
} from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

import { formatDistance } from '../format';
import { Panel } from './Panel';

const MODES: DispatchMode[] = ['add_to_route', 'special_pickup', 'next_schedule'];
const REJECT_REASONS = ['no_waste', 'inappropriate', 'duplicate'] as const;

interface ReportDetailProps {
  ticket: Ticket;
  tickets: Ticket[];
  priority: Priority;
  suggestion: DispatchSuggestion | null;
  states: TruckState[];
  trucks: Truck[];
  barangays: BarangayCollection;
  meta: CityMeta;
  now: number;
  nameOf: (id: string | null) => string;
}

/**
 * One report for City ENRO staff: photos, place, score breakdown, the suggested handling
 * (HAKOT dispatch rules) and the actions. The system suggests; staff decide.
 */
export function ReportDetail(props: ReportDetailProps) {
  const { ticket, tickets, priority, suggestion, states, trucks, barangays, meta, now, nameOf } =
    props;
  const { t } = useTranslation();
  const truckName = (id: string | null) =>
    id ? (trucks.find((tr) => tr.id === id)?.name ?? id) : t('enro.reports.specialCrew');
  const sugg = suggestion?.action === 'dispatch' ? suggestion : null;
  const [mode, setMode] = useState<DispatchMode>(sugg?.mode ?? 'special_pickup');
  const [truckId, setTruckId] = useState<string | null>(sugg?.truckId ?? null);
  const [mergeInto, setMergeInto] = useState<string | null>(
    suggestion?.action === 'merge' ? suggestion.into : null,
  );
  const [after, setAfter] = useState<PhotoRef | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (action: TicketAction) => {
    setBusy(true);
    try {
      await services.reports.act(ticket.id, action, 'enro');
    } finally {
      setBusy(false);
    }
  };
  const can = (action: TicketAction) => canApply(ticket, action, 'enro', now);
  const due =
    mode === 'next_schedule' && sugg?.mode === 'next_schedule'
      ? sugg.due
      : responseDue(ticket.category, ticket.createdAt);
  const nearbyOpen = tickets.filter(
    (o) =>
      o.id !== ticket.id &&
      ['submitted', 'verified', 'scheduled', 'in_progress'].includes(o.status) &&
      metresBetween(o.location, ticket.location) <= 200,
  );

  const mapTrucks: MapTruck[] = states.flatMap((s) => {
    const tr = trucks.find((x) => x.id === s.truckId);
    return tr && s.position && s.status !== 'off_duty'
      ? [{ id: tr.id, code: tr.code, name: tr.name, status: s.status, position: s.position }]
      : [];
  });

  return (
    <View style={styles.wrap}>
      <Panel title={`${t(`reports.category.${ticket.category}`)} · ${ticket.id}`}>
        <View style={styles.row}>
          <TicketStatusPill status={ticket.status} />
          <PriorityPill priority={priority} />
          <AppText variant="label" color={colors.textMuted}>
            {t(`enro.reports.source.${ticket.source}`)}
          </AppText>
        </View>
        {ticket.photos.length ? (
          <View style={styles.photos}>
            {ticket.photos.map((p, i) => (
              <View key={i} style={styles.flex}>
                <PhotoView photo={p} accessibilityLabel={t('reports.detail.photos')} />
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.map}>
          <KMap
            barangays={barangays}
            meta={meta}
            trucks={mapTrucks}
            initialCenter={{ center: ticket.location, zoom: 15 }}
            flyTo={{ center: ticket.location, zoom: 15, key: ticket.id }}
            pins={[
              {
                id: ticket.id,
                position: ticket.location,
                color: colors.red,
                icon: CATEGORY_META[ticket.category].icon,
                label: t(`reports.category.${ticket.category}`),
              },
            ]}
            style={StyleSheet.absoluteFill}
            accessibilityLabel={t('reports.detail.where')}
          />
        </View>
        <View style={styles.facts}>
          <AppText>
            <AppText variant="bodyStrong">{nameOf(ticket.barangayId)}</AppText>
            {ticket.landmark ? ` · ${ticket.landmark}` : ''}
          </AppText>
          {ticket.missed ? (
            <AppText>
              {t('enro.reports.missedFrom', {
                street: ticket.missed.streetName ?? t('truck.unnamedRoad'),
                day: ticket.missed.day,
              })}
            </AppText>
          ) : null}
          <AppText color={colors.textMuted}>
            {t(`reports.size.${ticket.size}`)}
            {ticket.nearWaterway ? ` · ${t('reports.wizard.nearWaterway')}` : ''}
            {ticket.nearSensitive ? ` · ${t('reports.wizard.nearSensitive')}` : ''}
          </AppText>
          {ticket.note ? <AppText>“{ticket.note}”</AppText> : null}
          <AppText variant="label" color={colors.textMuted}>
            {t('enro.reports.reporter')}:{' '}
            {ticket.contact ? maskPhMobile(ticket.contact) : t('enro.reports.noContact')} ·{' '}
            {formatRelativeDay(t, ticket.createdAt, now)}, {formatClock(ticket.createdAt)}
          </AppText>
        </View>
      </Panel>

      <Panel title={t('enro.reports.breakdown')}>
        {(Object.entries(priority.parts) as [keyof Priority['parts'], number][])
          .filter(([, v]) => v > 0)
          .map(([k, v]) => (
            <View key={k} style={styles.part}>
              <AppText style={styles.flex}>{t(`enro.reports.parts.${k}`)}</AppText>
              <AppText variant="bodyStrong">+{v}</AppText>
            </View>
          ))}
        <View style={[styles.part, styles.total]}>
          <AppText variant="bodyStrong" style={styles.flex}>
            {t(`reports.priority.${priority.level}`)}
          </AppText>
          <AppText variant="heading">{priority.score}</AppText>
        </View>
      </Panel>

      {suggestion && ['submitted', 'verified'].includes(ticket.status) ? (
        <Panel title={t('enro.reports.suggestionTitle')}>
          <View style={styles.suggestion}>
            <Icon name="lightbulb-on-outline" size={22} color={colors.navy} />
            <AppText style={styles.flex}>
              {suggestion.action === 'merge'
                ? t('enro.reports.suggestMerge', { ticket: suggestion.into })
                : t('enro.reports.suggestDispatch', {
                    mode: t(`reports.dispatchMode.${suggestion.mode}`),
                    truck: truckName(suggestion.truckId),
                    distance:
                      suggestion.distanceM != null
                        ? ` (${formatDistance(t, suggestion.distanceM)})`
                        : '',
                  })}
            </AppText>
          </View>
          <Button
            variant="success"
            icon="check"
            label={t('enro.reports.apply')}
            disabled={busy}
            onPress={() =>
              void act(
                suggestion.action === 'merge'
                  ? { type: 'merge', into: suggestion.into }
                  : {
                      type: 'dispatch',
                      mode: suggestion.mode,
                      truckId: suggestion.truckId,
                      due: suggestion.due,
                    },
              )
            }
          />
          <AppText variant="caption" color={colors.textMuted}>
            {t('enro.reports.humansDecide')}
          </AppText>
        </Panel>
      ) : null}

      {['submitted', 'verified', 'scheduled', 'in_progress'].includes(ticket.status) ? (
        <Panel title={t('enro.reports.actions')}>
          {can({ type: 'verify' }) ? (
            <Button
              variant="secondary"
              icon="shield-check"
              label={t('enro.reports.verify')}
              disabled={busy}
              onPress={() => void act({ type: 'verify' })}
            />
          ) : null}

          {can({ type: 'dispatch', mode, truckId, due }) ? (
            <View style={styles.block}>
              <AppText variant="bodyStrong">{t('enro.reports.modeLabel')}</AppText>
              <View style={styles.chips}>
                {MODES.map((m) => (
                  <Chip
                    key={m}
                    label={t(`reports.dispatchMode.${m}`)}
                    selected={mode === m}
                    onPress={() => setMode(m)}
                  />
                ))}
              </View>
              <AppText variant="bodyStrong">{t('enro.reports.assignTo')}</AppText>
              <View style={styles.chips}>
                {trucks.map((tr) => (
                  <Chip
                    key={tr.id}
                    label={tr.name}
                    selected={truckId === tr.id}
                    onPress={() => setTruckId(tr.id)}
                  />
                ))}
                <Chip
                  label={t('enro.reports.specialCrew')}
                  selected={truckId == null}
                  onPress={() => setTruckId(null)}
                />
              </View>
              <Button
                icon="truck-fast"
                label={t('enro.reports.assign')}
                disabled={busy}
                onPress={() => void act({ type: 'dispatch', mode, truckId, due })}
              />
            </View>
          ) : null}

          {nearbyOpen.length && can({ type: 'merge', into: nearbyOpen[0].id }) ? (
            <View style={styles.block}>
              <AppText variant="bodyStrong">{t('enro.reports.mergeInto')}</AppText>
              <View style={styles.chips}>
                {nearbyOpen.map((o) => (
                  <Chip
                    key={o.id}
                    label={o.id}
                    selected={mergeInto === o.id}
                    onPress={() => setMergeInto(o.id)}
                  />
                ))}
              </View>
              <Button
                variant="secondary"
                icon="call-merge"
                label={t('enro.reports.merge')}
                disabled={busy || !mergeInto}
                onPress={() => mergeInto && void act({ type: 'merge', into: mergeInto })}
              />
            </View>
          ) : null}

          {can({ type: 'reject', reason: 'x' }) ? (
            <View style={styles.block}>
              <AppText variant="bodyStrong">{t('enro.reports.rejectReason')}</AppText>
              <View style={styles.chips}>
                {REJECT_REASONS.map((r) => (
                  <Chip
                    key={r}
                    label={t(`enro.reports.rejectReasons.${r}`)}
                    onPress={() =>
                      void act({ type: 'reject', reason: t(`enro.reports.rejectReasons.${r}`) })
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          {can({ type: 'collect', before: null, after: { kind: 'sample', id: 'clean' } }) ? (
            <View style={styles.block}>
              {ticket.dispatch ? (
                <AppText>
                  {t('enro.reports.dispatched', {
                    mode: t(`reports.dispatchMode.${ticket.dispatch.mode}`),
                    truck: truckName(ticket.dispatch.truckId),
                  })}
                </AppText>
              ) : null}
              <AppText variant="label" color={colors.textMuted}>
                {t('enro.reports.collectHint')}
              </AppText>
              {after ? (
                <PhotoView photo={after} accessibilityLabel={t('reports.detail.after')} />
              ) : null}
              <PhotoCapture
                guide="after"
                label={t('reports.detail.after')}
                variant="secondary"
                sample="clean"
                onCaptured={setAfter}
              />
              <Button
                variant="success"
                icon="check-circle"
                label={t('enro.reports.collect')}
                disabled={busy || !after}
                onPress={() => after && void act({ type: 'collect', before: null, after })}
              />
            </View>
          ) : null}
        </Panel>
      ) : null}

      <Panel title={t('reports.detail.timeline')}>
        <TicketTimeline ticket={ticket} />
        {ticket.history.map((h) => (
          <AppText key={h.id} variant="caption" color={colors.textMuted}>
            {formatClock(h.at)} ·{' '}
            {t(`reports.event.${h.kind}`, { stars: h.note, ticket: h.note, reason: h.note })} ·{' '}
            {t(`reports.by.${h.by}`)}
          </AppText>
        ))}
        {ticket.proof ? (
          <View style={styles.photos}>
            {ticket.proof.before ? (
              <View style={styles.flex}>
                <PhotoView
                  photo={ticket.proof.before}
                  accessibilityLabel={t('reports.detail.before')}
                />
              </View>
            ) : null}
            <View style={styles.flex}>
              <PhotoView
                photo={ticket.proof.after}
                accessibilityLabel={t('reports.detail.after')}
              />
            </View>
          </View>
        ) : null}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  photos: { flexDirection: 'row', gap: spacing.sm },
  map: {
    height: 260,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  facts: { gap: spacing.xs },
  part: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  total: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  suggestion: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  block: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
