import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Icon } from '@/components/ui/Icon';
import { compressPhoto } from '@/features/reports/photos';
import { useDemo } from '@/stores/demo';
import { colors, radius, spacing } from '@/theme/tokens';

import type { PhotoCaptureProps } from './types';

/**
 * Live camera only (HAKOT SNAP-01: no gallery, so old or downloaded photos can't be reused),
 * with an on-screen guide. Photos are compressed on the phone before they are kept.
 */
export function PhotoCapture({
  guide,
  label,
  sample,
  onCaptured,
  variant = 'primary',
}: PhotoCaptureProps) {
  const { t } = useTranslation();
  const demoMode = useDemo((s) => s.demoMode);
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const camera = useRef<CameraView>(null);

  const start = async () => {
    const p = permission?.granted ? permission : await requestPermission();
    setDenied(!p.granted);
    if (p.granted) setOpen(true);
  };

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picture = await camera.current?.takePictureAsync({ quality: 0.8 });
      if (picture) {
        onCaptured({ kind: 'uri', uri: await compressPhoto(picture.uri) });
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Button icon="camera" label={label} variant={variant} onPress={() => void start()} />
      {demoMode ? (
        <Button
          variant="secondary"
          icon="image-outline"
          label={t('reports.photo.useSample')}
          onPress={() => onCaptured({ kind: 'sample', id: sample })}
        />
      ) : null}
      {denied ? (
        <Notice tone="warning" live="polite" text={t('reports.photo.denied')}>
          <Button
            variant="secondary"
            size="compact"
            icon="cog-outline"
            label={t('driver.start.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </Notice>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.camera}>
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
          <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
            <View style={styles.guide} accessibilityLiveRegion="polite">
              <AppText variant="heading" color={colors.textOnDark}>
                {t(`reports.photo.guide.${guide}.title`)}
              </AppText>
              <AppText color={colors.textOnDark}>{t(`reports.photo.guide.${guide}.hint`)}</AppText>
            </View>
            <View style={styles.frame} pointerEvents="none" />
            <View style={styles.controls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                onPress={() => setOpen(false)}
                style={styles.side}
              >
                <Icon name="close" size={32} color={colors.textOnDark} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('reports.photo.shutter')}
                onPress={() => void shoot()}
                disabled={busy}
                style={({ pressed }) => [styles.shutter, (pressed || busy) && { opacity: 0.6 }]}
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <View style={styles.side} />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  camera: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  guide: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(17, 67, 68, 0.85)',
    gap: 2,
  },
  frame: {
    flex: 1,
    marginHorizontal: spacing.xl,
    marginVertical: spacing.lg,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: colors.mint,
    borderRadius: radius.lg,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  side: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: colors.textOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.textOnDark },
});
