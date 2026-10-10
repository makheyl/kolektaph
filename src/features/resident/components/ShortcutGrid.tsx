import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { IconName } from '@/components/ui/Icon';
import { useSettings } from '@/stores/settings';
import { LARGE_TEXT_SCALE, spacing } from '@/theme/tokens';

import { QuickAction } from './QuickAction';

export interface Shortcut {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: string | null;
  badgeLabel?: string | null;
  disabled?: boolean;
}

/** A shortcut needs about this much width for its circle and a two-line name. */
const MIN_TILE = 78;

/**
 * Home's shortcuts in even columns: four across on a phone, fewer when the screen is narrow or
 * the letters are large (down to one), so a name is never squeezed.
 */
export function ShortcutGrid({ items }: { items: Shortcut[] }) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const largeText = useSettings((s) => s.largeText);
  const scale = fontScale * (largeText ? LARGE_TEXT_SCALE : 1);
  const columns = Math.max(1, Math.min(4, Math.floor(width / (MIN_TILE * scale))));

  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {items.map((s) => (
        <QuickAction
          key={s.key}
          icon={s.icon}
          label={s.label}
          badge={s.badge}
          badgeLabel={s.badgeLabel}
          onPress={s.onPress}
          disabled={s.disabled}
          width={width ? Math.floor(width / columns) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
});
