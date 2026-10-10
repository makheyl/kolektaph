import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { KolekAvatar } from '@/components/brand/Brand';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/interaction';
import { useNarrow } from '@/components/ui/narrow';
import { colors, radius, shadows, spacing } from '@/theme/tokens';

/** Home's way in to Kolek, drawn as the box a question is typed in. Opens the chat. */
export function KolekBar() {
  const { t } = useTranslation();
  const narrow = useNarrow();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('kolek.title')}. ${t('resident.home.askKolek')}`}
      onPress={() => router.push('/resident/kolek')}
      style={({ pressed, hovered }: PressState) => [
        styles.bar,
        (pressed || hovered) && { backgroundColor: colors.mint },
      ]}
    >
      {narrow ? null : <KolekAvatar size={44} />}
      <AppText color={colors.textMuted} style={styles.text}>
        {t('resident.home.askKolek')}
      </AppText>
      <View style={styles.send} aria-hidden>
        <Icon name="send" size={20} color={colors.textOnDark} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.mintEdge,
    backgroundColor: colors.mintSoft,
    ...shadows.card,
  },
  text: { flex: 1, minWidth: 0 },
  send: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
