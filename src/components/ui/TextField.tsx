import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
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
  /** Fixed content before the text, with a divider (the flag and +63 of a mobile number). */
  prefix?: ReactNode;
  /** For passwords: an eye button that shows what was typed. */
  revealable?: boolean;
}

/** Labelled input: the label stays visible above the field (placeholders alone are easy to lose). */
export function TextField({
  label,
  hint,
  error,
  icon,
  prefix,
  revealable,
  secureTextEntry,
  onFocus,
  onBlur,
  ...input
}: TextFieldProps) {
  const { t } = useTranslation();
  const largeText = useSettings((s) => s.largeText);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const fontSize = 18 * (largeText ? LARGE_TEXT_SCALE : 1);
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      {/* The whole box shows focus (thicker green border), replacing the browser's inner outline. */}
      <View style={[styles.box, focused && styles.boxFocused, error ? styles.boxError : null]}>
        {prefix ? <View style={styles.prefix}>{prefix}</View> : null}
        {icon ? <Icon name={icon} size={22} color={colors.textMuted} /> : null}
        <TextInput
          {...input}
          secureTextEntry={secureTextEntry && !revealed}
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
          style={[
            styles.input,
            { fontSize },
            input.multiline && styles.multiline,
            Platform.OS === 'web' && WEB_NO_OUTLINE,
          ]}
        />
        {revealable && secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(revealed ? 'common.hidePassword' : 'common.showPassword')}
            onPress={() => setRevealed(!revealed)}
            hitSlop={8}
            style={styles.reveal}
          >
            <Icon
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={24}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
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

const BORDER = 1.5;
const BORDER_FOCUSED = 2.5;

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.large,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: BORDER,
    borderColor: colors.fieldBorder,
    borderRadius: radius.lg,
  },
  // The thicker border takes its extra width from the padding, so the text does not move.
  boxFocused: {
    borderColor: colors.primary,
    borderWidth: BORDER_FOCUSED,
    paddingHorizontal: spacing.lg - (BORDER_FOCUSED - BORDER),
  },
  boxError: { borderColor: colors.red },
  prefix: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.sm,
    paddingRight: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  multiline: { minHeight: 132, paddingVertical: spacing.md, textAlignVertical: 'top' },
  input: {
    flex: 1,
    // Browsers give inputs a ~20-character minimum width; let them shrink at 200% text size.
    minWidth: 0,
    minHeight: touch.large - 2 * BORDER_FOCUSED,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  reveal: {
    width: touch.min,
    height: touch.min,
    marginRight: -spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Hides the browser's own focus ring inside the box (the box's green border shows focus instead).
 * RN's types omit 'none', but react-native-web passes it straight through to CSS.
 */
const WEB_NO_OUTLINE = { outlineStyle: 'none' } as unknown as TextStyle;
