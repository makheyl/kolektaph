import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  selected?: boolean;
  onPress?: () => void;
  /** Shown at the right; defaults to a chevron for pressable rows. */
  trailing?: 'chevron' | 'check' | 'none';
  danger?: boolean;
}

export function ListRow({
  title,
  subtitle,
  icon,
  iconColor = colors.navy,
  selected,
  onPress,
  trailing = onPress ? 'chevron' : 'none',
  danger,
}: ListRowProps) {
  const titleColor = danger ? colors.red : colors.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && { backgroundColor: colors.greySoft },
      ]}
    >
      {icon ? <Icon name={icon} size={24} color={danger ? colors.red : iconColor} /> : null}
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
        <Icon name="chevron-right" size={24} color={colors.textMuted} />
      ) : trailing === 'check' && selected ? (
        <Icon name="check-circle" size={26} color={colors.green} />
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
    borderRadius: 12,
  },
  selected: { backgroundColor: colors.greenSoft },
  text: { flex: 1, gap: 2 },
});
