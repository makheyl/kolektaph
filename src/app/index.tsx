import { Platform, StyleSheet, Text, View } from 'react-native';

// Sprint S0 placeholder: proves the scaffold runs on web and Android.
// Replaced by the onboarding / role entry in Sprint S1.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Kolekta<Text style={styles.accent}>PH</Text>
      </Text>
      <Text style={styles.tagline}>Alam mo kung kailan. Alam mo kung saan.</Text>
      <Text style={styles.meta}>Sprint S0 · scaffold ready · {Platform.OS}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#15314B',
  },
  title: {
    fontSize: 44,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  accent: {
    color: '#F2B600',
  },
  tagline: {
    fontSize: 18,
    color: '#A8E0C2',
    textAlign: 'center',
  },
  meta: {
    fontSize: 14,
    color: '#C9D3DD',
  },
});
