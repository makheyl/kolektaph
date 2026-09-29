import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
} from 'react-native';

import { useSettings } from '@/stores/settings';
import { colors, fonts, LARGE_TEXT_SCALE, radius, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
}

/** Labelled input: the label stays visible above the field (placeholders alone are easy to lose). */
export function TextField({ label, hint, error, icon, onFocus, onBlur, ...input }: TextFieldProps) {
  const largeText = useSettings((s) => s.largeText);
  const [focused, setFocused] = useState(false);
  const fontSize = 18 * (largeText ? LARGE_TEXT_SCALE : 1);
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      {/* The whole box shows focus (thicker navy border), replacing the browser's inner outline. */}
      <View style={[styles.box, focused && styles.boxFocused, error ? styles.boxError : null]}>
        {icon ? <Icon name={icon} size={22} color={colors.textMuted} /> : null}
        <TextInput
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { fontSize }, Platform.OS === 'web' && WEB_NO_OUTLINE]}
        />
      </View>
      {error ? (
        <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.large,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  boxFocused: { borderColor: colors.navy, borderWidth: 3, paddingHorizontal: spacing.md - 1 },
  boxError: { borderColor: colors.red },
  input: {
    flex: 1,
    minHeight: touch.large - 4,
    fontFamily: fonts.regular,
    color: colors.text,
  },
});

/**
 * Hides the browser's own focus ring inside the box (the box's navy border shows focus instead).
 * RN's types omit 'none', but react-native-web passes it straight through to CSS.
 */
const WEB_NO_OUTLINE = { outlineStyle: 'none' } as unknown as TextStyle;
