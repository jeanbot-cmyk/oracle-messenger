import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { User } from '@/types/messenger';
import { AlertText, Loading, PrimaryButton, SecondaryButton, Section, UserRow } from './FeatureUi';

type BroadcastMedia = {
  url: string;
  type: string;
  name: string;
  mime?: string;
  size?: number;
  checksum?: string;
};

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

function DashboardCard({ icon, value, label, sub, tint }: { icon: string; value: unknown; label: string; sub: string; tint: string }) {
  return (
    <View style={styles.dashboardCard}>
      <View style={[styles.dashboardIcon, { backgroundColor: tint }]}>
        <Text style={styles.dashboardIconText}>{icon}</Text>
      </View>
      <View style={styles.dashboardCopy}>
        <Text style={styles.dashboardValue}>{valueText(value)}</Text>
        <Text style={styles.dashboardLabel}>{label}</Text>
        <Text style={styles.dashboardSub}>{sub}</Text>
      </View>
    </View>
  );
}

export function AdminPage({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [broadcastMedia, setBroadcastMedia] = useState<BroadcastMedia | null>(null);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [settingKey, setSettingKey] = useState('');
  const [settingValue, setSettingValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [systemOpen, setSystemOpen] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');

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
      setLastUpdatedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
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
      setBroadcastMedia({
        url: uploaded.url,
        type: uploaded.kind || input.kind,
        name: uploaded.name || input.name || 'media',
        mime: uploaded.mime || mime,
        size: uploaded.size,
        checksum: uploaded.checksum,
      });
      setNotice('Média admin prêt pour le message système.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Upload media admin impossible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const pickBroadcastMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour joindre une image ou vidéo.');
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
    setNotice('');
    try {
      const content = broadcastMedia
        ? JSON.stringify({
            url: broadcastMedia.url,
            name: broadcastMedia.name,
            mime: broadcastMedia.mime,
            size: broadcastMedia.size,
            checksum: broadcastMedia.checksum,
            caption: message.trim() || undefined,
          })
        : message.trim();
      const result = await api.adminBroadcast(token, {
        content,
        type: broadcastMedia?.type || 'text',
      });
      setMessage('');
      setBroadcastMedia(null);
      const sent = Number(result?.sent ?? 0);
      const total = Number(result?.total ?? 0);
      setNotice(total > 0 ? `Message système envoyé à ${sent}/${total} utilisateur(s).` : 'Message système envoyé.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Message système impossible.');
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
      <View style={styles.adminHero}>
        <View style={styles.adminHeroText}>
          <Text style={styles.adminTitle}>Panel Admin</Text>
          <Text style={styles.adminSubtitle}>Oracle Messenger · données API réelles</Text>
        </View>
        <View style={styles.adminHeroActions}>
          <Pressable style={styles.systemButton} onPress={() => setSystemOpen(current => !current)}>
            <Text style={styles.systemButtonText}>{systemOpen ? 'Masquer message' : '📢 Message système'}</Text>
          </Pressable>
          <Pressable style={styles.backChatButton} onPress={onBack}>
            <Text style={styles.backChatText}>← Retour au chat</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.dashboardNotice}>
        <View style={styles.dashboardNoticeText}>
          <Text style={styles.dashboardNoticeTitle}>Tableau de bord temps réel</Text>
          <Text style={styles.dashboardNoticeSub}>Rafraîchissement automatique toutes les 10s · dernière mise à jour {lastUpdatedAt || '--:--:--'}</Text>
        </View>
        <Pressable style={styles.refreshButton} onPress={load} disabled={busy}>
          <Text style={styles.refreshButtonText}>Actualiser</Text>
        </Pressable>
      </View>

      <View style={styles.noticeWrap}>
        <Loading active={busy} />
        <AlertText text={notice} />
      </View>

      <View style={styles.dashboardList}>
        <DashboardCard icon="👥" value={data?.stats?.totalUsers ?? data?.users?.length ?? 0} label="Utilisateurs" sub={`${valueText(data?.stats?.premiumUsers ?? data?.stats?.premium ?? 0)} premium`} tint="#EEF2F1" />
        <DashboardCard icon="●" value={data?.stats?.onlineUsers ?? 0} label="En ligne maintenant" sub="WebSocket + API" tint="#EAFBF1" />
        <DashboardCard icon="📲" value={data?.stats?.pwaInstalls ?? 0} label="Installations PWA" sub="installations enregistrées" tint="#F3EFFF" />
        <DashboardCard icon="💬" value={data?.stats?.totalMessages ?? 0} label="Messages" sub={`${valueText(data?.stats?.totalConversations ?? data?.stats?.conversations ?? 0)} conversations`} tint="#EFF6FF" />
        <DashboardCard icon="⚡" value={`${data?.metrics?.cpu ?? 0}%`} label="CPU serveur" sub={`charge ${valueText(data?.metrics?.loadAvg1m ?? 0)}`} tint="#FFF7ED" />
      </View>

      {systemOpen ? (
        <Section title="Message système">
        <Text style={styles.pageCopy}>Ce message arrive dans la conversation officielle O.Messenger. Texte seul, média seul ou texte avec image, vidéo, audio ou document.</Text>
        <TextInput value={message} onChangeText={setMessage} placeholder="Rédigez votre annonce, lien ou message officiel..." placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
        <View style={styles.actionRow}>
          <SecondaryButton label="Image/vidéo" onPress={pickBroadcastMedia} disabled={busy} />
          <SecondaryButton label="Document" onPress={pickBroadcastDocument} disabled={busy} />
          {broadcastMedia ? <SecondaryButton label="Retirer media" onPress={() => setBroadcastMedia(null)} disabled={busy} /> : null}
        </View>
        {broadcastMedia ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{broadcastMedia.name}</Text>
            <Text style={styles.cardMeta}>{broadcastMedia.type} • média prêt pour diffusion admin{message.trim() ? ' • + texte' : ''}</Text>
          </View>
        ) : null}
        <PrimaryButton label="Envoyer dans le canal officiel" onPress={broadcast} disabled={busy || (!message.trim() && !broadcastMedia?.url)} />
        </Section>
      ) : null}

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
  page: { paddingBottom: 84, gap: 0, backgroundColor: colors.background },
  adminHero: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  adminHeroText: { flex: 1, minWidth: 0 },
  adminTitle: { color: colors.text, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  adminSubtitle: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 5 },
  adminHeroActions: { width: 128, gap: 7, alignItems: 'stretch' },
  systemButton: { minHeight: 38, borderRadius: 13, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  systemButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  backChatButton: { minHeight: 38, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, shadowColor: '#102A2A', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  backChatText: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  dashboardNotice: { marginHorizontal: 16, marginTop: 4, marginBottom: 14, borderRadius: 16, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.14)', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dashboardNoticeText: { flex: 1, minWidth: 0 },
  dashboardNoticeTitle: { color: colors.header, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  dashboardNoticeSub: { color: colors.header, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  refreshButton: { minHeight: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  refreshButtonText: { color: colors.brand, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  noticeWrap: { paddingHorizontal: 16, gap: 8 },
  dashboardList: { paddingHorizontal: 10, gap: 8 },
  dashboardCard: { minHeight: 74, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  dashboardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dashboardIconText: { fontSize: 18, lineHeight: 22, fontWeight: '900' },
  dashboardCopy: { flex: 1, minWidth: 0 },
  dashboardValue: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  dashboardLabel: { color: colors.secondary, fontSize: 12.5, lineHeight: 16, fontWeight: '900', marginTop: 2 },
  dashboardSub: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 3 },
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
