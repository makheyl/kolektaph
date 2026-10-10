import { type Href, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { KolekAvatar } from '@/components/brand/Brand';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Icon';
import { useNarrow } from '@/components/ui/narrow';
import type { KolekLine, KolekReply } from '@/services/types';
import { colors, radius, spacing } from '@/theme/tokens';

import { type RenderContext, renderLine } from '../render';

interface KolekBubbleProps {
  lines: KolekLine[];
  actions?: KolekReply['actions'];
  ctx: RenderContext;
  /** The newest answer is announced to screen readers. */
  latest?: boolean;
}

/** Kolek's answer: its lines, then buttons that open the screen that helps (deep links). */
export function KolekBubble({ lines, actions = [], ctx, latest }: KolekBubbleProps) {
  const { t } = useTranslation();
  // On a very narrow screen the answer takes the picture's room.
  const narrow = useNarrow();
  const texts = lines.map((l) => renderLine(l, ctx));
  return (
    <View style={styles.kolekRow}>
      {narrow ? null : <KolekAvatar size={44} />}
      <View style={styles.kolekCol}>
        <View
          style={styles.kolekBubble}
          accessible
          accessibilityLabel={`${t('kolek.name')}: ${texts.join(' ')}`}
          accessibilityLiveRegion={latest ? 'polite' : 'none'}
        >
          {texts.map((text, i) => (
            <AppText key={`${i}-${text}`}>{text}</AppText>
          ))}
        </View>
        {actions.map((a) => (
          <Button
            key={a.href}
            variant="secondary"
            size="compact"
            icon={a.icon as IconName}
            label={t(a.labelKey)}
            onPress={() => router.push(a.href as Href)}
          />
        ))}
      </View>
    </View>
  );
}

/** What the resident asked. */
export function ResidentBubble({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.residentRow} accessible accessibilityLabel={`${t('kolek.you')}: ${text}`}>
      <View style={styles.residentBubble}>
        <AppText color={colors.textOnDark}>{text}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kolekRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  kolekCol: { flex: 1, gap: spacing.sm },
  kolekBubble: {
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.mint,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
  },
  residentRow: { alignItems: 'flex-end', paddingLeft: spacing.xxl },
  residentBubble: {
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    borderTopRightRadius: radius.sm,
  },
});
