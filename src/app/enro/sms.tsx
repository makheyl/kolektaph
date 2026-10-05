import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { SmsBubble } from '@/components/ui/SmsBubble';
import { TextField } from '@/components/ui/TextField';
import { useStaffRights } from '@/features/admin/hooks';
import { ALERT_META } from '@/features/alerts/alertMeta';
import { smsInfo } from '@/features/alerts/sms';
import { Panel } from '@/features/enro/components/Panel';
import { percent } from '@/features/enro/format';
import { formatRelativeDay } from '@/features/resident/format';
import {
  useAlerts,
  useBarangays,
  useSimNow,
  useSmsRegistrations,
  useTruckStates,
} from '@/features/tracking/hooks';
import { formatClock, manilaStartOfDay, MINUTE } from '@/lib/time';
import { services } from '@/services';
import type { OutboundAlert } from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

const TWO_COLUMNS = 1200;
const OUTBOX_LIMIT = 60;
const TEMPLATES = ['tplCustom', 'tplTyphoon', 'tplCleanup', 'tplSegregation'] as const;
const TEMPLATE_TEXT: Record<(typeof TEMPLATES)[number], string | null> = {
  tplCustom: null,
  tplTyphoon: 'enro.sms.typhoon',
  tplCleanup: 'enro.sms.cleanup',
  tplSegregation: 'enro.sms.segregation',
};
type Filter = 'all' | 'auto' | 'manual';

/** SMS center: write announcements to chosen barangays, and see every SMS that went out. */
export default function SmsCenter() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;
  const now = useSimNow(5000);
  const alerts = useAlerts();
  const states = useTruckStates();
  const { data: barangays } = useBarangays();
  const { data: registrations = {} } = useSmsRegistrations();
  const rights = useStaffRights();

  const [targets, setTargets] = useState<string[]>([]);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]>('tplCustom');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const ids = barangays?.features.map((f) => f.properties.id) ?? [];
  const nameOf = (id: string) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const allSelected = targets.length === ids.length && ids.length > 0;
  const toggle = (id: string) =>
    setTargets((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const info = smsInfo(text);
  const capacity =
    info.encoding === 'GSM-7'
      ? info.segments === 1
        ? 160
        : info.segments * 153
      : info.segments === 1
        ? 70
        : info.segments * 67;
  const numbers = targets.reduce((sum, b) => sum + (registrations[b] ?? 0), 0);

  const trySend = () => {
    if (!targets.length) return setError(t('enro.sms.pickTarget'));
    if (!text.trim()) return setError(t('enro.sms.emptyMessage'));
    setError(null);
    setConfirming(true);
  };
  const send = async () => {
    try {
      const sent = await services.alerts.sendAnnouncement({
        barangayIds: targets,
        text: text.trim(),
      });
      setSentAt(sent.sentAt);
      setText('');
      setTemplate('tplCustom');
    } catch {
      setError(t('enro.notSaved'));
    } finally {
      setConfirming(false);
    }
  };

  // "Did the text arrive before the truck?" for today's 15-minute alerts.
  const today = manilaStartOfDay(now);
  const arrivalOf = (a: OutboundAlert) =>
    a.kind === 'vicinity' && a.truckId && a.sentAt >= today
      ? (states.find((s) => s.truckId === a.truckId)?.visits[a.barangayIds[0]]?.startedAt ?? null)
      : null;
  const todaysVicinity = alerts.filter((a) => a.kind === 'vicinity' && a.sentAt >= today);
  const arrived = todaysVicinity.map(arrivalOf).filter((x): x is number => x != null);
  const beforeTruck = todaysVicinity.filter((a) => {
    const at = arrivalOf(a);
    return at != null && at >= a.sentAt;
  }).length;

  const shown = alerts
    .filter((a) => filter === 'all' || (filter === 'manual') === (a.kind === 'announcement'))
    .slice(0, OUTBOX_LIMIT);

  const compose = (
    <Panel title={t('enro.sms.composeTitle')}>
      <AppText variant="label">{t('enro.sms.to')}</AppText>
      <View style={styles.chips}>
        <Chip
          label={t('enro.sms.all')}
          selected={allSelected}
          onPress={() => setTargets(allSelected ? [] : ids)}
        />
        {ids.map((id) => (
          <Chip
            key={id}
            label={nameOf(id)}
            selected={targets.includes(id)}
            onPress={() => toggle(id)}
          />
        ))}
      </View>

      <AppText variant="label">{t('enro.sms.templates')}</AppText>
      <View style={styles.chips}>
        {TEMPLATES.map((tpl) => (
          <Chip
            key={tpl}
            label={t(`enro.sms.${tpl}`)}
            selected={template === tpl}
            onPress={() => {
              setTemplate(tpl);
              const key = TEMPLATE_TEXT[tpl];
              setText(key ? t(key) : '');
            }}
          />
        ))}
      </View>

      <TextField
        label={t('enro.sms.message')}
        hint={t('enro.sms.messageHint')}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setSentAt(null);
        }}
        multiline
        maxLength={480}
        error={error}
      />
      <AppText
        variant="label"
        color={info.segments > 1 ? colors.amber : colors.textMuted}
        accessibilityLiveRegion="polite"
      >
        {t('enro.sms.counter', {
          units: info.units,
          capacity,
          segments: info.segments,
          encoding: info.encoding,
        })}
      </AppText>
      {info.encoding === 'UCS-2' ? (
        <AppText variant="label" color={colors.amber}>
          {t('enro.sms.ucsWarning')}
        </AppText>
      ) : null}
      {text ? <SmsBubble text={text} /> : null}
      <AppText variant="bodyStrong">
        {t('enro.sms.recipients', {
          count: numbers.toLocaleString('en-PH'),
          total: (numbers * info.segments).toLocaleString('en-PH'),
        })}
      </AppText>

      {!rights.act ? (
        <AppText color={colors.textMuted}>{t('enro.viewOnly')}</AppText>
      ) : confirming ? (
        <View style={styles.confirm} accessibilityLiveRegion="polite">
          <AppText variant="heading">
            {t('enro.sms.confirmTitle', { count: numbers.toLocaleString('en-PH') })}
          </AppText>
          <AppText>{t('enro.sms.confirmBody')}</AppText>
          <Button variant="success" icon="send" label={t('enro.sms.confirm')} onPress={send} />
          <Button
            variant="secondary"
            label={t('common.cancel')}
            onPress={() => setConfirming(false)}
          />
        </View>
      ) : (
        <Button variant="primary" icon="send" label={t('enro.sms.send')} onPress={trySend} />
      )}
      {sentAt ? (
        <AppText variant="bodyStrong" color={colors.green} accessibilityLiveRegion="polite">
          {t('enro.sms.sent', { time: formatClock(sentAt) })}
        </AppText>
      ) : null}
    </Panel>
  );

  const outbox = (
    <Panel title={t('enro.sms.outboxTitle')}>
      {todaysVicinity.length ? (
        <AppText variant="bodyStrong" color={colors.green}>
          {t('enro.sms.beforeTruckKpi', {
            pct: percent(arrived.length ? beforeTruck / arrived.length : 1),
          })}
        </AppText>
      ) : null}
      <View style={styles.chips}>
        <Chip
          label={t('enro.sms.filterAll')}
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={t('enro.sms.filterAuto')}
          selected={filter === 'auto'}
          onPress={() => setFilter('auto')}
        />
        <Chip
          label={t('enro.sms.filterManual')}
          selected={filter === 'manual'}
          onPress={() => setFilter('manual')}
        />
      </View>
      {shown.length === 0 ? (
        <AppText color={colors.textMuted}>{t('enro.sms.outboxEmpty')}</AppText>
      ) : null}
      {shown.map((a) => {
        const meta = ALERT_META[a.kind];
        const arrival = arrivalOf(a);
        return (
          <View key={a.id} style={styles.outRow}>
            <View style={styles.outHead}>
              <View style={[styles.outIcon, { backgroundColor: meta.soft }]}>
                <Icon name={meta.icon} size={20} color={meta.color} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{t(`alert.kind.${a.kind}`)}</AppText>
                <AppText variant="label" color={colors.textMuted}>
                  {formatRelativeDay(t, a.sentAt, now)} · {formatClock(a.sentAt)}
                </AppText>
              </View>
            </View>
            <AppText variant="label" color={colors.textMuted}>
              {t('enro.sms.sentTo', {
                barangays:
                  a.barangayIds.length === ids.length
                    ? t('enro.sms.all')
                    : a.barangayIds.map(nameOf).join(', '),
                count: a.recipients.toLocaleString('en-PH'),
                segments: a.segments,
              })}
            </AppText>
            <SmsBubble text={a.text} />
            {a.kind === 'vicinity' && a.sentAt >= today ? (
              <AppText
                variant="label"
                color={arrival != null && arrival >= a.sentAt ? colors.green : colors.textMuted}
              >
                {arrival == null
                  ? t('enro.sms.awaiting')
                  : arrival >= a.sentAt
                    ? t('enro.sms.arrived', {
                        time: formatClock(arrival),
                        minutes: Math.round((arrival - a.sentAt) / MINUTE),
                      })
                    : t('enro.sms.arrivedEarly', { time: formatClock(arrival) })}
              </AppText>
            ) : null}
          </View>
        );
      })}
    </Panel>
  );

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.sms.title')}
        </AppText>
        <SampleDataBadge />
      </View>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.col}>{compose}</View>
          <View style={styles.col}>{outbox}</View>
        </View>
      ) : (
        <>
          {compose}
          {outbox}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  confirm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.navy,
    backgroundColor: colors.greySoft,
  },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  outRow: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.greySoft,
  },
  outHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  outIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
