import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { bg: string; border: string; fg: string; icon: IconName }> = {
  info: { bg: colors.mintSoft, border: colors.mint, fg: colors.ink, icon: 'information-outline' },
  success: {
    bg: colors.greenSoft,
    border: colors.primary,
    fg: colors.primary,
    icon: 'check-circle',
  },
  warning: { bg: colors.yellowSoft, border: colors.yellow, fg: colors.ink, icon: 'alert' },
  danger: { bg: colors.redSoft, border: colors.red, fg: colors.red, icon: 'alert-octagon' },
};

interface NoticeProps {
  tone?: Tone;
  /** Overrides the tone's own icon. */
  icon?: IconName;
  /** The message. Use `children` instead (or as well) for buttons under it. */
  text?: string;
  children?: ReactNode;
  /** Read out when it appears: "assertive" for errors that block the task. */
  live?: 'polite' | 'assertive';
}

/**
 * A message inside the page: something went wrong, something was saved, something to know.
 * Tone is shown by the icon and the words as well as the colour.
 */
export function Notice({ tone = 'info', icon, text, children, live }: NoticeProps) {
  const look = TONES[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: look.bg, borderColor: look.border }]}
      accessibilityLiveRegion={live}
    >
      <Icon name={icon ?? look.icon} size={24} color={look.fg} />
      <View style={styles.body}>
        {text ? (
          <AppText variant="bodyStrong" color={tone === 'danger' ? colors.red : colors.text}>
            {text}
          </AppText>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  body: { flex: 1, gap: spacing.md },
});
