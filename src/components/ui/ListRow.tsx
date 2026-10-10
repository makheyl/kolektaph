import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import type { PressState } from './interaction';
import { useNarrow } from './narrow';

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  selected?: boolean;
  onPress?: () => void;
  /** Shown at the right; defaults to a chevron for pressable rows. 'radio' = one of a choice. */
  trailing?: 'chevron' | 'check' | 'radio' | 'none';
  danger?: boolean;
  /** "card" = a row that stands on its own as a white rounded card (menus, the profile list). */
  variant?: 'plain' | 'card';
}

export function ListRow({
  title,
  subtitle,
  icon,
  iconColor = colors.ink,
  selected,
  onPress,
  trailing = onPress ? 'chevron' : 'none',
  danger,
  variant = 'plain',
}: ListRowProps) {
  const titleColor = danger ? colors.red : colors.text;
  const card = variant === 'card';
  // On a very narrow screen the words take the icon's room.
  const narrow = useNarrow();
  return (
    <Pressable
      accessibilityRole={trailing === 'radio' ? 'radio' : onPress ? 'button' : undefined}
      accessibilityState={trailing === 'radio' ? { checked: !!selected } : { selected: !!selected }}
      aria-checked={trailing === 'radio' ? !!selected : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.row,
        card && styles.card,
        narrow && styles.narrow,
        selected && styles.selected,
        (pressed || hovered) && { backgroundColor: pressed ? colors.greySoft : colors.mintSoft },
      ]}
    >
      {icon && !narrow ? (
        <View style={[styles.iconWrap, card && styles.iconChip]}>
          <Icon name={icon} size={24} color={danger ? colors.red : iconColor} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong" color={titleColor}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing === 'chevron' ? (
        <Icon name="chevron-right" size={24} color={card ? colors.primary : colors.textMuted} />
      ) : trailing === 'check' && selected ? (
        <Icon name="check-circle" size={26} color={colors.primary} />
      ) : trailing === 'radio' ? (
        <Icon
          name={selected ? 'radiobox-marked' : 'radiobox-blank'}
          size={26}
          color={selected ? colors.primary : colors.fieldBorder}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.large,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  narrow: { gap: spacing.xs, paddingHorizontal: spacing.sm },
  selected: { backgroundColor: colors.greenSoft },
  iconWrap: { width: 28, alignItems: 'center' },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
