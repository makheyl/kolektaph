import { Image } from 'expo-image';
import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from 'react-native';

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

/** A report photo: a real (compressed) camera photo, or a labelled sample picture. */
export function PhotoView({ photo, aspect = 4 / 3, style, accessibilityLabel }: PhotoViewProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  return (
    <View
      style={[styles.frame, { aspectRatio: aspect }, style]}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {photo.kind === 'uri' ? (
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : width > 0 ? (
        <SamplePhoto id={photo.id} width={width} height={width / aspect} />
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
