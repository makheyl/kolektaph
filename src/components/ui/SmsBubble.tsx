import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

/** How an SMS alert looks on a basic phone: sender line plus the message. */
export function SmsBubble({ text, sender = 'KolektaPH' }: { text: string; sender?: string }) {
  return (
    <View style={styles.bubble} accessible accessibilityLabel={`SMS: ${text}`}>
      <View style={styles.sender}>
        <Icon name="message-text" size={18} color={colors.primary} />
        <AppText variant="label" color={colors.primary}>
          {sender}
        </AppText>
      </View>
      <AppText>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sender: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
