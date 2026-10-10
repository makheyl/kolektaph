import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PhotoCapture } from '@/components/photos/PhotoCapture';
import { PhotoView } from '@/components/photos/PhotoView';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useNarrow } from '@/components/ui/narrow';
import { Notice } from '@/components/ui/Notice';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { SkeletonCard, SkeletonGroup } from '@/components/ui/Skeleton';
import { goBack } from '@/lib/navigation';
import { services } from '@/services';
import type { PhotoRef, ScanResult } from '@/services/types';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const CLASS_ICONS: Record<ScanResult['sortClass'], IconName> = {
  biodegradable: 'leaf',
  recyclable: 'recycle',
  residual: 'trash-can-outline',
  special: 'alert-octagon-outline',
};

type Scan =
  | { state: 'idle' }
  | { state: 'reading'; photo: PhotoRef }
  | { state: 'done'; photo: PhotoRef; result: ScanResult | null }
  | { state: 'failed'; photo: PhotoRef };

/**
 * The segregation scanner: a photo of an item, and how to segregate it. No recognition is
 * connected yet, so the answer is a sample and the page says so.
 */
export default function SegregationScanner() {
  const { t } = useTranslation();
  const narrow = useNarrow();
  const [scan, setScan] = useState<Scan>({ state: 'idle' });
  const [helpful, setHelpful] = useState<boolean | null>(null);

  const read = async (photo: PhotoRef) => {
    setHelpful(null);
    setScan({ state: 'reading', photo });
    try {
      setScan({ state: 'done', photo, result: await services.scanner.classify(photo) });
    } catch {
      setScan({ state: 'failed', photo });
    }
  };
  const result = scan.state === 'done' ? scan.result : null;

  return (
    <Screen
      header={
        <AppHeader
          title={t('scanner.title')}
          leading={
            <IconButton
              icon="arrow-left"
              label={t('common.back')}
              onPress={() => goBack('/resident')}
            />
          }
        />
      }
    >
      <SampleDataBadge />
      <Card style={styles.tip}>
        {narrow ? null : (
          <View style={styles.tipIcon} aria-hidden>
            <Icon name="lightbulb-on-outline" size={24} color={colors.primary} />
          </View>
        )}
        <AppText style={styles.flex}>{t('scanner.intro')}</AppText>
      </Card>

      {scan.state === 'idle' ? (
        <View style={styles.finder} aria-hidden>
          <Icon name="line-scan" size={64} color={colors.primary} />
        </View>
      ) : (
        <View style={styles.photo}>
          <PhotoView photo={scan.photo} accessibilityLabel={t('scanner.photo')} />
        </View>
      )}

      <PhotoCapture
        guide="close"
        showGuide={false}
        label={t(scan.state === 'idle' ? 'scanner.scan' : 'scanner.again')}
        variant={scan.state === 'idle' ? 'primary' : 'secondary'}
        sample="bulky"
        onCaptured={(photo) => void read(photo)}
      />

      {scan.state === 'reading' ? (
        <SkeletonGroup>
          <SkeletonCard lines={3} />
        </SkeletonGroup>
      ) : null}

      {scan.state === 'failed' ? <Notice tone="danger" text={t('scanner.failed')} /> : null}
      {scan.state === 'done' && !result ? <Notice tone="info" text={t('scanner.unknown')} /> : null}

      {result ? (
        <>
          <Card accessibilityLiveRegion="polite">
            <AppText variant="label" color={colors.textMuted} accessibilityRole="header">
              {t('scanner.result')}
            </AppText>
            <View style={styles.result}>
              <View style={styles.resultIcon} aria-hidden>
                <Icon name={CLASS_ICONS[result.sortClass]} size={36} color={colors.primary} />
              </View>
              <View style={styles.resultText}>
                <AppText variant="heading" color={colors.primary}>
                  {t(`scanner.item.${result.item}`, { defaultValue: result.item })}
                </AppText>
                <View style={styles.classPill}>
                  <Icon name={CLASS_ICONS[result.sortClass]} size={16} color={colors.ink} />
                  <AppText variant="label" color={colors.ink} style={styles.className}>
                    {t(`scanner.class.${result.sortClass}`)}
                  </AppText>
                </View>
                <AppText>{t(`scanner.instruction.${result.sortClass}`)}</AppText>
              </View>
            </View>
          </Card>
          {result.sample ? <Notice tone="warning" text={t('scanner.sample')} /> : null}
          {result.sortClass === 'special' && services.features.hauling ? (
            <Button
              variant="secondary"
              icon="truck"
              label={t('scanner.haul')}
              onPress={() => router.push('/resident/hauling/new')}
            />
          ) : null}

          <Card style={styles.tip}>
            {narrow ? null : (
              <View aria-hidden>
                <Icon name="leaf" size={24} color={colors.primary} />
              </View>
            )}
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t('scanner.tipsTitle')}</AppText>
              <AppText variant="label" color={colors.textMuted}>
                {t('scanner.tips')}
              </AppText>
            </View>
          </Card>

          <Card>
            <AppText variant="bodyStrong">{t('scanner.helpful')}</AppText>
            {helpful == null ? (
              <View style={styles.answers}>
                <View style={styles.answer}>
                  <Button
                    variant="tonal"
                    size="compact"
                    icon="thumb-up-outline"
                    label={t('scanner.yes')}
                    onPress={() => setHelpful(true)}
                  />
                </View>
                <View style={styles.answer}>
                  <Button
                    variant="secondary"
                    size="compact"
                    icon="thumb-down-outline"
                    label={t('scanner.no')}
                    onPress={() => setHelpful(false)}
                  />
                </View>
              </View>
            ) : (
              <AppText color={colors.textMuted} accessibilityLiveRegion="polite">
                {t('scanner.thanks')}
              </AppText>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tip: { flexDirection: 'row', alignItems: 'center' },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finder: {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  result: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: spacing.xs },
  classPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mintEdge,
  },
  className: { fontFamily: fonts.bold },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  answer: { flexGrow: 1, flexBasis: 110 },
});
