import { Text, type TextProps } from 'react-native';

import { useSettings } from '@/stores/settings';
import { colors, LARGE_TEXT_SCALE, type TextVariant, typography } from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
}

/** All app text goes through here so "Malaking teksto" and the OS font scale both apply. */
export function AppText({ variant = 'body', color = colors.text, style, ...rest }: AppTextProps) {
  const largeText = useSettings((s) => s.largeText);
  const t = typography[variant];
  const scale = largeText ? LARGE_TEXT_SCALE : 1;
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: t.fontFamily,
          fontSize: t.fontSize * scale,
          lineHeight: t.lineHeight * scale,
          color,
        },
        style,
      ]}
    />
  );
}
