import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import type { PressState } from './interaction';

export interface MenuItem {
  icon: IconName;
  label: string;
  onPress: () => void;
}

interface MenuProps {
  visible: boolean;
  onClose: () => void;
  /** Screen position of the menu's top-right corner (just under the button that opened it). */
  anchor: { top: number; right: number };
  /** Spoken name of the menu. */
  label: string;
  items: MenuItem[];
}

/**
 * A short list of places to go, dropping from a button in the app bar. Closes on a choice, a tap
 * outside, the Back button or Escape.
 */
export function Menu({ visible, onClose, anchor, label, items }: MenuProps) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityRole="menu"
        accessibilityLabel={label}
        style={[styles.menu, { top: anchor.top, right: anchor.right }]}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="menuitem"
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={({ pressed, hovered }: PressState) => [
              styles.item,
              (pressed || hovered) && {
                backgroundColor: pressed ? colors.greySoft : colors.mintSoft,
              },
            ]}
          >
            <Icon name={item.icon} size={24} color={colors.ink} />
            <AppText variant="bodyStrong" style={styles.label}>
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    minWidth: 240,
    maxWidth: 320,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.raised,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touch.min,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: { flexShrink: 1 },
});
