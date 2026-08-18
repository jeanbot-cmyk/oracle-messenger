import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/services/api';
import { NativeLegalDocumentPanel } from '@/legal/NativeLegalDocumentPanel';
import type { LegalDocumentId } from '@/legal/oracleLegalDocuments';
import { colors } from '@/theme/colors';

type NativeLoginScreenProps = {
  notice: string;
  busy: boolean;
  onSignIn: () => void | Promise<void>;
};

export function NativeLoginScreen({ notice, busy, onSignIn }: NativeLoginScreenProps) {
  const [phone, setPhone] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recovery, setRecovery] = useState<{ found: boolean; name?: string; emailHint?: string; message: string } | null>(null);
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [policyNotice, setPolicyNotice] = useState('');
  const [legalView, setLegalView] = useState<LegalDocumentId | null>(null);

  const recoverPhone = useCallback(async () => {
    if (!phone.trim()) {
      setRecovery({ found: false, message: 'Entrez votre numéro avec indicatif, puis réessayez.' });
      return;
    }
    setRecovering(true);
    setRecovery(null);
    try {
      setRecovery(await api.recoverPhone(phone.trim()));
    } catch {
      setRecovery({ found: false, message: 'Vérification impossible maintenant. Réessayez avec une connexion stable.' });
    } finally {
      setRecovering(false);
    }
  }, [phone]);

  const openPolicy = useCallback((documentId: LegalDocumentId) => {
    setPolicyNotice('');
    setLegalView(documentId);
  }, []);

  const submitGoogle = useCallback(() => {
    if (!policiesAccepted) {
      setPolicyNotice('Veuillez lire et approuver les conditions avant de continuer.');
      return;
    }
    setPolicyNotice('');
    void onSignIn();
  }, [onSignIn, policiesAccepted]);

  if (legalView) {
    return (
      <SafeAreaView style={styles.safe}>
        <NativeLegalDocumentPanel documentId={legalView} onClose={() => setLegalView(null)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.loginContent}>
        <View style={styles.loginHero}>
          <Image source={require('../../../assets/icon.png')} style={styles.logoImage} />
          <Text style={styles.title}>Oracle Messenger</Text>
          <Text style={styles.subtitle}>
            est votre nouvelle application de messagerie, d’appels, de salle de conférence numérique, de suivi d’entreprise et de création de contenus avec l’IA : vidéos IA et images IA.
            {'\n\n'}Pour continuer, cliquez sur Google et inscrivez-vous.
          </Text>
        </View>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Pressable
          disabled={busy}
          style={[styles.primaryButton, busy && styles.disabledButton]}
          onPress={submitGoogle}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : (
            <>
              <Text style={styles.googleMark}>G</Text>
              <Text style={styles.primaryButtonText}>Continuer avec Google</Text>
            </>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: policiesAccepted }}
          onPress={() => {
            setPoliciesAccepted(current => !current);
            setPolicyNotice('');
          }}
          style={styles.policyRow}
        >
          <View style={[styles.policyCheckbox, policiesAccepted && styles.policyCheckboxChecked]}>
            {policiesAccepted ? <Text style={styles.policyCheckMark}>✓</Text> : null}
          </View>
          <Text style={styles.policyText}>
            J’ai lu et j’approuve les{' '}
            <Text style={styles.policyLink} onPress={() => openPolicy('terms')}>conditions</Text>
            {' '}et la{' '}
            <Text style={styles.policyLink} onPress={() => openPolicy('privacy')}>politique de confidentialite</Text>
            {', '}
            <Text style={styles.policyLink} onPress={() => openPolicy('data')}>politique des donnees</Text>.
          </Text>
        </Pressable>
        {policyNotice ? <Text style={styles.policyNotice}>{policyNotice}</Text> : null}
        {!recoveryOpen ? (
          <Pressable accessibilityRole="button" onPress={() => setRecoveryOpen(true)} style={styles.recoveryLink}>
            <Text style={styles.recoveryLinkText}>Retrouver mon compte perdu</Text>
          </Pressable>
        ) : (
          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryTitle}>Retrouver mon compte perdu</Text>
            <Text style={styles.recoveryCopy}>Entrez votre numéro. Si ce numéro est lié à un compte, Oracle affiche le Gmail masqué à utiliser.</Text>
            <View style={styles.recoveryRow}>
              <TextInput
                value={phone}
                onChangeText={text => { setPhone(text); setRecovery(null); }}
                placeholder="+225 07..."
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                style={styles.recoveryInput}
              />
              <Pressable onPress={recoverPhone} disabled={recovering} style={[styles.recoveryButton, recovering && styles.disabledButton]}>
                <Text style={styles.recoveryButtonText}>{recovering ? '...' : 'Vérifier'}</Text>
              </Pressable>
            </View>
            {recovery ? (
              <View style={[styles.recoveryResult, recovery.found ? styles.recoveryFound : styles.recoveryMissing]}>
                {recovery.found && recovery.emailHint ? <Text style={styles.recoveryEmail}>Gmail associé : {recovery.emailHint}</Text> : null}
                <Text style={[styles.recoveryMessage, recovery.found ? styles.recoveryMessageFound : styles.recoveryMessageMissing]}>{recovery.message}</Text>
              </View>
            ) : null}
          </View>
        )}
        {recoveryOpen ? <Text style={styles.privacyText}>Le numéro aide à retrouver le bon compte Google. La connexion reste protégée par Google.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  loginContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 34 },
  loginHero: { alignItems: 'center', marginBottom: 8, width: '100%' },
  logoImage: { width: 92, height: 92, borderRadius: 26, marginBottom: 18, shadowColor: '#102A2A', shadowOpacity: 0.18, shadowRadius: 34, elevation: 8 },
  title: { color: colors.text, fontSize: 26, lineHeight: 31, fontWeight: '900', letterSpacing: 0, textAlign: 'center' },
  subtitle: { color: colors.secondary, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 16, fontWeight: '700', maxWidth: 360, textAlign: 'center' },
  notice: { width: '100%', maxWidth: 360, color: colors.danger, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 13, fontWeight: '800', marginBottom: 14, lineHeight: 18, textAlign: 'center' },
  primaryButton: { width: '100%', maxWidth: 360, minHeight: 58, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, shadowColor: '#102A2A', shadowOpacity: 0.22, shadowRadius: 22, elevation: 5 },
  disabledButton: { opacity: 0.55 },
  googleMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', color: colors.text, textAlign: 'center', lineHeight: 24, fontSize: 15, fontWeight: '900' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  policyRow: { width: '100%', maxWidth: 360, minHeight: 40, marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  policyCheckbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  policyCheckboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  policyCheckMark: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  policyText: { flex: 1, minWidth: 0, color: colors.muted, fontSize: 11.5, lineHeight: 17, fontWeight: '700' },
  policyLink: { color: colors.brand, fontWeight: '900', textDecorationLine: 'underline' },
  policyNotice: { width: '100%', maxWidth: 360, color: colors.danger, fontSize: 11.5, lineHeight: 16, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  recoveryLink: { width: '100%', maxWidth: 360, minHeight: 44, marginTop: 16, alignItems: 'center', justifyContent: 'center' },
  recoveryLinkText: { color: colors.brand, fontSize: 14, lineHeight: 18, fontWeight: '900', textDecorationLine: 'underline' },
  recoveryCard: { width: '100%', maxWidth: 360, marginTop: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.elevated, padding: 14 },
  recoveryTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 5 },
  recoveryCopy: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: '700', marginBottom: 10 },
  recoveryRow: { flexDirection: 'row', gap: 8 },
  recoveryInput: { flex: 1, minWidth: 0, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, fontSize: 14, fontWeight: '700' },
  recoveryButton: { minWidth: 86, minHeight: 46, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  recoveryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  recoveryResult: { marginTop: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10 },
  recoveryFound: { backgroundColor: '#ECFDF5', borderColor: '#BBF7D0' },
  recoveryMissing: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  recoveryEmail: { color: '#065F46', fontSize: 13, lineHeight: 18, fontWeight: '900', marginBottom: 4 },
  recoveryMessage: { fontSize: 12.5, lineHeight: 18, fontWeight: '800' },
  recoveryMessageFound: { color: '#047857' },
  recoveryMessageMissing: { color: '#B91C1C' },
  privacyText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 320, marginTop: 22, fontWeight: '700' },
});
