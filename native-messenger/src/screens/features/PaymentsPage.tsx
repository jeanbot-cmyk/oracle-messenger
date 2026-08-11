import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import { AlertText, Loading, PrimaryButton, SecondaryButton, Section } from './FeatureUi';

type PaymentScope = 'ai' | 'flyer' | 'video' | 'business';

export function PaymentsPage({ token }: { token: string }) {
  const [scope, setScope] = useState<PaymentScope>('ai');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<any>(null);

  const initialize = useCallback(async () => {
    setBusy(true);
    setNotice('');
    setResult(null);
    try {
      const data = scope === 'ai'
        ? await api.aiAutoInitializePaystack(token, 'starter')
        : scope === 'flyer'
          ? await api.aiFlyerInitializePaystack(token)
          : scope === 'video'
            ? await api.aiVideoInitializePaystack(token)
            : await api.businessInitializePaystack(token);
      setReference(data.reference || '');
      await Linking.openURL(data.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Initialisation paiement impossible.');
    } finally {
      setBusy(false);
    }
  }, [scope, token]);

  const verify = useCallback(async () => {
    const clean = reference.trim();
    if (!clean) return;
    setBusy(true);
    setNotice('');
    try {
      const data = scope === 'ai'
        ? await api.aiAutoVerifyPaystack(token, clean)
        : scope === 'flyer'
          ? await api.aiFlyerVerifyPaystack(token, clean)
          : scope === 'video'
            ? await api.aiVideoVerifyPaystack(token, clean)
            : await api.businessVerifyPaystack(token, clean);
      setResult(data);
      setNotice('Vérification serveur terminée.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Vérification paiement impossible.');
    } finally {
      setBusy(false);
    }
  }, [reference, scope, token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Paiements">
        <Text style={styles.pageCopy}>Paystack est vérifié côté serveur par référence. Le retour visuel Android ne suffit jamais à valider un crédit.</Text>
        <View style={styles.segment}>
          {(['ai', 'flyer', 'video', 'business'] as const).map(item => (
            <Pressable key={item} onPress={() => setScope(item)} style={[styles.segmentItem, scope === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, scope === item && styles.segmentTextActive]}>{item === 'ai' ? 'IA' : item === 'flyer' ? 'Flyer' : item === 'video' ? 'Vidéo' : 'Business'}</Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="Démarrer paiement Paystack" onPress={initialize} disabled={busy} />
        <TextInput value={reference} onChangeText={setReference} placeholder="Référence Paystack à vérifier" placeholderTextColor={colors.muted} style={styles.input} />
        <SecondaryButton label="Vérifier côté serveur" onPress={verify} disabled={busy || !reference.trim()} />
        <Loading active={busy} />
        <AlertText text={notice} />
        {result ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Résultat serveur</Text>
            <Text style={styles.cardText}>{JSON.stringify(result, null, 2)}</Text>
          </View>
        ) : null}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, paddingBottom: 96, gap: 12 },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  card: { borderRadius: 16, padding: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, gap: 5 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardText: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
});
