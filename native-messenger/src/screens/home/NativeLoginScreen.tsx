import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

type NativeLoginScreenProps = {
  notice: string;
  busy: boolean;
  onSignIn: () => void | Promise<void>;
};

export function NativeLoginScreen({ notice, busy, onSignIn }: NativeLoginScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.loginContent}>
        <View style={styles.loginHero}>
          <View style={styles.logo}>
            <View style={styles.logoBubble}>
              <Text style={styles.logoText}>O</Text>
            </View>
          </View>
          <Text style={styles.title}>Oracle Messenger</Text>
          <Text style={styles.subtitle}>
            Bienvenue. Connectez-vous pour retrouver vos messages.
          </Text>
          <View style={styles.heroLine} />
        </View>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Pressable
          disabled={busy}
          style={[styles.primaryButton, busy && styles.disabledButton]}
          onPress={onSignIn}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.googleMark}>G</Text>}
          <Text style={styles.primaryButtonText}>Continuer avec Google</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.header },
  loginContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 34 },
  loginHero: { alignItems: 'flex-start', marginBottom: 8 },
  logo: { width: 112, height: 112, borderRadius: 30, backgroundColor: '#10998C', alignItems: 'center', justifyContent: 'center', marginBottom: 30, shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 18, elevation: 8 },
  logoBubble: { width: 66, height: 66, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#0E6F66', fontSize: 38, lineHeight: 43, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: 0, maxWidth: 330 },
  subtitle: { color: 'rgba(255,255,255,0.76)', fontSize: 16, lineHeight: 24, marginTop: 12, fontWeight: '700', maxWidth: 340 },
  heroLine: { width: 54, height: 4, borderRadius: 2, backgroundColor: '#E7C86A', marginTop: 22 },
  notice: { color: '#FEE2E2', fontSize: 13, fontWeight: '800', marginTop: 16, lineHeight: 19 },
  primaryButton: { marginTop: 30, minHeight: 58, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 14, elevation: 5 },
  disabledButton: { opacity: 0.55 },
  googleMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', color: colors.brand, textAlign: 'center', lineHeight: 24, fontSize: 15, fontWeight: '900' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
