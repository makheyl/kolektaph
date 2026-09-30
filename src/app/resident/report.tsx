import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { PhotoCapture } from '@/components/photos/PhotoCapture';
import { PhotoView } from '@/components/photos/PhotoView';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { TextField } from '@/components/ui/TextField';
import {
  CATEGORY_META,
  EMERGENCY_CATEGORIES,
  RESIDENT_CATEGORIES,
  responseDue,
} from '@/features/reports/categories';
import { LocationPicker } from '@/features/reports/components/LocationPicker';
import { CategoryTile } from '@/features/reports/components/TicketBits';
import { formatRelativeDay } from '@/features/resident/format';
import { useBarangays, useCityMeta, useSimNow } from '@/features/tracking/hooks';
import { barangayAt } from '@/lib/geo';
import { maskPhMobile } from '@/lib/phone';
import { formatClock } from '@/lib/time';
import { OfflineError, services } from '@/services';
import type {
  LngLat,
  NewReport,
  PhotoRef,
  ReportCategory,
  ReportSize,
  Ticket,
} from '@/services/types';
import { useMyReports } from '@/stores/myReports';
import { useSettings } from '@/stores/settings';
import { colors, radius, spacing, touch } from '@/theme/tokens';

type Step = 1 | 2 | 3 | 4 | 'done';
const SIZES: ReportSize[] = ['bags', 'pile', 'truckload'];

/** `?category=MISSED` (from "Hindi nadaanan") starts at the photo step with that category. */
export default function ReportScreen() {
  const { category } = useLocalSearchParams<{ category?: ReportCategory }>();
  return <ReportWizard key={category ?? 'new'} preset={category ?? null} />;
}

/**
 * Snap & Report (HAKOT §6.2) in four short steps: what → photo → where → review. Target: a
 * first-time resident sends a report in 60 seconds or less.
 */
function ReportWizard({ preset }: { preset: ReportCategory | null }) {
  const { t } = useTranslation();
  const now = useSimNow(30_000);
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const { barangayId, sms } = useSettings();
  const addTicket = useMyReports((s) => s.addTicket);
  const markSeen = useMyReports((s) => s.markSeen);
  const queue = useMyReports((s) => s.queue);

  const [step, setStep] = useState<Step>(preset ? 2 : 1);
  const [emergency, setEmergency] = useState(false);
  const [category, setCategory] = useState<ReportCategory | null>(preset);
  const [wide, setWide] = useState<PhotoRef | null>(null);
  const [close, setClose] = useState<PhotoRef | null>(null);
  const [noPhoto, setNoPhoto] = useState(false);
  const [point, setPoint] = useState<LngLat | null>(null);
  /** The pin is still the default (barangay centre), not a GPS fix or the resident's choice. */
  const [pinIsDefault, setPinIsDefault] = useState(true);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [landmark, setLandmark] = useState('');
  const [nearWaterway, setNearWaterway] = useState(false);
  const [nearSensitive, setNearSensitive] = useState(false);
  const [size, setSize] = useState<ReportSize>('bags');
  const [note, setNote] = useState('');
  const [textMe, setTextMe] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Ticket | null>(null);

  const reset = () => {
    setStep(1);
    setEmergency(false);
    setCategory(null);
    setWide(null);
    setClose(null);
    setNoPhoto(false);
    setPoint(null);
    setPinIsDefault(true);
    setAccuracy(null);
    setLandmark('');
    setNearWaterway(false);
    setNearSensitive(false);
    setSize('bags');
    setNote('');
    setSent(null);
  };

  if (!barangays || !meta) return <Screen>{null}</Screen>;

  const fallback: LngLat =
    barangays.features.find((f) => f.properties.id === barangayId)?.properties.labelPoint ??
    meta.center;
  const here = point ? barangayAt(point, barangays) : null;
  /** Step 3 starts with the pin on the resident's barangay, so nobody is stuck without GPS. */
  const toWhere = () => {
    setPoint((p) => p ?? fallback);
    setStep(3);
  };
  const pickCategory = (c: ReportCategory) => {
    setCategory(c);
    if (c === 'WATERWAY') setNearWaterway(true);
    setStep(2);
  };

  const submit = async () => {
    if (!category || !point) return;
    const report: NewReport = {
      category,
      size,
      photos: [wide, close].filter((p): p is PhotoRef => p != null),
      location: point,
      accuracyM: accuracy,
      landmark: landmark.trim(),
      nearWaterway,
      nearSensitive,
      note: note.trim(),
      contact: sms && textMe ? sms.mobile : null,
    };
    setSending(true);
    try {
      const ticket = await services.reports.submit(report);
      addTicket(ticket.id);
      markSeen(ticket.id, ticket.history.length);
      setSent(ticket);
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      queue(report, now);
      setSent(null);
    } finally {
      setSending(false);
      setStep('done');
    }
  };

  const header = (
    <AppHeader
      title={t('reports.wizard.title')}
      leading={
        typeof step === 'number' && step > 1 ? (
          <IconButton
            icon="arrow-left"
            label={t('reports.wizard.back')}
            onPress={() => setStep((step - 1) as Step)}
          />
        ) : undefined
      }
      actions={
        <IconButton
          icon="clipboard-list-outline"
          label={t('reports.mine.title')}
          onPress={() => router.push('/resident/reports')}
        />
      }
    />
  );

  if (step === 'done') {
    const due = sent ? responseDue(sent.category, sent.createdAt) : null;
    const target = sent ? CATEGORY_META[sent.category].target : null;
    const targetText =
      !target || !sent
        ? ''
        : target.kind === 'hours' && due
          ? t('reports.done.targetHours', {
              hours: target.hours,
              time: `${formatRelativeDay(t, due, now)}, ${formatClock(due)}`,
            })
          : target.kind === 'next_working_day' && due
            ? t('reports.done.targetNextDay', { day: formatRelativeDay(t, due, now) })
            : target.kind === 'same_day'
              ? t('reports.done.targetSameDay')
              : t('reports.done.targetBooked');
    return (
      <Screen>
        {header}
        <Card style={sent ? styles.success : styles.saved} accessibilityLiveRegion="polite">
          <Icon
            name={sent ? 'check-circle' : 'cloud-upload-outline'}
            size={44}
            color={sent ? colors.green : colors.navy}
          />
          <AppText variant="title">
            {sent ? t('reports.done.title') : t('reports.mine.pending')}
          </AppText>
          {sent ? (
            <>
              <AppText variant="label" color={colors.textMuted}>
                {t('reports.done.ticket')}
              </AppText>
              <AppText variant="display" selectable>
                {sent.id}
              </AppText>
              <AppText variant="label" color={colors.textMuted}>
                {t('reports.done.target')}
              </AppText>
              <AppText variant="bodyStrong">{targetText}</AppText>
            </>
          ) : (
            <AppText>{t('reports.wizard.offlineSaved')}</AppText>
          )}
        </Card>
        {sent ? (
          <Button
            icon="file-document-outline"
            label={t('reports.done.track')}
            onPress={() =>
              router.push({ pathname: '/resident/reports/[id]', params: { id: sent.id } })
            }
          />
        ) : null}
        <Button
          variant="secondary"
          icon="camera-plus-outline"
          label={t('reports.done.another')}
          onPress={reset}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <StepIndicator current={step} total={4} />

      {category === 'BURNING' && step > 1 ? (
        <Card style={styles.warn}>
          <View style={styles.row}>
            <Icon name="fire" size={24} color={colors.red} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {t('reports.wizard.burningWarning')}
            </AppText>
          </View>
        </Card>
      ) : null}

      {step === 1 ? (
        <Section
          title={emergency ? t('reports.wizard.emergencyTitle') : t('reports.wizard.whatTitle')}
        >
          {emergency ? (
            <>
              {EMERGENCY_CATEGORIES.map((c) => (
                <CategoryTile key={c} category={c} emergency onPress={() => pickCategory(c)} />
              ))}
              <Button
                variant="secondary"
                label={t('reports.wizard.back')}
                onPress={() => setEmergency(false)}
              />
            </>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('reports.wizard.emergency')}. ${t('reports.wizard.emergencyHint')}`}
                onPress={() => setEmergency(true)}
                style={({ pressed }) => [styles.emergency, pressed && { opacity: 0.85 }]}
              >
                <Icon name="alert-octagon" size={32} color={colors.textOnDark} />
                <View style={styles.flex}>
                  <AppText variant="heading" color={colors.textOnDark}>
                    {t('reports.wizard.emergency')}
                  </AppText>
                  <AppText variant="label" color={colors.textOnDark}>
                    {t('reports.wizard.emergencyHint')}
                  </AppText>
                </View>
              </Pressable>
              {RESIDENT_CATEGORIES.map((c) => (
                <CategoryTile key={c} category={c} onPress={() => pickCategory(c)} />
              ))}
            </>
          )}
        </Section>
      ) : null}

      {step === 2 && category ? (
        <Section title={t('reports.wizard.photoTitle')}>
          {wide ? (
            <PhotoView photo={wide} accessibilityLabel={t('reports.wizard.photoWide')} />
          ) : null}
          <PhotoCapture
            guide="wide"
            label={wide ? t('reports.wizard.retake') : t('reports.wizard.photoWide')}
            variant={wide ? 'secondary' : 'primary'}
            sample={CATEGORY_META[category].sample}
            onCaptured={(p) => {
              setWide(p);
              setNoPhoto(false);
            }}
          />
          {wide ? (
            <>
              {close ? (
                <PhotoView photo={close} accessibilityLabel={t('reports.wizard.photoClose')} />
              ) : null}
              <PhotoCapture
                guide="close"
                label={close ? t('reports.wizard.retake') : t('reports.wizard.photoClose')}
                variant="secondary"
                sample={CATEGORY_META[category].sample}
                onCaptured={setClose}
              />
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNoPhoto(true);
                toWhere();
              }}
              style={styles.link}
            >
              <AppText variant="label" color={colors.navy} style={styles.underline}>
                {t('reports.wizard.noCamera')}
              </AppText>
            </Pressable>
          )}
          <Button
            icon="arrow-right"
            label={t('reports.wizard.next')}
            disabled={!wide}
            onPress={toWhere}
          />
        </Section>
      ) : null}

      {step === 3 ? (
        <Section title={t('reports.wizard.whereTitle')}>
          <LocationPicker
            barangays={barangays}
            meta={meta}
            fallback={fallback}
            value={point}
            autoLocate={pinIsDefault}
            onChange={(p, acc) => {
              setPoint(p);
              setAccuracy(acc);
              setPinIsDefault(false);
            }}
          />
          <TextField
            label={t('reports.wizard.landmark')}
            placeholder={t('reports.wizard.landmarkPlaceholder')}
            value={landmark}
            onChangeText={setLandmark}
            maxLength={120}
          />
          {category !== 'WATERWAY' ? (
            <Checkbox
              checked={nearWaterway}
              onChange={setNearWaterway}
              label={t('reports.wizard.nearWaterway')}
            />
          ) : null}
          <Checkbox
            checked={nearSensitive}
            onChange={setNearSensitive}
            label={t('reports.wizard.nearSensitive')}
          />
          <Button
            icon="arrow-right"
            label={t('reports.wizard.next')}
            disabled={!point || !here}
            onPress={() => setStep(4)}
          />
        </Section>
      ) : null}

      {step === 4 && category && point ? (
        <Section title={t('reports.wizard.reviewTitle')}>
          <Card>
            <View style={styles.row}>
              <Icon name={CATEGORY_META[category].icon} size={26} color={colors.navy} />
              <AppText variant="heading" style={styles.flex}>
                {t(`reports.category.${category}`)}
              </AppText>
            </View>
            <View style={styles.thumbs}>
              {[wide, close].map((p, i) =>
                p ? (
                  <View key={i} style={styles.thumb}>
                    <PhotoView photo={p} accessibilityLabel="" />
                  </View>
                ) : null,
              )}
            </View>
            {noPhoto && !wide ? (
              <AppText color={colors.amber}>{t('reports.wizard.noPhotoNote')}</AppText>
            ) : null}
            <AppText>
              {here ? t('reports.wizard.inBarangay', { barangay: here.properties.name }) : ''}
              {landmark ? ` · ${landmark}` : ''}
            </AppText>
          </Card>
          <AppText variant="bodyStrong">{t('reports.wizard.howBig')}</AppText>
          <View style={styles.chips}>
            {SIZES.map((s) => (
              <Chip
                key={s}
                label={t(`reports.size.${s}`)}
                selected={size === s}
                onPress={() => setSize(s)}
              />
            ))}
          </View>
          <TextField
            label={t('reports.wizard.note')}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={280}
          />
          {sms ? (
            <Checkbox
              checked={textMe}
              onChange={setTextMe}
              label={`${t('reports.wizard.contact')} (${maskPhMobile(sms.mobile)})`}
            />
          ) : null}
          <AppText variant="caption" color={colors.textMuted}>
            {t('reports.wizard.privacy')}
          </AppText>
          <Button
            icon="send"
            variant="success"
            label={sending ? t('reports.wizard.sending') : t('reports.wizard.send')}
            disabled={sending}
            onPress={() => void submit()}
          />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emergency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.driver,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.red,
  },
  warn: { backgroundColor: colors.redSoft, borderColor: colors.red },
  success: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.green,
    alignItems: 'flex-start',
  },
  saved: {
    backgroundColor: colors.yellowSoft,
    borderColor: colors.yellow,
    alignItems: 'flex-start',
  },
  thumbs: { flexDirection: 'row', gap: spacing.sm },
  thumb: { width: 120 },
  link: { minHeight: touch.min, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
});
