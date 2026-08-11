import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/colors';

export function NativeLoadingScreen() {
  return (
    <SafeAreaView style={styles.loading}>
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.loadingText}>Ouverture d&apos;Oracle Messenger...</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
