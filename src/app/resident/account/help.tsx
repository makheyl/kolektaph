import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import type { PressState } from '@/components/ui/interaction';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useCityConfig } from '@/features/admin/hooks';
import { barangayLabel } from '@/features/resident/format';
import { useBarangays } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { services } from '@/services';
import type { ContactInfo } from '@/services/types';
import { useSettings } from '@/stores/settings';
import { colors, radius, spacing } from '@/theme/tokens';

type Route =
  '/resident/schedule' | '/resident/missed' | '/resident/rewards' | '/resident/hauling/new';

/** The questions people ask most. Each answer says where the thing is done, with a button there. */
const QUESTIONS = [
  { id: 'pickup', route: '/resident/schedule', feature: null },
  { id: 'missed', route: '/resident/missed', feature: null },
  { id: 'points', route: '/resident/rewards', feature: 'rewards' },
  { id: 'hauling', route: '/resident/hauling/new', feature: 'hauling' },
] as const satisfies readonly { id: string; route: Route; feature: 'rewards' | 'hauling' | null }[];

/**
 * Help: search the common questions, see who to call, and ask Kolek. An office's number shows
 * only once the City or the barangay has given an official one; until then the page says so.
 */
export default function HelpCenter() {
  const { t } = useTranslation();
  const barangayId = useSettings((s) => s.barangayId);
  const { data: barangays } = useBarangays();
  const config = useCityConfig();
  const props = barangays?.features.find((f) => f.properties.id === barangayId)?.properties;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const q = query.trim().toLowerCase();
  const shown = QUESTIONS.filter((item) => {
    if (item.feature && !services.features[item.feature]) return false;
    if (!q) return true;
    const question = t(`resident.help.faq.${item.id}.q`).toLowerCase();
    const answer = t(`resident.help.faq.${item.id}.a`).toLowerCase();
    return question.includes(q) || answer.includes(q);
  });

  const enroPhone = config?.contacts.enro.phone ?? null;
  const call = (phone: string) => {
    // Only the digits and a plus sign: staff may type spaces or dashes in the number.
    setFailed(false);
    Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() => setFailed(true));
  };

  const office = (name: string, info: ContactInfo | undefined) => (
    <View style={styles.office}>
      <View style={styles.badge} aria-hidden>
        <Icon name="phone" size={22} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{name}</AppText>
        <AppText selectable>{info?.phone ?? t('resident.help.noNumber')}</AppText>
        {info?.hours ? (
          <AppText variant="label" color={colors.textMuted}>
            {info.hours}
          </AppText>
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen
      tone="mint"
      header={
        <AppHeader
          tone="green"
          title={t('resident.account.help')}
          leading={
            <IconButton
              icon="arrow-left"
              color={colors.textOnDark}
              label={t('common.back')}
              onPress={() => goBack('/resident/settings')}
            />
          }
        />
      }
    >
      <TextField
        label={t('resident.help.search')}
        icon="magnify"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />

      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('resident.help.common')}
        </AppText>
        {shown.length === 0 ? (
          <AppText color={colors.textMuted} accessibilityLiveRegion="polite">
            {t('resident.help.noResults')}
          </AppText>
        ) : null}
        {shown.map((item) => {
          const expanded = open === item.id;
          return (
            <View key={item.id} style={styles.question}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : item.id)}
                style={({ pressed, hovered }: PressState) => [
                  styles.questionHead,
                  (pressed || hovered) && { backgroundColor: colors.mintSoft },
                ]}
              >
                <AppText variant="bodyStrong" style={styles.flex}>
                  {t(`resident.help.faq.${item.id}.q`)}
                </AppText>
                <Icon
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color={colors.primary}
                />
              </Pressable>
              {expanded ? (
                <View style={styles.answer}>
                  <AppText>{t(`resident.help.faq.${item.id}.a`)}</AppText>
                  <Button
                    variant="tonal"
                    size="compact"
                    icon="arrow-right"
                    label={t('resident.help.goTo')}
                    onPress={() => router.push(item.route)}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('resident.help.contact')}
        </AppText>
        <View style={styles.tiles}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('resident.help.askKolek')}
            onPress={() => router.push('/resident/kolek')}
            style={({ pressed, hovered }: PressState) => [
              styles.tile,
              (pressed || hovered) && { backgroundColor: colors.mintSoft },
            ]}
          >
            <View style={styles.tileIcon} aria-hidden>
              <Icon name="chat-question-outline" size={26} color={colors.primary} />
            </View>
            <AppText variant="label" color={colors.primary} style={styles.center}>
              {t('resident.help.askKolek')}
            </AppText>
          </Pressable>
          {enroPhone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('resident.help.callUs')}. ${enroPhone}`}
              onPress={() => call(enroPhone)}
              style={({ pressed, hovered }: PressState) => [
                styles.tile,
                (pressed || hovered) && { backgroundColor: colors.mintSoft },
              ]}
            >
              <View style={styles.tileIcon} aria-hidden>
                <Icon name="phone" size={26} color={colors.primary} />
              </View>
              <AppText variant="label" color={colors.primary} style={styles.center}>
                {t('resident.help.callUs')}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {failed ? (
          <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
            {t('resident.help.callFailed')}
          </AppText>
        ) : null}
      </Card>

      {config ? (
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            {t('resident.help.offices')}
          </AppText>
          {office(t('resident.help.enro'), config.contacts.enro)}
          {props
            ? office(
                t('resident.help.barangayHall', { barangay: barangayLabel(props) }),
                config.contacts.barangays[props.id],
              )
            : null}
        </Card>
      ) : (
        <SkeletonGroup>
          <SkeletonCard lines={4} />
        </SkeletonGroup>
      )}

      <View style={styles.links}>
        <ListRow
          variant="card"
          icon="map-marker-remove"
          title={t('resident.home.actions.missed')}
          subtitle={t('resident.help.missedHint')}
          onPress={() => router.push('/resident/missed')}
        />
        <ListRow
          variant="card"
          icon="shield-account-outline"
          title={t('resident.settings.privacy')}
          onPress={() => router.push('/resident/privacy')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  office: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0, gap: 2 },
  question: { borderRadius: radius.md, overflow: 'hidden' },
  questionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  answer: { gap: spacing.sm, paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 110,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  links: { gap: spacing.md },
});
