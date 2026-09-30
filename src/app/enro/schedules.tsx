import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { SmsBubble } from '@/components/ui/SmsBubble';
import { TextField } from '@/components/ui/TextField';
import { WasteBadge } from '@/components/ui/WasteBadge';
import { smsInfo, smsTimeRange } from '@/features/alerts/sms';
import { sms, smsDate, smsDays } from '@/features/alerts/templates';
import { Panel } from '@/features/enro/components/Panel';
import { formatDate } from '@/features/resident/format';
import { scheduleValidOn } from '@/features/schedule/collections';
import { scheduleConflicts, scheduleOn, validateScheduleChange } from '@/features/schedule/editing';
import {
  useBarangays,
  useRoutes,
  useRouteSchedules,
  useScheduleExceptions,
  useSimNow,
  useSmsRegistrations,
  useTrucks,
} from '@/features/tracking/hooks';
import {
  atManilaTime,
  DAY,
  formatClock,
  manilaDateKey,
  manilaParts,
  manilaStartOfDay,
  parseDateKey,
} from '@/lib/time';
import { services } from '@/services';
import type { Route, RouteSchedule, ScheduleChange, WasteType, Weekday } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/** Monday first, like a work week. */
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const WASTE_TYPES: WasteType[] = ['mixed', 'biodegradable', 'residual', 'recyclable'];
const TWO_COLUMNS = 1200;
const FROM_CHOICES = 7;

type Mode =
  { kind: 'view' } | { kind: 'edit'; routeId: string } | { kind: 'review'; routeId: string };

/**
 * City ENRO schedules (plan §6.3): barangay × weekday × waste type, and changes that start on a
 * chosen day. Saving shows who is affected and texts them (the SMS is previewed first).
 */
export default function EnroSchedules() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;
  const queryClient = useQueryClient();
  const now = useSimNow(60_000);
  const { data: schedules = [] } = useRouteSchedules();
  const { data: routes = [] } = useRoutes();
  const { data: trucks = [] } = useTrucks();
  const { data: exceptions = [] } = useScheduleExceptions();
  const { data: barangays } = useBarangays();
  const { data: registrations = {} } = useSmsRegistrations();
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [draft, setDraft] = useState<ScheduleChange | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const todayKey = manilaDateKey(now);
  const today = manilaStartOfDay(now);
  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const truckCode = (id: string) => trucks.find((tr) => tr.id === id)?.code ?? id;
  const truckName = (id: string) => trucks.find((tr) => tr.id === id)?.name ?? id;
  const routeNames = (r: Route | undefined) => (r?.barangayIds ?? []).map(nameOf).join(', ');
  const daysText = (days: Weekday[]) =>
    WEEK.filter((d) => days.includes(d))
      .map((d) => t(`weekday.${d}`))
      .join(', ');
  const windowText = (s: { start: string; windowEnd: string }) =>
    `${formatClock(atManilaTime(today, s.start))} – ${formatClock(atManilaTime(today, s.windowEnd))}`;
  const current = schedules.filter((s) => scheduleValidOn(s, todayKey));

  const startEdit = (routeId: string) => {
    const s = scheduleOn(schedules, routeId, todayKey);
    if (!s) return;
    setDraft({
      routeId,
      from: manilaDateKey(today + DAY),
      truckId: s.truckId,
      days: s.days,
      start: s.start,
      windowEnd: s.windowEnd,
      wasteType: s.wasteType,
    });
    setMessage(null);
    setMode({ kind: 'edit', routeId });
  };

  // ---------- Grid: barangay × weekday ----------
  const grid = barangays ? (
    <Panel title={t('enro.schedules.grid')}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={styles.gridRow}>
            <AppText variant="label" style={[styles.gridName, styles.gridHead]}>
              {t('enro.schedules.barangay')}
            </AppText>
            {WEEK.map((d) => (
              <AppText key={d} variant="label" style={[styles.gridCell, styles.gridHead]}>
                {t(`weekday.${d}`)}
              </AppText>
            ))}
          </View>
          {barangays.features.map(({ properties: b }) => {
            const own = current.filter((s) =>
              routes.find((r) => r.id === s.routeId)?.barangayIds.includes(b.id),
            );
            return (
              <View key={b.id} style={styles.gridRow}>
                <AppText variant="label" style={styles.gridName} numberOfLines={1}>
                  {b.name}
                </AppText>
                {WEEK.map((d) => {
                  const s = own.find((x) => x.days.includes(d));
                  return (
                    <View
                      key={d}
                      style={[styles.gridCell, s && styles.gridOn]}
                      accessible
                      accessibilityLabel={`${b.name}, ${t(`weekday.${d}`)}: ${
                        s
                          ? `${windowText(s)}, ${truckName(s.truckId)}, ${t(`waste.${s.wasteType}`)}`
                          : t('enro.schedules.none')
                      }`}
                    >
                      <AppText variant="caption" color={s ? colors.text : colors.textMuted}>
                        {s
                          ? `${smsTimeRange(atManilaTime(today, s.start), atManilaTime(today, s.windowEnd))} · ${truckCode(s.truckId)}`
                          : t('enro.schedules.none')}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Panel>
  ) : null;

  // ---------- Route cards ----------
  const routeCards = (
    <Panel title={t('enro.schedules.routes')}>
      {message ? (
        <AppText
          variant="bodyStrong"
          color={message.ok ? colors.green : colors.red}
          accessibilityLiveRegion="polite"
        >
          {message.text}
        </AppText>
      ) : null}
      {routes.map((r) => {
        const s = scheduleOn(schedules, r.id, todayKey);
        if (!s) return null;
        const upcoming = schedules.filter(
          (x) => x.routeId === r.id && x.validFrom && x.validFrom > todayKey,
        );
        return (
          <Card key={r.id}>
            <AppText variant="heading">
              {t('enro.schedules.routeTitle', {
                truck: truckName(s.truckId),
                barangays: routeNames(r),
              })}
            </AppText>
            <AppText>
              {t('enro.schedules.routeLine', { days: daysText(s.days), window: windowText(s) })}
            </AppText>
            <WasteBadge type={s.wasteType} />
            {upcoming.map((u) => (
              <AppText key={u.validFrom} variant="bodyStrong" color={colors.amber}>
                {t('enro.schedules.upcoming', {
                  day: formatDate(t, parseDateKey(u.validFrom!)),
                  days: daysText(u.days),
                  window: windowText(u),
                })}
              </AppText>
            ))}
            <Button
              variant="secondary"
              icon="calendar-edit"
              label={t('enro.schedules.edit')}
              onPress={() => startEdit(r.id)}
            />
          </Card>
        );
      })}
    </Panel>
  );

  // ---------- Holiday changes ----------
  const holidays = (
    <Panel title={t('enro.schedules.holidays')}>
      {exceptions
        .filter((e) => e.date >= todayKey)
        .map((e) => (
          <AppText key={`${e.date}-${String(e.routeIds)}`}>
            {e.action === 'move' && e.moveTo
              ? t('enro.schedules.holidayMove', {
                  date: formatDate(t, parseDateKey(e.date)),
                  reason: e.reason[language],
                  to: formatDate(t, parseDateKey(e.moveTo)),
                })
              : t('enro.schedules.holidayCancel', {
                  date: formatDate(t, parseDateKey(e.date)),
                  reason: e.reason[language],
                })}
          </AppText>
        ))}
    </Panel>
  );

  // ---------- Editor ----------
  let editor = null;
  if (mode.kind !== 'view' && draft) {
    const route = routes.find((r) => r.id === draft.routeId);
    const before = scheduleOn(schedules, draft.routeId, todayKey) as RouteSchedule;
    const errors = validateScheduleChange(draft, now);
    const conflicts = errors.length ? [] : scheduleConflicts(schedules, draft);
    const sameDays = [...draft.days].sort().join() === [...before.days].sort().join();
    const changed =
      !sameDays ||
      draft.start !== before.start ||
      draft.windowEnd !== before.windowEnd ||
      draft.truckId !== before.truckId ||
      draft.wasteType !== before.wasteType;
    const fromDay = parseDateKey(draft.from);
    const ids = route?.barangayIds ?? [];
    const people = ids.reduce(
      (sum, id) =>
        sum + (barangays?.features.find((f) => f.properties.id === id)?.properties.population ?? 0),
      0,
    );
    const numbers = ids.reduce((sum, id) => sum + (registrations[id] ?? 0), 0);
    const { month, day } = manilaParts(fromDay);
    const smsFor = (barangayId: string) =>
      sms.scheduleChange({
        barangay: nameOf(barangayId),
        from: smsDate(month, day),
        days: smsDays(draft.days),
        range: smsTimeRange(
          atManilaTime(fromDay, draft.start),
          atManilaTime(fromDay, draft.windowEnd),
        ),
      });
    const set = (patch: Partial<ScheduleChange>) => setDraft({ ...draft, ...patch });

    const save = async () => {
      setSaving(true);
      try {
        await services.schedule.updateRouteSchedule(draft);
        for (const id of ids) {
          await services.alerts.sendAnnouncement({ barangayIds: [id], text: smsFor(id) });
        }
        await queryClient.invalidateQueries({ queryKey: ['routeSchedules'] });
        setMessage({
          ok: true,
          text: t('enro.schedules.saved', { day: formatDate(t, fromDay), numbers }),
        });
        setMode({ kind: 'view' });
      } catch {
        setMessage({ ok: false, text: t('enro.schedules.failed') });
      } finally {
        setSaving(false);
      }
    };

    editor =
      mode.kind === 'edit' ? (
        <Panel title={t('enro.schedules.editTitle', { barangays: routeNames(route) })}>
          <AppText variant="label">{t('enro.schedules.days')}</AppText>
          <View style={styles.chips}>
            {WEEK.map((d) => (
              <Chip
                key={d}
                label={t(`weekday.${d}`)}
                selected={draft.days.includes(d)}
                onPress={() =>
                  set({
                    days: draft.days.includes(d)
                      ? draft.days.filter((x) => x !== d)
                      : [...draft.days, d],
                  })
                }
              />
            ))}
          </View>
          <View style={styles.times}>
            <View style={styles.time}>
              <TextField
                label={t('enro.schedules.start')}
                hint={t('enro.schedules.timeHint')}
                value={draft.start}
                onChangeText={(v) => set({ start: v.trim() })}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.time}>
              <TextField
                label={t('enro.schedules.end')}
                hint={t('enro.schedules.timeHint')}
                value={draft.windowEnd}
                onChangeText={(v) => set({ windowEnd: v.trim() })}
                autoCapitalize="none"
              />
            </View>
          </View>
          <AppText variant="label">{t('enro.schedules.truck')}</AppText>
          <View style={styles.chips}>
            {trucks.map((tr) => (
              <Chip
                key={tr.id}
                label={tr.name}
                selected={draft.truckId === tr.id}
                onPress={() => set({ truckId: tr.id })}
              />
            ))}
          </View>
          <AppText variant="label">{t('enro.schedules.waste')}</AppText>
          <View style={styles.chips}>
            {WASTE_TYPES.map((w) => (
              <Chip
                key={w}
                label={t(`waste.${w}`)}
                selected={draft.wasteType === w}
                onPress={() => set({ wasteType: w })}
              />
            ))}
          </View>
          <AppText variant="label">{t('enro.schedules.from')}</AppText>
          <View style={styles.chips}>
            {Array.from({ length: FROM_CHOICES }, (_, i) => today + (i + 1) * DAY).map((d) => (
              <Chip
                key={d}
                label={formatDate(t, d)}
                selected={draft.from === manilaDateKey(d)}
                onPress={() => set({ from: manilaDateKey(d) })}
              />
            ))}
          </View>
          {errors.map((e) => (
            <AppText key={e} color={colors.red}>
              {t(`enro.schedules.errors.${e}`)}
            </AppText>
          ))}
          {conflicts.map((c) => (
            <AppText key={c.routeId} color={colors.red}>
              {t('enro.schedules.conflict', {
                truck: truckName(draft.truckId),
                barangays: routeNames(routes.find((r) => r.id === c.routeId)),
                days: daysText(c.days),
              })}
            </AppText>
          ))}
          {!errors.length && !conflicts.length && !changed ? (
            <AppText color={colors.textMuted}>{t('enro.schedules.noChange')}</AppText>
          ) : null}
          <View style={styles.actions}>
            <Button
              icon="eye-check-outline"
              label={t('enro.schedules.review')}
              disabled={errors.length > 0 || conflicts.length > 0 || !changed}
              onPress={() => setMode({ kind: 'review', routeId: draft.routeId })}
            />
            <Button
              variant="secondary"
              label={t('enro.schedules.cancel')}
              onPress={() => setMode({ kind: 'view' })}
            />
          </View>
        </Panel>
      ) : (
        <Panel title={t('enro.schedules.reviewTitle')}>
          <AppText variant="heading">{routeNames(route)}</AppText>
          {!sameDays ? (
            <AppText>
              {t('enro.schedules.changeDays', {
                from: daysText(before.days),
                to: daysText(draft.days),
              })}
            </AppText>
          ) : null}
          {draft.start !== before.start || draft.windowEnd !== before.windowEnd ? (
            <AppText>
              {t('enro.schedules.changeWindow', {
                from: windowText(before),
                to: windowText(draft),
              })}
            </AppText>
          ) : null}
          {draft.truckId !== before.truckId ? (
            <AppText>
              {t('enro.schedules.changeTruck', {
                from: truckName(before.truckId),
                to: truckName(draft.truckId),
              })}
            </AppText>
          ) : null}
          {draft.wasteType !== before.wasteType ? (
            <AppText>
              {t('enro.schedules.changeWaste', {
                from: t(`waste.${before.wasteType}`),
                to: t(`waste.${draft.wasteType}`),
              })}
            </AppText>
          ) : null}
          <AppText variant="bodyStrong">
            {t('enro.schedules.changeFrom', { day: formatDate(t, fromDay) })}
          </AppText>
          <AppText>{t('enro.schedules.affected', { barangays: routeNames(route) })}</AppText>
          <AppText variant="bodyStrong">
            {t('enro.schedules.affectedPeople', {
              people: people.toLocaleString('en-PH'),
              numbers: numbers.toLocaleString('en-PH'),
            })}
          </AppText>
          <AppText variant="label">{t('enro.schedules.smsPreview')}</AppText>
          {ids.slice(0, 1).map((id) => (
            <View key={id} style={styles.preview}>
              <SmsBubble text={smsFor(id)} />
              <AppText variant="label" color={colors.textMuted}>
                {t('enro.schedules.smsSegments', { segments: smsInfo(smsFor(id)).segments })}
              </AppText>
            </View>
          ))}
          <View style={styles.actions}>
            <Button
              variant="success"
              icon="send"
              label={saving ? t('enro.schedules.saving') : t('enro.schedules.save')}
              disabled={saving}
              onPress={() => void save()}
            />
            <Button
              variant="secondary"
              label={t('enro.schedules.back')}
              disabled={saving}
              onPress={() => setMode({ kind: 'edit', routeId: draft.routeId })}
            />
          </View>
        </Panel>
      );
  }

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.schedules.title')}
        </AppText>
        <AppText color={colors.textMuted}>{t('enro.schedules.subtitle')}</AppText>
        <SampleDataBadge />
      </View>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.colWide}>
            {grid}
            {holidays}
          </View>
          <View style={styles.col}>
            {editor}
            {routeCards}
          </View>
        </View>
      ) : (
        <>
          {editor}
          {grid}
          {routeCards}
          {holidays}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  colWide: { flex: 3, minWidth: 0, gap: spacing.lg },
  col: { flex: 2, minWidth: 0, gap: spacing.lg },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  gridHead: { fontFamily: fonts.bold },
  gridName: { width: 130, paddingVertical: spacing.sm, paddingRight: spacing.sm },
  gridCell: {
    width: 92,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    justifyContent: 'center',
  },
  gridOn: { backgroundColor: colors.greenSoft, borderRadius: radius.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  time: { flexGrow: 1, flexBasis: 160 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: { gap: spacing.xs },
});
