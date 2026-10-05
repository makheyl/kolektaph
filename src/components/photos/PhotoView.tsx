import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from 'react-native';

import { services } from '@/services';
import type { PhotoRef } from '@/services/types';
import { colors, radius } from '@/theme/tokens';

import { SamplePhoto } from './SamplePhoto';

interface PhotoViewProps {
  photo: PhotoRef;
  /** Width / height (default 4:3, like the camera). */
  aspect?: number;
  style?: ViewStyle;
  accessibilityLabel: string;
}

/** A link to a photo stored on the server (null until it arrives, or if it cannot be had). */
function usePhotoUrl(path: string | null): string | null {
  const [link, setLink] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    services.photos
      .getUrl(path)
      .then((url) => !cancelled && setLink({ path, url }))
      // No signal, or no longer allowed to see it: the grey frame stays.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);
  return link && link.path === path ? link.url : null;
}

/**
 * A report photo: a real (compressed) camera photo, a photo stored on the server, or a labelled
 * sample picture.
 */
export function PhotoView({ photo, aspect = 4 / 3, style, accessibilityLabel }: PhotoViewProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const stored = usePhotoUrl(photo.kind === 'remote' ? photo.path : null);
  const uri = photo.kind === 'uri' ? photo.uri : stored;
  // An empty label means the photo only decorates something already described (a list card).
  const decorative = !accessibilityLabel;
  return (
    <View
      style={[styles.frame, { aspectRatio: aspect }, style]}
      onLayout={onLayout}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      aria-hidden={decorative || undefined}
    >
      {photo.kind === 'sample' ? (
        width > 0 ? (
          <SamplePhoto id={photo.id} width={width} height={width / aspect} />
        ) : null
      ) : uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.greySoft,
  },
});
