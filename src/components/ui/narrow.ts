import { useWindowDimensions } from 'react-native';

import { layout } from '@/theme/tokens';

/**
 * True on a very narrow screen: a small phone at 200% text, which a browser lays out at half
 * its width. A row then gives an icon's room to its words, so they read as lines of words and
 * not as a column of letters.
 */
export function useNarrow(): boolean {
  return useWindowDimensions().width < layout.narrowWidth;
}
