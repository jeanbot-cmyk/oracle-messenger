import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Phone } from 'lucide-react-native';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import { AlertText, Loading, PageHeader, PrimaryButton, SecondaryButton, Section } from './FeatureUi';

type CallEntry = {
  id: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  duration?: number;
  startedAt: string;
};

function formatDuration(seconds?: number) {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
}

function directionText(direction: CallEntry['direction']) {
  if (direction === 'missed') return 'Manqué';
  if (direction === 'incoming') return 'Reçu';
  return 'Émis';
}

export function CallsPage({
  token,
  onOpenContacts,
  onStartCallFromPeer,
}: {
  token: string;
  onOpenContacts: () => void;
  onStartCallFromPeer: (peerId: string, type: 'audio' | 'video') => Promise<void>;
}) {
  const [items, setItems] = useState<CallEntry[]>([]);
  const [filter, setFilter] = useState<'all' | CallEntry['direction']>('all');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setNotice('');
    try {
      const data = await api.callHistory(token);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Historique des appels indisponible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const clearHistory = useCallback(async () => {
    if (!items.length) return;
    setBusy(true);
    setNotice('');
    try {
      await api.clearCallHistory(token);
      setItems([]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Effacement de l’historique impossible.');
    } finally {
      setBusy(false);
    }
  }, [items.length, token]);

  const deleteEntry = useCallback(async (id: string) => {
    setBusy(true);
    setNotice('');
    try {
      await api.deleteCallHistoryEntry(token, id);
      setItems(current => current.filter(item => item.id !== id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Suppression appel impossible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const filteredItems = filter === 'all' ? items : items.filter(item => item.direction === filter);
  const filters = [
    { id: 'all' as const, label: 'Tous', count: items.length },
    { id: 'missed' as const, label: 'Manqués', count: items.filter(item => item.direction === 'missed').length },
    { id: 'incoming' as const, label: 'Reçus', count: items.filter(item => item.direction === 'incoming').length },
    { id: 'outgoing' as const, label: 'Émis', count: items.filter(item => item.direction === 'outgoing').length },
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <PageHeader title="Appels" subtitle="Historique audio et vidéo." />
      <Section title="Appels" right={<SecondaryButton label="Effacer" onPress={clearHistory} disabled={!items.length || busy} />}>
        <View style={styles.headRow}>
          <View>
            <Text style={styles.title}>Appels</Text>
            <Text style={styles.subtitle}>{items.length} appel{items.length > 1 ? 's' : ''} récent{items.length > 1 ? 's' : ''}</Text>
          </View>
          <PrimaryButton label="Nouvel appel" onPress={onOpenContacts} disabled={busy} />
        </View>
        <View style={styles.segment}>
          {filters.map(item => (
            <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.segmentItem, filter === item.id && styles.segmentActive]}>
              <Text style={[styles.segmentText, filter === item.id && styles.segmentTextActive]}>{item.label} ({item.count})</Text>
            </Pressable>
          ))}
        </View>
        <Loading active={busy} />
        <AlertText text={notice} />
        {!filteredItems.length && !busy ? (
          <View style={styles.empty}>
            <Phone size={34} color={colors.accent} />
            <Text style={styles.emptyTitle}>{items.length ? 'Aucun appel pour ce filtre' : 'Aucun appel récent'}</Text>
            <Text style={styles.emptyText}>{items.length ? 'Changez de filtre pour revoir tout l’historique.' : 'Vos appels apparaîtront ici.'}</Text>
          </View>
        ) : null}
        {filteredItems.map(item => (
          <View key={item.id} style={styles.callRow}>
            <View style={[styles.avatar, item.direction === 'missed' && styles.missedAvatar]}>
              {item.peerAvatar ? (
                <Image source={{ uri: item.peerAvatar }} style={styles.avatarImage} />
              ) : (
                <Text style={[styles.avatarText, item.direction === 'missed' && styles.missedText]}>{(item.peerName || '?').slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.callText}>
              <Text numberOfLines={1} style={styles.callName}>{item.peerName || 'Contact'}</Text>
              <Text style={[styles.callMeta, item.direction === 'missed' && styles.missedText]}>
                {directionText(item.direction)}{item.duration ? ` • ${formatDuration(item.duration)}` : ''}
              </Text>
              <Text style={styles.callDate}>{item.startedAt ? new Date(item.startedAt).toLocaleString('fr-FR') : ''}</Text>
            </View>
            <View style={styles.rowActions}>
              <SecondaryButton label="Audio" onPress={() => onStartCallFromPeer(item.peerId, 'audio')} disabled={busy || !item.peerId} />
              <SecondaryButton label="Vidéo" onPress={() => onStartCallFromPeer(item.peerId, 'video')} disabled={busy || !item.peerId} />
              <SecondaryButton label="Suppr." onPress={() => deleteEntry(item.id)} disabled={busy} />
            </View>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 86, backgroundColor: colors.background },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: colors.text, fontSize: 19, lineHeight: 22, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  callRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  missedAvatar: { backgroundColor: '#FEF2F2' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.brand, fontSize: 20, fontWeight: '900' },
  missedText: { color: '#DC2626' },
  callText: { flex: 1, minWidth: 0 },
  callName: { color: colors.text, fontSize: 15.5, fontWeight: '900' },
  callMeta: { color: colors.brand, fontSize: 12.5, fontWeight: '800', marginTop: 3 },
  callDate: { color: colors.muted, fontSize: 11.5, fontWeight: '700', marginTop: 4 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, maxWidth: 180 },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
});
