import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { compressPhoto } from '@/features/reports/photos';
import { useDemo } from '@/stores/demo';
import { colors, spacing } from '@/theme/tokens';

import type { PhotoCaptureProps } from './types';

/**
 * Web: the file input's `capture` attribute opens the phone's camera directly (live photo);
 * on a desktop it opens a file picker. The photo is compressed in the browser.
 */
export function PhotoCapture({
  guide,
  label,
  sample,
  onCaptured,
  variant = 'primary',
  showGuide = true,
}: PhotoCaptureProps) {
  const { t } = useTranslation();
  const demoMode = useDemo((s) => s.demoMode);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      setFailed(false);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          onCaptured({ kind: 'uri', uri: await compressPhoto(String(reader.result)) });
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <View style={styles.wrap}>
      {showGuide ? (
        <AppText variant="label" color={colors.textMuted}>
          {t(`reports.photo.guide.${guide}.title`)} · {t(`reports.photo.guide.${guide}.hint`)}
        </AppText>
      ) : null}
      <Button
        icon="camera"
        label={busy ? t('reports.photo.processing') : label}
        variant={variant}
        loading={busy}
        onPress={pick}
      />
      {demoMode ? (
        <Button
          variant="secondary"
          icon="image-outline"
          label={t('reports.photo.useSample')}
          onPress={() => onCaptured({ kind: 'sample', id: sample })}
        />
      ) : null}
      {failed ? <Notice tone="danger" live="polite" text={t('reports.photo.failed')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
});
