import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/services/api';
import {
  clearPendingPaystackPayment,
  rememberPendingPaystackPayment,
  verifyPaystackScope,
} from '@/services/pendingPaystack';
import { colors } from '@/theme/colors';
import { AlertText, Loading, PageHeader, PrimaryButton, SecondaryButton, Section } from './FeatureUi';

type PaymentScope = 'ai' | 'flyer' | 'video' | 'business';

export function PaymentsPage({ token }: { token: string }) {
  const [scope, setScope] = useState<PaymentScope>('ai');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<any>(null);
  const [westernUnion, setWesternUnion] = useState<any>(null);

  useEffect(() => {
    api.businessWesternUnionConfig(token)
      .then(setWesternUnion)
      .catch(() => undefined);
  }, [token]);

  const initialize = useCallback(async () => {
    setBusy(true);
    setNotice('');
    setResult(null);
    try {
      const data = scope === 'ai'
        ? await api.aiAutoInitializePaystack(token, 'activation_1500')
        : scope === 'flyer'
          ? await api.aiFlyerInitializePaystack(token)
          : scope === 'video'
            ? await api.aiVideoInitializePaystack(token)
            : await api.businessInitializePaystack(token);
      setReference(data.reference || '');
      await rememberPendingPaystackPayment(scope, data.reference);
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
      const data = await verifyPaystackScope(token, scope, clean);
      await clearPendingPaystackPayment(clean);
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
      <PageHeader title="Paiements" subtitle="Paystack, Western Union international, crédits IA, vidéo, flyers et Business." />
      <Section title="Paiements">
        <Text style={styles.pageCopy}>Paystack est le paiement direct pour les utilisateurs en Côte d’Ivoire. Le forfait Business entreprise est validé côté serveur et débloque les droits du mois; le retour visuel Android ne suffit jamais à valider un crédit.</Text>
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
      <Section title="Western Union international">
        <Text style={styles.pageCopy}>Pour les utilisateurs hors Côte d’Ivoire, le même forfait entreprise peut être payé par Western Union. Le reçu original doit être photographié dans l’espace Business pour validation automatique en deux contrôles ou validation admin.</Text>
        {westernUnion?.config ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payer par Western Union</Text>
            <Text style={styles.cardText}>Montant minimum : {Number(westernUnion.config.minimumAmountFcfa || 50000).toLocaleString('fr-FR')} FCFA. Les frais de transfert sont à la charge de l’utilisateur.</Text>
            <Text style={styles.cardText}>Bénéficiaire : {westernUnion.config.beneficiaryFullName} · {westernUnion.config.beneficiaryPhone} · {westernUnion.config.beneficiaryCountry}</Text>
            <Text style={styles.cardText}>Forfait : 1 mois, 8 000 mots IA/jour, 1 session conférence/semaine, 3 vidéos 45s/semaine, 6 flyers/semaine, badge bleu vérifié et assistance administrateur. Bibliothèque exclue.</Text>
            {!westernUnion.available ? <Text style={styles.warningText}>{westernUnion.unavailableReason || 'Western Union indisponible pour ce compte.'}</Text> : null}
          </View>
        ) : (
          <Text style={styles.pageCopy}>Chargement des coordonnées Western Union...</Text>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 96, gap: 0, backgroundColor: colors.background },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  card: { borderRadius: 16, padding: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, gap: 5 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardText: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  warningText: { color: '#92400E', backgroundColor: '#FFFBEB', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
});
