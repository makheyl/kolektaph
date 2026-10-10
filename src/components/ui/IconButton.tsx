import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { type PressState, tint } from './interaction';

interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only buttons must still be announced by screen readers. */
  label: string;
  onPress: () => void;
  color?: string;
  /** Unread count shown on the icon (hidden when 0). Include it in `label` too. */
  badge?: number;
  /** For a button that opens a menu: whether the menu is open. */
  expanded?: boolean;
}

export function IconButton({
  icon,
  label,
  onPress,
  color = colors.ink,
  badge = 0,
  expanded,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded == null ? undefined : { expanded }}
      onPress={onPress}
      hitSlop={4}
      style={(state: PressState) => [styles.button, { backgroundColor: tint(state) }]}
    >
      <Icon name={icon} size={26} color={color} />
      {badge > 0 ? (
        <View style={styles.badge} importantForAccessibility="no-hide-descendants">
          <AppText variant="caption" color={colors.textOnDark} style={styles.badgeText}>
            {badge > 9 ? '9+' : String(badge)}
          </AppText>
        </View>
      ) : null}
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
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 },
});
