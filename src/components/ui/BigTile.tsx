import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import type { PressState } from './interaction';
import { useNarrow } from './narrow';

interface BigTileProps {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  accent?: string;
}

/** Large icon + label tile for main choices (who is using the app, where to sign in). */
export function BigTile({ icon, label, hint, onPress, accent = colors.primary }: BigTileProps) {
  // On a very narrow screen the icon goes above the words, which then get the whole width.
  const narrow = useNarrow();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.tile,
        narrow && styles.stacked,
        (pressed || hovered) && { backgroundColor: pressed ? colors.greySoft : colors.mintSoft },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: accent }]}>
        <Icon name={icon} size={32} color={colors.textOnDark} />
      </View>
      <View style={narrow ? styles.stackedText : styles.text}>
        <AppText variant="heading">{label}</AppText>
        {hint ? (
          <AppText variant="label" color={colors.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {narrow ? null : <Icon name="chevron-right" size={26} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 88,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  stacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  stackedText: { alignSelf: 'stretch', gap: 2 },
});
