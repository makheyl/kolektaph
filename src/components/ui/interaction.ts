import type { PressableStateCallbackType } from 'react-native';

/**
 * What a Pressable tells its style function. On the web it also reports the mouse hovering
 * (native reports presses only). Keyboard focus is drawn by the page's own `:focus-visible`
 * rule (public/index.html), so every control gets the same ring.
 */
export type PressState = PressableStateCallbackType & { hovered?: boolean };

/** Tint laid over a control while the mouse is on it, or a finger is. */
export const overlay = {
  hover: 'rgba(17, 67, 68, 0.06)',
  press: 'rgba(17, 67, 68, 0.12)',
} as const;

/** The background for a plain (unfilled) control in its current state. */
export function tint({ pressed, hovered }: PressState): string | undefined {
  return pressed ? overlay.press : hovered ? overlay.hover : undefined;
}
