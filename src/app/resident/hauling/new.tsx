import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { PhFlag } from '@/components/brand/Brand';
import { PhotoCapture } from '@/components/photos/PhotoCapture';
import { PhotoView } from '@/components/photos/PhotoView';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import type { PressState } from '@/components/ui/interaction';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useAccount } from '@/features/account/hooks';
import { OptionTile, VOLUME_ICONS } from '@/features/hauling/components/HaulingBits';
import { LocationPicker } from '@/features/reports/components/LocationPicker';
import { formatDate } from '@/features/resident/format';
import { useBarangays, useCityMeta, useSimNow } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { normalizePhMobile } from '@/lib/phone';
import { DAY, manilaParts, manilaStartOfDay } from '@/lib/time';
import { randomUuid } from '@/lib/uuid';
import { OfflineError, services } from '@/services';
import type {
  HaulingLoadType,
  HaulingRequest,
  HaulingRequester,
  HaulingSlot,
  HaulingVolume,
  LngLat,
  PhotoRef,
} from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, fonts, radius, spacing, touch } from '@/theme/tokens';

const VOLUMES: HaulingVolume[] = ['small', 'medium', 'large', 'unsure'];
const LOADS: HaulingLoadType[] = ['garden', 'construction', 'furniture', 'appliances', 'general'];
const SLOTS: HaulingSlot[] = ['morning', 'afternoon'];
/** A pickup can be asked for from tomorrow, up to two weeks ahead. */
const DAYS_AHEAD = 14;
const MAX_PHOTOS = 3;

type Field = 'business' | 'name' | 'mobile' | 'day' | 'load';

/** Ask the City to haul something the regular collection does not take: a resident or a business. */
export default function HaulingRequestForm() {
  const { t } = useTranslation();
  const now = useSimNow(60_000);
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  const account = useAccount();
  const barangayId = useSettings((s) => s.barangayId);
  const smsMobile = useSettings((s) => s.sms?.mobile ?? null);
  const profile = account.status === 'registered' ? account.profile : null;

  const [requester, setRequester] = useState<HaulingRequester>('resident');
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState(profile?.fullName ?? '');
  const [mobile, setMobile] = useState(() => {
    const known = profile?.mobile ?? smsMobile;
    return known ? `0${known.slice(3)}` : '';
  });
  const [point, setPoint] = useState<LngLat | null>(null);
  const [pinIsDefault, setPinIsDefault] = useState(true);
  const [landmark, setLandmark] = useState('');
  const [day, setDay] = useState<number | null>(null);
  const [slot, setSlot] = useState<HaulingSlot>('morning');
  const [volume, setVolume] = useState<HaulingVolume>('small');
  const [loads, setLoads] = useState<HaulingLoadType[]>([]);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  /** Errors show once the resident has tried to send, not while they are still filling in. */
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'offline' | 'other' | null>(null);
  const [sent, setSent] = useState<HaulingRequest | null>(null);
  // One reference per request written, so a retry after a lost answer is filed once.
  const [clientRef] = useState(randomUuid);

  const back = (
    <IconButton icon="arrow-left" label={t('common.back')} onPress={() => goBack('/resident')} />
  );
  const header = <AppHeader title={t('hauling.title')} leading={back} />;

  if (sent) {
    return (
      <Screen header={header}>
        <Card variant="mint" style={styles.done}>
          <View style={styles.doneBadge} aria-hidden>
            <Icon name="check" size={36} color={colors.textOnDark} />
          </View>
          <AppText variant="title" color={colors.primary} style={styles.center}>
            {t('hauling.sent.title')}
          </AppText>
          <AppText variant="bodyStrong" style={styles.center}>
            {sent.id}
          </AppText>
          <AppText style={styles.center}>{t('hauling.sent.body')}</AppText>
        </Card>
        <Notice tone="warning" text={t('hauling.sampleNotice')} />
        <Button
          icon="clipboard-text-outline"
          label={t('hauling.sent.open')}
          onPress={() =>
            router.replace({ pathname: '/resident/hauling/[id]', params: { id: sent.id } })
          }
        />
        <Button
          variant="secondary"
          icon="home"
          label={t('hauling.sent.home')}
          onPress={() => router.replace('/resident')}
        />
      </Screen>
    );
  }

  if (!barangays || !meta) {
    return (
      <Screen header={header}>
        <SkeletonGroup>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const home = barangays.features.find((f) => f.properties.id === barangayId)?.properties;
  const fallback = home?.labelPoint ?? meta.center;
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => manilaStartOfDay(now) + (i + 1) * DAY);
  const e164 = normalizePhMobile(mobile);

  const problems: Partial<Record<Field, string>> = {
    ...(requester === 'business' && businessName.trim().length < 2
      ? { business: t('hauling.form.errors.business') }
      : {}),
    ...(contactName.trim().length < 2 ? { name: t('hauling.form.errors.name') } : {}),
    ...(e164 ? {} : { mobile: t('hauling.form.errors.mobile') }),
    ...(day ? {} : { day: t('hauling.form.errors.day') }),
    ...(loads.length ? {} : { load: t('hauling.form.errors.load') }),
  };
  const shown = tried ? problems : {};
  const problem = (field: Field) =>
    shown[field] ? (
      <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
        {shown[field]}
      </AppText>
    ) : null;

  const send = async () => {
    setTried(true);
    setFailed(null);
    if (Object.keys(problems).length || !day || !e164) return;
    setBusy(true);
    try {
      setSent(
        await services.hauling.submit({
          requester,
          businessName: requester === 'business' ? businessName.trim() : null,
          contactName: contactName.trim(),
          contactMobile: e164,
          // The pin starts on the resident's barangay; where it was left is the answer.
          location: point ?? fallback,
          landmark: landmark.trim(),
          day,
          slot,
          volume,
          loadTypes: loads,
          description: description.trim(),
          photos,
          clientRef,
        }),
      );
    } catch (e) {
      setFailed(e instanceof OfflineError ? 'offline' : 'other');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={header}
      footer={
        <>
          {tried && Object.keys(problems).length ? (
            <AppText variant="label" color={colors.red} accessibilityLiveRegion="assertive">
              {t('hauling.form.errors.fix')}
            </AppText>
          ) : null}
          {failed ? (
            <AppText variant="label" color={colors.red} accessibilityLiveRegion="assertive">
              {t(`hauling.form.failed.${failed}`)}
            </AppText>
          ) : null}
          <Button
            icon="send"
            label={t('hauling.form.submit')}
            loading={busy}
            onPress={() => void send()}
          />
        </>
      }
    >
      <View style={styles.intro}>
        <SampleDataBadge />
        <AppText color={colors.textMuted}>{t('hauling.form.intro')}</AppText>
      </View>

      <Section title={t('hauling.form.who')}>
        <View style={styles.options} accessibilityRole="radiogroup">
          <OptionTile
            icon="home-account"
            title={t('hauling.requester.resident')}
            selected={requester === 'resident'}
            onPress={() => setRequester('resident')}
          />
          <OptionTile
            icon="storefront-outline"
            title={t('hauling.requester.business')}
            selected={requester === 'business'}
            onPress={() => setRequester('business')}
          />
        </View>
        {requester === 'business' ? (
          <TextField
            label={t('hauling.form.businessName')}
            value={businessName}
            onChangeText={setBusinessName}
            error={shown.business}
            autoCapitalize="words"
          />
        ) : null}
        <TextField
          label={t(
            requester === 'business' ? 'hauling.form.contactPerson' : 'hauling.form.contactName',
          )}
          value={contactName}
          onChangeText={setContactName}
          error={shown.name}
          autoCapitalize="words"
          autoComplete="name"
        />
        <TextField
          label={t('hauling.form.mobile')}
          hint={t('hauling.form.mobileHint')}
          prefix={<PhFlag />}
          value={mobile}
          onChangeText={setMobile}
          error={shown.mobile}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <AppText variant="caption" color={colors.textMuted}>
          {t('hauling.form.contactUse')}
        </AppText>
      </Section>

      <Section title={t('hauling.form.where')}>
        <LocationPicker
          barangays={barangays}
          meta={meta}
          fallback={fallback}
          value={point}
          autoLocate={pinIsDefault}
          onChange={(p) => {
            setPoint(p);
            setPinIsDefault(false);
          }}
        />
        <TextField
          label={t('hauling.form.landmark')}
          placeholder={t('hauling.form.landmarkHint')}
          value={landmark}
          onChangeText={setLandmark}
        />
      </Section>

      <Section title={t('hauling.form.day')}>
        <View style={styles.days} accessibilityRole="radiogroup">
          {days.map((d) => {
            const parts = manilaParts(d);
            const selected = d === day;
            return (
              <Pressable
                key={d}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                accessibilityLabel={formatDate(t, d)}
                onPress={() => setDay(d)}
                style={({ pressed, hovered }: PressState) => [
                  styles.dayTile,
                  selected && styles.dayTileOn,
                  !selected && (pressed || hovered) && { backgroundColor: colors.mintEdge },
                ]}
              >
                <AppText variant="caption" color={selected ? colors.textOnDark : colors.ink}>
                  {t(`weekday.${parts.weekday}`).slice(0, 3)}
                </AppText>
                <AppText
                  variant="label"
                  color={selected ? colors.textOnDark : colors.ink}
                  style={styles.dayText}
                >
                  {t(`date.month.${parts.month}`)} {parts.day}
                </AppText>
              </Pressable>
            );
          })}
          <View style={styles.dayFiller} />
          <View style={styles.dayFiller} />
        </View>
        {problem('day')}
        <AppText variant="label" accessibilityRole="header">
          {t('hauling.form.slot')}
        </AppText>
        <View style={styles.chips}>
          {SLOTS.map((s) => (
            <Chip
              key={s}
              label={t(`hauling.slot.${s}`)}
              selected={slot === s}
              onPress={() => setSlot(s)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('hauling.form.volume')}>
        <View style={styles.options} accessibilityRole="radiogroup">
          {VOLUMES.map((v) => (
            <OptionTile
              key={v}
              icon={VOLUME_ICONS[v]}
              title={t(`hauling.volume.${v}`)}
              hint={t(`hauling.volumeHint.${v}`)}
              selected={volume === v}
              onPress={() => setVolume(v)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('hauling.form.load')}>
        <View style={styles.chips}>
          {LOADS.map((l) => (
            <Chip
              key={l}
              label={t(`hauling.load.${l}`)}
              selected={loads.includes(l)}
              onPress={() =>
                setLoads(loads.includes(l) ? loads.filter((x) => x !== l) : [...loads, l])
              }
            />
          ))}
        </View>
        {problem('load')}
        <TextField
          label={t('hauling.form.description')}
          placeholder={t('hauling.form.descriptionHint')}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={300}
        />
      </Section>

      <Section title={t('hauling.form.photos')}>
        {photos.length ? (
          <View style={styles.photos}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photo}>
                <PhotoView photo={p} accessibilityLabel={t('hauling.form.photoN', { n: i + 1 })} />
                <Button
                  variant="ghost"
                  size="compact"
                  icon="delete-outline"
                  label={t('hauling.form.removePhoto')}
                  accessibilityHint={t('hauling.form.photoN', { n: i + 1 })}
                  onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                />
              </View>
            ))}
          </View>
        ) : null}
        {photos.length < MAX_PHOTOS ? (
          <PhotoCapture
            guide="wide"
            label={t('hauling.form.addPhoto')}
            variant="secondary"
            sample="bulky"
            onCaptured={(p) => setPhotos([...photos, p])}
          />
        ) : null}
      </Section>

      <AppText variant="label" color={colors.textMuted} style={styles.center}>
        {t('hauling.form.after')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayTile: {
    flexGrow: 1,
    flexBasis: 68,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.mintEdge,
    backgroundColor: colors.mint,
  },
  dayTileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Fourteen days in rows of four leave two places: these take them, so no tile is stretched.
  dayFiller: { flexGrow: 1, flexBasis: 68, height: 0, paddingHorizontal: spacing.xs },
  dayText: { fontFamily: fonts.bold },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photo: { flexGrow: 1, flexBasis: 130, maxWidth: 220, gap: spacing.xs },
  center: { textAlign: 'center' },
  done: { alignItems: 'center' },
  doneBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
