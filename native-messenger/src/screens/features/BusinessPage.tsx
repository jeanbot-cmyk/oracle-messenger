import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import { AlertText, Loading, PrimaryButton, SecondaryButton, Section } from './FeatureUi';

type BusinessMode = 'clients' | 'reminders' | 'stats';

const BUSINESS_STATUS_OPTIONS = ['prospect', 'chaud', 'froid', 'relancer', 'paye', 'vip', 'perdu'] as const;

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{valueText(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function BusinessPage({ token }: { token: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [mode, setMode] = useState<BusinessMode>('clients');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientStatus, setClientStatus] = useState('prospect');
  const [clientValue, setClientValue] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setOverview(await api.businessOverview(token));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Business indisponible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const clients = Array.isArray(overview?.clients) ? overview.clients : [];
  const reminders = Array.isArray(overview?.reminders) ? overview.reminders : [];
  const payments = Array.isArray(overview?.payments) ? overview.payments : [];
  const access = overview?.access;
  const canAct = Boolean(access?.canAct);

  const pay = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api.businessInitializePaystack(token);
      if (data.authorizationUrl) await Linking.openURL(data.authorizationUrl);
      else await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Paiement Business impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, token]);

  const saveClient = useCallback(async () => {
    if (!clientName.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      await api.businessSaveClient(token, {
        name: clientName.trim(),
        phone: clientPhone.trim() || undefined,
        email: clientEmail.trim() || undefined,
        status: clientStatus,
        tags: [clientStatus],
        notes: clientNotes.trim(),
        value: Number(clientValue) || 0,
      });
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientStatus('prospect');
      setClientValue('');
      setClientNotes('');
      await load();
      setNotice('Client Business enregistré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement client impossible.');
    } finally {
      setBusy(false);
    }
  }, [clientEmail, clientName, clientNotes, clientPhone, clientStatus, clientValue, load, token]);

  const saveReminder = useCallback(async () => {
    if (!reminderDate.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      await api.businessSaveReminder(token, {
        clientId: selectedClientId || undefined,
        dueAt: reminderDate.trim(),
        note: reminderNote.trim(),
      });
      setReminderDate('');
      setReminderNote('');
      await load();
      setNotice('Rappel Business enregistré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement rappel impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, reminderDate, reminderNote, selectedClientId, token]);

  const markDone = useCallback(async (id: string, done: boolean) => {
    setBusy(true);
    setNotice('');
    try {
      await api.businessMarkReminderDone(token, id, done);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Mise à jour rappel impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Business Hub">
        <Text style={styles.pageCopy}>CRM, rappels et accès Business reliés aux données serveur. Aucune statistique fictive n’est affichée.</Text>
        <View style={styles.statsGrid}>
          <Stat label="Clients" value={clients.length} />
          <Stat label="Relances" value={reminders.length} />
          <Stat label="Paiements" value={payments.length} />
          <Stat label="Accès" value={canAct ? 'Actif' : 'Bloqué'} />
        </View>
        {!canAct ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Accès Business requis</Text>
            <Text style={styles.cardText}>
              {access?.subscriptionActive === false
                ? `Abonnement requis: ${valueText(access?.monthlyPriceFcfa || 5000)} FCFA/mois.`
                : access?.aiCreditsOk === false
                  ? 'Crédit IA insuffisant pour les actions Business.'
                  : 'Activez Business pour enregistrer des données CRM.'}
            </Text>
            <PrimaryButton label="Activer / renouveler avec Paystack" onPress={pay} disabled={busy} />
          </View>
        ) : <SecondaryButton label="Renouveler Business" onPress={pay} disabled={busy} />}
        <View style={styles.segment}>
          {(['clients', 'reminders', 'stats'] as const).map(item => (
            <Pressable key={item} onPress={() => setMode(item)} style={[styles.segmentItem, mode === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>{item === 'clients' ? 'Clients' : item === 'reminders' ? 'Rappels' : 'Stats'}</Text>
            </Pressable>
          ))}
        </View>
        <Loading active={busy} />
        <AlertText text={notice} />
      </Section>

      {mode === 'clients' ? (
        <Section title="Clients">
          <TextInput value={clientName} onChangeText={setClientName} placeholder="Nom client" placeholderTextColor={colors.muted} style={styles.input} />
          <View style={styles.actionRow}>
            <TextInput value={clientPhone} onChangeText={setClientPhone} placeholder="Téléphone" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={[styles.input, styles.inlineInput]} />
            <TextInput value={clientEmail} onChangeText={setClientEmail} placeholder="Email" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={[styles.input, styles.inlineInput]} />
          </View>
          <View style={styles.segment}>
            {BUSINESS_STATUS_OPTIONS.map(status => (
              <Pressable key={status} onPress={() => setClientStatus(status)} style={[styles.segmentItem, clientStatus === status && styles.segmentActive]}>
                <Text style={[styles.segmentText, clientStatus === status && styles.segmentTextActive]}>{status === 'paye' ? 'payé' : status}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={clientValue} onChangeText={setClientValue} placeholder="Valeur FCFA" placeholderTextColor={colors.muted} keyboardType="numeric" style={styles.input} />
          <TextInput value={clientNotes} onChangeText={setClientNotes} placeholder="Notes" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
          <PrimaryButton label="Enregistrer client" onPress={saveClient} disabled={busy || !clientName.trim()} />
          {!clients.length ? <Text style={styles.empty}>Aucun client Business.</Text> : null}
          {clients.map((client: any) => (
            <View key={client.id} style={styles.card}>
              <Text style={styles.cardTitle}>{client.name || 'Client'}</Text>
              <Text style={styles.cardText}>{client.phone || client.email || 'Coordonnées non renseignées'}</Text>
              <Text style={styles.cardMeta}>{client.status || 'prospect'} • {valueText(client.value || 0)} FCFA • {client.updatedAt ? new Date(client.updatedAt).toLocaleString('fr-FR') : ''}</Text>
              {client.notes ? <Text numberOfLines={3} style={styles.cardText}>{client.notes}</Text> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {mode === 'reminders' ? (
        <Section title="Rappels">
          <View style={styles.segment}>
            <Pressable onPress={() => setSelectedClientId('')} style={[styles.segmentItem, !selectedClientId && styles.segmentActive]}>
              <Text style={[styles.segmentText, !selectedClientId && styles.segmentTextActive]}>Général</Text>
            </Pressable>
            {clients.slice(0, 8).map((client: any) => (
              <Pressable key={client.id} onPress={() => setSelectedClientId(client.id)} style={[styles.segmentItem, selectedClientId === client.id && styles.segmentActive]}>
                <Text numberOfLines={1} style={[styles.segmentText, selectedClientId === client.id && styles.segmentTextActive]}>{client.name}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={reminderDate} onChangeText={setReminderDate} placeholder="Date ISO: 2026-08-12T09:00:00Z" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput value={reminderNote} onChangeText={setReminderNote} placeholder="Note du rappel" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
          <PrimaryButton label="Créer rappel" onPress={saveReminder} disabled={busy || !reminderDate.trim()} />
          {!reminders.length ? <Text style={styles.empty}>Aucun rappel Business.</Text> : null}
          {reminders.map((reminder: any) => (
            <View key={reminder.id} style={styles.card}>
              <Text style={styles.cardTitle}>{reminder.title || 'Rappel Business'}</Text>
              <Text style={styles.cardText}>{reminder.note || 'Sans note'}</Text>
              <Text style={styles.cardMeta}>{reminder.dueAt ? new Date(reminder.dueAt).toLocaleString('fr-FR') : ''} • {reminder.done ? 'Terminé' : 'À faire'}</Text>
              <SecondaryButton label={reminder.done ? 'Réouvrir' : 'Terminer'} onPress={() => markDone(reminder.id, !reminder.done)} disabled={busy} />
            </View>
          ))}
        </Section>
      ) : null}

      {mode === 'stats' ? (
        <Section title="Statistiques Business">
          <View style={styles.statsGrid}>
            <Stat label="Actifs" value={clients.filter((client: any) => client.status !== 'perdu').length} />
            <Stat label="Payés" value={clients.filter((client: any) => client.status === 'paye').length} />
            <Stat label="Valeur" value={clients.reduce((sum: number, client: any) => sum + (Number(client.value) || 0), 0)} />
            <Stat label="À faire" value={reminders.filter((reminder: any) => !reminder.done).length} />
          </View>
          {payments.map((payment: any) => (
            <View key={payment.id || payment.reference} style={styles.card}>
              <Text style={styles.cardTitle}>{payment.reference || 'Paiement'}</Text>
              <Text style={styles.cardMeta}>{payment.status || 'pending'} • {valueText(payment.amountFcfa || 0)} FCFA • {payment.createdAt ? new Date(payment.createdAt).toLocaleString('fr-FR') : ''}</Text>
            </View>
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, paddingBottom: 96, gap: 12 },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  empty: { color: colors.muted, fontSize: 13, fontWeight: '800', paddingVertical: 10 },
  card: { borderRadius: 16, padding: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, gap: 5 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardText: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', minHeight: 74, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 10, justifyContent: 'center' },
  statValue: { color: colors.header, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  inlineInput: { flex: 1, minWidth: 130 },
});
