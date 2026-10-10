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
import type { PressState } from '@/components/ui/interaction';
import { useNarrow } from '@/components/ui/narrow';
import { Notice } from '@/components/ui/Notice';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
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
import { randomUuid } from '@/lib/uuid';
import { OfflineError, ServerError, services } from '@/services';
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
import { goBack } from '@/lib/navigation';

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
  const narrow = useNarrow();
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
  /** Why the server refused the report (its short reason), shown on the review step. */
  const [refused, setRefused] = useState<string | null>(null);
  // One reference per report, made when it is written: sending it again files it only once.
  const [clientRef, setClientRef] = useState(randomUuid);

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
    setRefused(null);
    setClientRef(randomUuid());
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
        ) : (
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/resident')}
          />
        )
      }
      actions={
        <>
          <IconButton
            icon="map-marker-remove"
            label={t('resident.home.actions.missed')}
            onPress={() => router.push('/resident/missed')}
          />
          <IconButton
            icon="clipboard-list-outline"
            label={t('reports.mine.title')}
            onPress={() => router.push('/resident/reports')}
          />
        </>
      }
    />
  );

  if (!barangays || !meta) {
    return (
      <Screen header={header}>
        <SkeletonGroup>
          <Skeleton height={8} round={radius.pill} />
          <Skeleton height={72} round={radius.lg} />
          <Skeleton height={72} round={radius.lg} />
          <Skeleton height={72} round={radius.lg} />
          <Skeleton height={72} round={radius.lg} />
        </SkeletonGroup>
      </Screen>
    );
  }

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
      clientRef,
    };
    setSending(true);
    setRefused(null);
    try {
      const ticket = await services.reports.submit(report);
      addTicket(ticket.id);
      markSeen(ticket.id, ticket.history.length);
      setSent(ticket);
      setStep('done');
    } catch (e) {
      if (e instanceof OfflineError) {
        // No signal: keep it on the phone and send it when signal returns.
        queue(report, now);
        setSent(null);
        setStep('done');
      } else if (e instanceof ServerError) {
        // The server answered and refused: stay here and say why.
        setRefused(e.code);
      } else {
        throw e;
      }
    } finally {
      setSending(false);
    }
  };

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
      <Screen
        header={header}
        footer={
          <>
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
              variant={sent ? 'ghost' : 'primary'}
              icon="camera-plus-outline"
              label={t('reports.done.another')}
              onPress={reset}
            />
          </>
        }
      >
        <Card
          variant={sent ? 'mint' : 'elevated'}
          style={sent ? styles.done : [styles.done, styles.saved]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.doneIcon}>
            <Icon
              name={sent ? 'check-circle' : 'cloud-upload-outline'}
              size={56}
              color={sent ? colors.primary : colors.ink}
            />
          </View>
          <AppText variant="title" color={sent ? colors.primary : colors.ink} style={styles.center}>
            {sent ? t('reports.done.title') : t('reports.mine.pending')}
          </AppText>
          {sent ? (
            <>
              <View style={styles.ticket}>
                <AppText variant="label" color={colors.textMuted}>
                  {t('reports.done.ticket')}
                </AppText>
                <AppText variant="title" selectable style={styles.center}>
                  {sent.id}
                </AppText>
              </View>
              <View style={styles.ticket}>
                <AppText variant="label" color={colors.textMuted}>
                  {t('reports.done.target')}
                </AppText>
                <AppText variant="bodyStrong" style={styles.center}>
                  {targetText}
                </AppText>
              </View>
            </>
          ) : (
            <AppText style={styles.center}>{t('reports.wizard.offlineSaved')}</AppText>
          )}
        </Card>
      </Screen>
    );
  }

  const footer =
    step === 2 ? (
      <Button
        icon="arrow-right"
        label={t('reports.wizard.next')}
        disabled={!wide}
        onPress={toWhere}
      />
    ) : step === 3 ? (
      <Button
        icon="arrow-right"
        label={t('reports.wizard.next')}
        disabled={!point || !here}
        onPress={() => setStep(4)}
      />
    ) : step === 4 ? (
      <Button
        icon="send"
        label={sending ? t('reports.wizard.sending') : t('reports.wizard.send')}
        loading={sending}
        onPress={() => void submit()}
      />
    ) : undefined;

  return (
    <Screen header={header} footer={footer}>
      <StepIndicator current={step} total={4} />

      {category === 'BURNING' && step > 1 ? (
        <Notice tone="danger" icon="fire" text={t('reports.wizard.burningWarning')} />
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
                variant="ghost"
                icon="arrow-left"
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
                style={({ pressed, hovered }: PressState) => [
                  styles.emergency,
                  { opacity: pressed ? 0.8 : hovered ? 0.92 : 1 },
                ]}
              >
                {narrow ? null : <Icon name="alert-octagon" size={32} color={colors.textOnDark} />}
                <View style={styles.flex}>
                  <AppText variant={narrow ? 'bodyStrong' : 'heading'} color={colors.textOnDark}>
                    {t('reports.wizard.emergency')}
                  </AppText>
                  <AppText variant="label" color={colors.textOnDark}>
                    {t('reports.wizard.emergencyHint')}
                  </AppText>
                </View>
                {narrow ? null : <Icon name="chevron-right" size={26} color={colors.textOnDark} />}
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
          {/* The viewfinder of the design: the photo once taken, or what to aim at. */}
          <View style={styles.finder}>
            {wide ? (
              <PhotoView photo={wide} accessibilityLabel={t('reports.wizard.photoWide')} />
            ) : (
              <View style={styles.finderEmpty}>
                <Icon name="camera" size={44} color={colors.ink} />
                <AppText variant="bodyStrong" color={colors.ink} style={styles.center}>
                  {t('reports.photo.guide.wide.title')}
                </AppText>
                <AppText variant="label" color={colors.textMuted} style={styles.center}>
                  {t('reports.photo.guide.wide.hint')}
                </AppText>
              </View>
            )}
          </View>
          <PhotoCapture
            guide="wide"
            showGuide={false}
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
                <View style={styles.finder}>
                  <PhotoView photo={close} accessibilityLabel={t('reports.wizard.photoClose')} />
                </View>
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
            <Button
              variant="ghost"
              label={t('reports.wizard.noCamera')}
              onPress={() => {
                setNoPhoto(true);
                toWhere();
              }}
            />
          )}
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
        </Section>
      ) : null}

      {step === 4 && category && point ? (
        <Section title={t('reports.wizard.reviewTitle')}>
          <Card>
            <View style={styles.row}>
              <View style={styles.reviewIcon}>
                <Icon name={CATEGORY_META[category].icon} size={26} color={colors.ink} />
              </View>
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
            <View style={styles.row}>
              <Icon name="map-marker" size={22} color={colors.ink} />
              <AppText style={styles.flex}>
                {here ? t('reports.wizard.inBarangay', { barangay: here.properties.name }) : ''}
                {landmark ? ` · ${landmark}` : ''}
              </AppText>
            </View>
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
          {refused ? (
            <Notice
              tone="danger"
              live="assertive"
              text={t(`reports.refused.${refused}`, { defaultValue: t('reports.refused.other') })}
            />
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
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
  finder: {
    borderRadius: radius.md + 3,
    borderWidth: 3,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  finderEmpty: {
    aspectRatio: 4 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.mintSoft,
  },
  reviewIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: { alignItems: 'center', paddingVertical: spacing.xl },
  saved: { backgroundColor: colors.yellowSoft, borderColor: colors.yellow },
  doneIcon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticket: { alignItems: 'center', gap: 2 },
  thumbs: { flexDirection: 'row', gap: spacing.sm },
  thumb: { width: 120 },
});
