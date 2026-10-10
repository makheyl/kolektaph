import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, spacing, touch } from '@/theme/tokens';

import { AppText } from './AppText';
import type { PressState } from './interaction';
import { useNarrow } from './narrow';

interface SegmentedTabsProps<T extends string> {
  /** What the tabs switch between, for screen readers. */
  label: string;
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  /** "underline" = tabs across a page (Schedules); "pill" = a small switch (Map / List). */
  variant?: 'underline' | 'pill';
  /** "choice" = a setting with one answer (the language), announced as radio buttons. */
  kind?: 'tabs' | 'choice';
  /** Pill only: the switch takes the full width and its parts share it (This week / month / year). */
  fill?: boolean;
}

/** Two to four views of the same page. The chosen one is bold and marked, not only coloured. */
export function SegmentedTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  variant = 'underline',
  kind = 'tabs',
  fill = false,
}: SegmentedTabsProps<T>) {
  const pill = variant === 'pill';
  const choice = kind === 'choice';
  // On a very narrow screen the parts of a switch go one under the other, each with a full line
  // for its name.
  const narrow = useNarrow();
  return (
    <View
      accessibilityRole={choice ? 'radiogroup' : 'tablist'}
      accessibilityLabel={label}
      style={
        pill
          ? [styles.pillBar, fill && styles.pillBarFill, narrow && styles.pillBarStacked]
          : styles.lineBar
      }
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole={choice ? 'radio' : 'tab'}
            accessibilityState={choice ? { checked: selected } : { selected }}
            {...(choice ? { 'aria-checked': selected } : { 'aria-selected': selected })}
            onPress={() => onChange(tab.id)}
            style={({ pressed, hovered }: PressState) => [
              pill ? styles.pillTab : styles.lineTab,
              pill && fill && !narrow && styles.pillTabFill,
              narrow && (pill ? styles.pillTabStacked : styles.lineTabNarrow),
              selected && (pill ? styles.pillSelected : styles.lineSelected),
              { opacity: pressed ? 0.7 : hovered ? 0.85 : 1 },
            ]}
          >
            <AppText
              variant={narrow && !pill ? 'caption' : 'label'}
              color={
                selected
                  ? pill
                    ? colors.textOnDark
                    : colors.primary
                  : pill
                    ? colors.ink
                    : colors.textMuted
              }
              style={[styles.text, selected && { fontFamily: fonts.bold }]}
            >
              {tab.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  lineBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineTab: {
    flex: 1,
    minHeight: touch.min,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  lineSelected: { borderBottomColor: colors.primary },
  pillBar: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    padding: 3,
    gap: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mintEdge,
  },
  pillBarFill: { alignSelf: 'stretch' },
  pillBarStacked: { flexDirection: 'column', alignSelf: 'stretch', borderRadius: radius.lg },
  pillTabStacked: { borderRadius: radius.md, paddingHorizontal: spacing.sm },
  lineTabNarrow: { paddingHorizontal: 2 },
  pillTabFill: { flex: 1, paddingHorizontal: spacing.sm },
  pillTab: {
    flexShrink: 1,
    minHeight: touch.min - 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSelected: { backgroundColor: colors.primary },
  // Kept inside its tab: a long name wraps there instead of running over its neighbour.
  text: { textAlign: 'center', maxWidth: '100%' },
});
