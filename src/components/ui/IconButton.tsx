import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, touch } from '@/theme/tokens';

import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only buttons must still be announced by screen readers. */
  label: string;
  onPress: () => void;
  color?: string;
}

export function IconButton({ icon, label, onPress, color = colors.navy }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && { backgroundColor: colors.greySoft }]}
    >
      <Icon name={icon} size={26} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
