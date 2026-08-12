import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Globe2 } from 'lucide-react-native';
import { colors } from '@/theme/colors';

const ORACLE_WEB_URL = 'https://web.oracle-plus.online';

export function WebPage() {
  const openWeb = () => {
    void Linking.openURL(ORACLE_WEB_URL).catch(() => undefined);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <View style={styles.icon}>
          <Globe2 size={30} color="#FFFFFF" strokeWidth={2.1} />
        </View>
        <Text maxFontSizeMultiplier={1.08} style={styles.title}>Web</Text>
        <Text maxFontSizeMultiplier={1.08} style={styles.subtitle}>Créer mon site web, appli ou boutique</Text>
      </View>
      <Pressable onPress={openWeb} android_ripple={{ color: 'rgba(16,42,42,0.08)' }} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <Text style={styles.cardTitle}>Ouvrir Oracle Web</Text>
        <Text style={styles.cardText}>Créer mon site web, application ou boutique avec le service Oracle Plus.</Text>
        <Text style={styles.linkText}>Ouvrir</Text>
      </Pressable>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Organisation</Text>
        <Text style={styles.cardText}>Ce lien reprend le comportement Capacitor et ouvre le service web Oracle Plus depuis Android.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 10, paddingBottom: 88, gap: 10, backgroundColor: colors.background },
  hero: { minHeight: 86, borderRadius: 16, backgroundColor: colors.header, padding: 12, justifyContent: 'center' },
  icon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { color: '#FFFFFF', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 3 },
  card: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  cardPressed: { backgroundColor: '#F0F7F4' },
  cardTitle: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  cardText: { color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  linkText: { color: colors.brand, fontSize: 13, lineHeight: 17, fontWeight: '900', marginTop: 3 },
});
