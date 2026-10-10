import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { useDriver } from '@/stores/driver';
import { colors, radius, shadows, spacing, touch } from '@/theme/tokens';

import { useDeviceNow } from '../hooks';
import { UNDO_MS } from '../outbox';

interface UndoToastProps {
  /** The last undoable report and what it said ("½ karga"). */
  last: { id: string; label: string } | null;
  onUndone: () => void;
}

/**
 * "Naitala: ½ karga · I-undo (4)". Shown for UNDO_MS after a load or status tap; the report
 * is not sent before that, so undo never has to reach the server.
 */
export function UndoToast({ last, onUndone }: UndoToastProps) {
  const { t } = useTranslation();
  const now = useDeviceNow(250);
  const item = useDriver((s) => (last ? s.outbox.find((o) => o.event.id === last.id) : undefined));
  if (!last || !item || item.synced || item.holdUntil <= now) return null;
  // The clock ticks every 250 ms, so never show more than the full undo window.
  const seconds = Math.min(UNDO_MS / 1000, Math.ceil((item.holdUntil - now) / 1000));

  return (
    <View style={styles.toast} accessibilityLiveRegion="polite">
      <Icon name="check-circle" size={24} color={colors.mint} />
      <AppText variant="bodyStrong" color={colors.textOnDark} style={styles.text}>
        {t('driver.shift.recorded', { what: last.label })}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('driver.shift.undoA11y', { what: last.label })}
        onPress={() => {
          if (useDriver.getState().undo(last.id)) onUndone();
        }}
        style={({ pressed }) => [styles.undo, pressed && { opacity: 0.8 }]}
      >
        <Icon name="undo-variant" size={22} color={colors.ink} />
        <AppText variant="bodyStrong" color={colors.ink}>
          {t('driver.shift.undo')} ({seconds})
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.raised,
  },
  text: { flex: 1 },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.yellow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: touch.large,
  },
});
