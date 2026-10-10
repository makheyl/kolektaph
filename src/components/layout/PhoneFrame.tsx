import { createContext, type ReactNode, useContext } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors, layout, shadows } from '@/theme/tokens';

/** True for screens drawn above the resident tab bar, which already clears the phone's edge. */
const BottomBarContext = createContext(false);
export const useHasBottomBar = () => useContext(BottomBarContext);

interface PhoneFrameProps {
  children: ReactNode;
  /** The app inside has its own bar at the bottom of the frame (the resident tabs). */
  bottomBar?: boolean;
}

/**
 * The resident and driver apps are phone apps. On a wide screen (the web on a laptop) they sit
 * as one phone-width column in the middle of a quiet backdrop instead of stretching; on a phone
 * the frame is invisible.
 */
export function PhoneFrame({ children, bottomBar = false }: PhoneFrameProps) {
  const { width } = useWindowDimensions();
  const wide = width > layout.residentMaxWidth;
  return (
    <BottomBarContext.Provider value={bottomBar}>
      <View style={[styles.backdrop, wide && styles.backdropWide]}>
        <View style={[styles.column, wide && styles.columnWide]}>{children}</View>
      </View>
    </BottomBarContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.page },
  backdropWide: { backgroundColor: colors.dashboard },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: layout.residentMaxWidth,
    alignSelf: 'center',
    backgroundColor: colors.page,
    overflow: 'hidden',
  },
  columnWide: shadows.card,
});
