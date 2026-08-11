import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { User } from '@/types/messenger';
import { AlertText, Loading, PageHeader, PrimaryButton, SecondaryButton, Section, UserRow } from './FeatureUi';

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

async function fileToDataUrl(uri: string, mime = 'image/jpeg') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{valueText(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function AdminPage({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [broadcastMedia, setBroadcastMedia] = useState<{ url: string; type: string; name: string } | null>(null);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [settingKey, setSettingKey] = useState('');
  const [settingValue, setSettingValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [stats, metrics, users, countries, ai] = await Promise.all([
        api.adminStats(token),
        api.adminMetrics(token),
        api.adminUsers(token),
        api.adminCountries(token),
        api.adminAiAuto(token),
      ]);
      setData({ stats, metrics, users, countries, ai });
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Admin indisponible ou accès réservé.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const uploadBroadcastMedia = useCallback(async (input: { uri: string; name?: string; mime?: string; kind: string }) => {
    setBusy(true);
    setNotice('');
    try {
      const mime = input.mime || 'application/octet-stream';
      const uploaded = await api.mediaUpload(token, {
        dataUrl: await fileToDataUrl(input.uri, mime),
        name: input.name,
        mime,
        kind: input.kind,
      });
      setBroadcastMedia({ url: uploaded.url, type: uploaded.kind || input.kind, name: uploaded.name || input.name || 'media' });
      setNotice('Media admin prepare pour le message systeme.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Upload media admin impossible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const pickBroadcastMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour joindre une image ou video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.86,
      allowsEditing: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    await uploadBroadcastMedia({
      uri: asset.uri,
      name: asset.fileName || `broadcast-${Date.now()}`,
      mime: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: asset.type === 'video' ? 'video' : 'image',
    });
  }, [uploadBroadcastMedia]);

  const pickBroadcastDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    await uploadBroadcastMedia({
      uri: asset.uri,
      name: asset.name,
      mime: asset.mimeType || 'application/octet-stream',
      kind: asset.mimeType?.startsWith('audio/') ? 'audio' : 'file',
    });
  }, [uploadBroadcastMedia]);

  const broadcast = useCallback(async () => {
    if (!message.trim() && !broadcastMedia?.url) return;
    setBusy(true);
    try {
      await api.adminBroadcast(token, {
        content: message.trim(),
        mediaUrl: broadcastMedia?.url,
        type: broadcastMedia?.type || 'text',
      });
      setMessage('');
      setBroadcastMedia(null);
      setNotice('Message systeme envoye.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Message systeme impossible.');
    } finally {
      setBusy(false);
    }
  }, [broadcastMedia, message, token]);

  const notifyAll = useCallback(async () => {
    if (!notifTitle.trim() || !notifBody.trim()) return;
    setBusy(true);
    try {
      await api.adminNotify(token, { title: notifTitle.trim(), body: notifBody.trim() });
      setNotifTitle('');
      setNotifBody('');
      setNotice('Notification envoyée.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Notification impossible.');
    } finally {
      setBusy(false);
    }
  }, [notifBody, notifTitle, token]);

  const togglePlan = useCallback(async (code: string) => {
    const plans = Array.isArray(data?.ai?.plans) ? data.ai.plans : [];
    const nextPlans = plans.map((plan: any) => (
      plan.code === code ? { ...plan, enabled: !plan.enabled } : plan
    ));
    setBusy(true);
    setNotice('');
    try {
      const ai = await api.adminSaveAiPlans(token, nextPlans);
      setData((current: any) => ({ ...current, ai }));
      setNotice('Plan IA mis à jour.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Mise à jour plan IA impossible.');
    } finally {
      setBusy(false);
    }
  }, [data?.ai?.plans, token]);

  const saveAiSetting = useCallback(async () => {
    if (!settingKey.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      const ai = await api.adminSaveAiSettings(token, { [settingKey.trim()]: settingValue });
      setData((current: any) => ({ ...current, ai }));
      setSettingKey('');
      setSettingValue('');
      setNotice('Réglage IA mis à jour.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Mise à jour réglage IA impossible.');
    } finally {
      setBusy(false);
    }
  }, [settingKey, settingValue, token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <PageHeader title="Administration" subtitle="Statistiques, IA, notifications et message système." />
      <Section title="Administration" right={<SecondaryButton label="Actualiser" onPress={load} disabled={busy} />}>
        <Text style={styles.pageCopy}>Statistiques, utilisateurs, règles IA, notifications et message système admin. Toutes les données viennent du backend.</Text>
        <Loading active={busy} />
        <AlertText text={notice} />
        <View style={styles.statsGrid}>
          <Stat label="Utilisateurs" value={data?.stats?.totalUsers ?? data?.users?.length ?? 0} />
          <Stat label="En ligne" value={data?.stats?.onlineUsers ?? 0} />
          <Stat label="Messages" value={data?.stats?.totalMessages ?? 0} />
          <Stat label="IA active" value={data?.ai?.stats?.activeUsers ?? 0} />
          <Stat label="RAM" value={`${data?.metrics?.ramPct ?? 0}%`} />
          <Stat label="PWA" value={data?.stats?.pwaInstalls ?? 0} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Serveur</Text>
          <Text style={styles.cardMeta}>CPU {data?.metrics?.cpu ?? 0}% • RAM {valueText(data?.metrics?.ramUsed)} / {valueText(data?.metrics?.ramTotal)} MB • Load {valueText(data?.metrics?.loadAvg1m)} • {data?.metrics?.platform || 'platform inconnue'}</Text>
        </View>
        <TextInput value={message} onChangeText={setMessage} placeholder="Message systeme a envoyer" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
        <View style={styles.actionRow}>
          <SecondaryButton label="Image/video" onPress={pickBroadcastMedia} disabled={busy} />
          <SecondaryButton label="Document" onPress={pickBroadcastDocument} disabled={busy} />
          {broadcastMedia ? <SecondaryButton label="Retirer media" onPress={() => setBroadcastMedia(null)} disabled={busy} /> : null}
        </View>
        {broadcastMedia ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{broadcastMedia.name}</Text>
            <Text style={styles.cardMeta}>{broadcastMedia.type} • media pret pour diffusion admin</Text>
          </View>
        ) : null}
        <PrimaryButton label="Envoyer message systeme" onPress={broadcast} disabled={busy || (!message.trim() && !broadcastMedia?.url)} />
      </Section>

      <Section title="Notification globale">
        <TextInput value={notifTitle} onChangeText={setNotifTitle} placeholder="Titre notification" placeholderTextColor={colors.muted} style={styles.input} />
        <TextInput value={notifBody} onChangeText={setNotifBody} placeholder="Message notification" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
        <PrimaryButton label="Envoyer notification" onPress={notifyAll} disabled={busy || !notifTitle.trim() || !notifBody.trim()} />
      </Section>

      <Section title="Pays">
        {!data?.countries?.length ? <Text style={styles.empty}>Aucune statistique pays.</Text> : null}
        {data?.countries?.slice?.(0, 10)?.map((country: any) => (
          <View key={country.country || country.name} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{country.country || country.name || 'Pays'}</Text>
            <Text style={styles.infoValue}>{valueText(country.count)} utilisateur(s) • {valueText(country.online)} en ligne</Text>
          </View>
        ))}
      </Section>

      <Section title="Utilisateurs récents">
        {data?.users?.slice?.(0, 12)?.map((user: User) => <UserRow key={user.id || user.email} user={user} />)}
      </Section>

      <Section title="IA Admin">
        <View style={styles.statsGrid}>
          <Stat label="Usage" value={data?.ai?.stats?.usageCount ?? 0} />
          <Stat label="Mots" value={data?.ai?.stats?.wordsConsumed ?? 0} />
          <Stat label="Plans" value={data?.ai?.plans?.length ?? 0} />
          <Stat label="Réglages" value={data?.ai?.settings?.length ?? 0} />
        </View>
        {data?.ai?.plans?.slice?.(0, 8)?.map((plan: any) => (
          <View key={plan.code} style={styles.card}>
            <Text style={styles.cardTitle}>{plan.label || plan.code}</Text>
            <Text style={styles.cardMeta}>{plan.enabled ? 'Actif' : 'Inactif'} • {valueText(plan.priceFcfa)} FCFA • {valueText(plan.words)} mots</Text>
            <SecondaryButton label={plan.enabled ? 'Désactiver' : 'Activer'} onPress={() => togglePlan(plan.code)} disabled={busy} />
          </View>
        ))}
        <TextInput value={settingKey} onChangeText={setSettingKey} placeholder="Clé réglage IA" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.input} />
        <TextInput value={settingValue} onChangeText={setSettingValue} placeholder="Valeur" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
        <PrimaryButton label="Enregistrer réglage IA" onPress={saveAiSetting} disabled={busy || !settingKey.trim()} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 96, gap: 0, backgroundColor: colors.background },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  empty: { color: colors.muted, fontSize: 13, fontWeight: '800', paddingVertical: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '900', flexShrink: 0 },
  infoValue: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '800', flex: 1, textAlign: 'right' },
  card: { borderRadius: 16, padding: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, gap: 5 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', minHeight: 74, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 10, justifyContent: 'center' },
  statValue: { color: colors.header, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
