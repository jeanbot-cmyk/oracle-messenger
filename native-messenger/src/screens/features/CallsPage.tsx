import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MoreVertical, Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search, Video } from 'lucide-react-native';
import { api } from '@/services/api';
import { lightImpactHaptic, selectionHaptic } from '@/services/haptics';
import { colors } from '@/theme/colors';
import { NativePhotoViewer } from '@/screens/home/NativePhotoViewer';
import { highQualityImageUri } from '@/screens/home/homeUtils';
import { AlertText, Loading } from './FeatureUi';
import type { NativeCallDiagnosticEntry } from '@/hooks/nativeCallUtils';

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

function typeText(type: CallEntry['type']) {
  return type === 'video' ? 'Vidéo' : 'Audio';
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function DirectionIcon({ direction }: { direction: CallEntry['direction'] }) {
  const Icon = direction === 'missed' ? PhoneMissed : direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
  return <Icon size={13} color="#FFFFFF" strokeWidth={2.7} />;
}

function IconAction({
  label,
  icon: Icon,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  icon: typeof Phone;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={event => {
        event.stopPropagation();
        selectionHaptic();
        onPress();
      }}
      disabled={disabled}
      android_ripple={{ color: danger ? 'rgba(180,35,24,0.12)' : 'rgba(16,42,42,0.10)', borderless: true }}
      style={({ pressed }) => [
        styles.iconAction,
        danger && styles.iconActionDanger,
        pressed && !disabled && styles.iconActionPressed,
        disabled && styles.disabledAction,
      ]}
    >
      <Icon size={17} color={danger ? colors.danger : colors.header} strokeWidth={2.25} />
    </Pressable>
  );
}

function CallsSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.searchWrap}>
      <View style={styles.searchRow}>
        <Search size={19} color="#64748B" strokeWidth={2.1} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Rechercher..."
          placeholderTextColor="#94A3B8"
          maxFontSizeMultiplier={1.08}
          style={styles.searchInput}
        />
      </View>
    </View>
  );
}

function HeaderButton({ label, onPress, disabled, primary }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      disabled={disabled}
      android_ripple={{ color: primary ? 'rgba(255,255,255,0.18)' : 'rgba(16,42,42,0.08)' }}
      style={({ pressed }) => [
        styles.headerButton,
        primary && styles.headerButtonPrimary,
        pressed && !disabled && styles.headerButtonPressed,
        disabled && styles.disabledAction,
      ]}
    >
      <Text style={[styles.headerButtonText, primary && styles.headerButtonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function InlineButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.inlineButton, pressed && !disabled && styles.inlineButtonPressed, disabled && styles.disabledAction]}
    >
      <Text style={styles.inlineButtonText}>{label}</Text>
    </Pressable>
  );
}

export function CallsPage({
  token,
  onOpenContacts,
  onStartCallFromPeer,
  callDiagnostics,
  onClearCallDiagnostics,
  isAdmin,
}: {
  token: string;
  onOpenContacts: () => void;
  onStartCallFromPeer: (peerId: string, type: 'audio' | 'video') => Promise<void>;
  callDiagnostics: NativeCallDiagnosticEntry[];
  onClearCallDiagnostics: () => void;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<CallEntry[]>([]);
  const [filter, setFilter] = useState<'all' | CallEntry['direction']>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [callingId, setCallingId] = useState('');
  const [notice, setNotice] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<{ uri?: string | null; name: string } | null>(null);

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

  const callBack = useCallback(async (entry: CallEntry, typeOverride?: CallEntry['type']) => {
    if (!entry.peerId || busy || callingId) return;
    setCallingId(entry.id);
    setNotice('');
    try {
      await onStartCallFromPeer(entry.peerId, typeOverride || entry.type || 'audio');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Relance de l’appel impossible.');
    } finally {
      setCallingId('');
    }
  }, [busy, callingId, onStartCallFromPeer]);

  const openEntryMenu = useCallback((entry: CallEntry) => {
    Alert.alert(entry.peerName || 'Appel', 'Choisissez une action.', [
      { text: 'Appel audio', onPress: () => void callBack(entry, 'audio') },
      { text: 'Appel vidéo', onPress: () => void callBack(entry, 'video') },
      { text: 'Supprimer de l’historique', style: 'destructive', onPress: () => void deleteEntry(entry.id) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [callBack, deleteEntry]);

  const filteredItems = (filter === 'all' ? items : items.filter(item => item.direction === filter)).filter(item => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${item.peerName} ${directionText(item.direction)} ${typeText(item.type)}`.toLowerCase().includes(needle);
  });
  const filters = [
    { id: 'all' as const, label: 'Tous', count: items.length },
    { id: 'missed' as const, label: 'Manqués', count: items.filter(item => item.direction === 'missed').length },
    { id: 'incoming' as const, label: 'Reçus', count: items.filter(item => item.direction === 'incoming').length },
    { id: 'outgoing' as const, label: 'Émis', count: items.filter(item => item.direction === 'outgoing').length },
  ];

  return (
    <>
    <ScrollView contentContainerStyle={styles.page}>
      <CallsSearch value={query} onChange={setQuery} />
      <View style={styles.intro}>
        <View style={styles.headRow}>
          <View style={styles.titleBlock}>
            <Text maxFontSizeMultiplier={1.08} style={styles.title}>Appels</Text>
            <View style={styles.subtitleRow}>
              <Text maxFontSizeMultiplier={1.08} style={styles.subtitle}>{items.length} appel{items.length > 1 ? 's' : ''} récent{items.length > 1 ? 's' : ''}</Text>
              <InlineButton label="Effacer" onPress={clearHistory} disabled={!items.length || busy} />
            </View>
          </View>
          <HeaderButton label="Nouvel appel" onPress={onOpenContacts} disabled={busy} primary />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map(item => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  selectionHaptic();
                  setFilter(item.id);
                }}
                style={({ pressed }) => [styles.filterPill, active && styles.filterPillActive, pressed && styles.filterPillPressed]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{item.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <Loading active={busy} />
        <AlertText text={notice} />
      </View>
      <View style={styles.callsList}>
        {!filteredItems.length && !busy ? (
          <View style={styles.empty}>
            <Phone size={32} color={colors.accent} />
            <Text style={styles.emptyTitle}>{items.length ? 'Aucun appel pour ce filtre' : 'Aucun appel récent'}</Text>
            <Text style={styles.emptyText}>{items.length ? 'Changez de filtre pour revoir tout l’historique.' : 'Vos appels apparaîtront ici.'}</Text>
          </View>
        ) : null}
        {filteredItems.map(item => {
          const disabled = busy || Boolean(callingId) || !item.peerId;
          const isCalling = callingId === item.id;
          const peerAvatar = highQualityImageUri(item.peerAvatar) || item.peerAvatar;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Rappeler ${item.peerName || 'ce contact'} en ${typeText(item.type).toLowerCase()}`}
              onPress={() => {
                lightImpactHaptic();
                void callBack(item);
              }}
              disabled={disabled}
              android_ripple={{ color: 'rgba(16,42,42,0.08)' }}
              style={({ pressed }) => [
                styles.callRow,
                item.direction === 'missed' && styles.missedRow,
                pressed && !disabled && styles.callRowPressed,
                disabled && styles.disabledRow,
              ]}
            >
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel={`Photo de ${item.peerName || 'Contact'}`}
                onPress={event => {
                  event.stopPropagation();
                  selectionHaptic();
                  setAvatarPreview({ uri: peerAvatar, name: item.peerName || 'Contact' });
                }}
                hitSlop={8}
                style={styles.avatarWrap}
              >
                <View style={[styles.avatar, item.direction === 'missed' && styles.missedAvatar]}>
                  {peerAvatar ? (
                    <Image source={{ uri: peerAvatar }} style={styles.avatarImage} />
                  ) : (
                    <Text style={[styles.avatarText, item.direction === 'missed' && styles.missedText]}>{(item.peerName || '?').slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                <View style={[styles.directionBadge, item.direction === 'missed' && styles.directionBadgeMissed]}>
                  <DirectionIcon direction={item.direction} />
                </View>
              </Pressable>
              <View style={styles.callText}>
                <Text numberOfLines={1} style={styles.callName}>{item.peerName || 'Contact'}</Text>
                <Text style={[styles.callMeta, item.direction === 'missed' && styles.missedText]}>
                  {typeText(item.type)} • {directionText(item.direction)}{item.duration ? ` • ${formatDuration(item.duration)}` : ''}
                </Text>
                <Text numberOfLines={1} style={styles.callDate}>{isCalling ? 'Relance de l’appel...' : formatDate(item.startedAt)}</Text>
              </View>
              <View style={styles.rowActions}>
                <IconAction label={`Rappeler en ${typeText(item.type).toLowerCase()}`} icon={item.type === 'video' ? Video : PhoneCall} onPress={() => callBack(item)} disabled={disabled} />
                <IconAction label="Autres actions" icon={MoreVertical} onPress={() => openEntryMenu(item)} disabled={busy || Boolean(callingId)} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {isAdmin ? (
        <View style={styles.diagnosticsPanel}>
          <View style={styles.diagnosticsHeader}>
            <View style={styles.diagnosticsTitleWrap}>
              <Text style={styles.diagnosticsTitle}>Diagnostic appels</Text>
              <Text style={styles.diagnosticsSub}>{callDiagnostics.length ? `${callDiagnostics.length} événement(s) récents` : 'Aucun événement enregistré'}</Text>
            </View>
            <InlineButton label="Vider" onPress={onClearCallDiagnostics} disabled={!callDiagnostics.length} />
          </View>
          {callDiagnostics.slice(0, 12).map(item => (
            <View key={item.id} style={styles.diagnosticRow}>
              <View style={styles.diagnosticDot} />
              <View style={styles.diagnosticBody}>
                <Text numberOfLines={1} style={styles.diagnosticEvent}>{item.event}</Text>
                <Text numberOfLines={2} style={styles.diagnosticMeta}>
                  {new Date(item.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  {' · '}
                  {item.state}
                  {item.callId ? ` · ${item.callId.slice(0, 18)}` : ''}
                  {item.details && Object.keys(item.details).length ? ` · ${JSON.stringify(item.details).slice(0, 120)}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
    <NativePhotoViewer
      visible={Boolean(avatarPreview)}
      uri={avatarPreview?.uri}
      title={avatarPreview?.name}
      fallbackText={(avatarPreview?.name || '?').slice(0, 2).toUpperCase()}
      onClose={() => setAvatarPreview(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 132, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8, backgroundColor: colors.surface },
  searchRow: { minHeight: 42, borderRadius: 21, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
  searchInput: { flex: 1, minHeight: 40, color: colors.text, fontSize: 14.5, fontWeight: '800', paddingHorizontal: 0 },
  intro: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, backgroundColor: colors.background, gap: 9 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 21, lineHeight: 25, fontWeight: '900' },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 16, fontWeight: '700' },
  topActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, maxWidth: 168 },
  headerButton: { minHeight: 34, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  headerButtonPrimary: { backgroundColor: colors.header, borderColor: colors.header },
  headerButtonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  headerButtonText: { color: colors.header, fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  headerButtonTextPrimary: { color: '#FFFFFF' },
  inlineButton: { minHeight: 24, borderRadius: 12, backgroundColor: '#EAF4F1', paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  inlineButtonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  inlineButtonText: { color: colors.header, fontSize: 11.5, lineHeight: 14, fontWeight: '900' },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  callsList: { gap: 8, paddingHorizontal: 14, paddingTop: 5, paddingBottom: 24 },
  diagnosticsPanel: { marginHorizontal: 14, marginBottom: 28, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 10 },
  diagnosticsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  diagnosticsTitleWrap: { flex: 1, minWidth: 0 },
  diagnosticsTitle: { color: colors.text, fontSize: 15.5, lineHeight: 19, fontWeight: '900' },
  diagnosticsSub: { color: colors.muted, fontSize: 12.5, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  diagnosticRow: { minHeight: 48, borderRadius: 13, backgroundColor: colors.input, flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 10, paddingVertical: 9 },
  diagnosticDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand, marginTop: 5 },
  diagnosticBody: { flex: 1, minWidth: 0 },
  diagnosticEvent: { color: colors.text, fontSize: 12.8, lineHeight: 16, fontWeight: '900' },
  diagnosticMeta: { color: colors.secondary, fontSize: 11.5, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  callRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, paddingHorizontal: 9, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: '#102A2A', shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  callRowPressed: { backgroundColor: '#EAF4F1', borderColor: colors.borderStrong },
  missedRow: { backgroundColor: '#FFF7F7' },
  disabledRow: { opacity: 0.68 },
  avatarWrap: { width: 50, height: 50, justifyContent: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  missedAvatar: { backgroundColor: '#FEF2F2' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.brand, fontSize: 17, fontWeight: '900' },
  missedText: { color: '#DC2626' },
  directionBadge: { position: 'absolute', right: 0, bottom: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.header, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  directionBadgeMissed: { backgroundColor: '#DC2626' },
  callText: { flex: 1, minWidth: 0 },
  callName: { color: colors.text, fontSize: 15.2, lineHeight: 19, fontWeight: '900' },
  callMeta: { color: colors.brand, fontSize: 12, lineHeight: 15, fontWeight: '800', marginTop: 2 },
  callDate: { color: colors.muted, fontSize: 11, lineHeight: 13, fontWeight: '700', marginTop: 3 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 5, flexShrink: 0 },
  iconAction: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  iconActionDanger: { backgroundColor: '#FEF2F2', borderColor: 'rgba(180,35,24,0.14)' },
  iconActionPressed: { transform: [{ scale: 0.96 }], opacity: 0.85 },
  disabledAction: { opacity: 0.45 },
  filters: { minHeight: 36, alignItems: 'center', gap: 6, paddingRight: 14 },
  filterPill: { height: 34, minWidth: 72, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  filterPillActive: { backgroundColor: '#E7ECEA', borderColor: '#E7ECEA' },
  filterPillPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  filterText: { color: colors.secondary, fontSize: 12.5, lineHeight: 15, fontWeight: '900' },
  filterTextActive: { color: colors.header },
  filterCount: { minWidth: 19, height: 19, borderRadius: 9.5, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterCountActive: { backgroundColor: colors.header },
  filterCountText: { color: colors.muted, fontSize: 10.5, lineHeight: 12, fontWeight: '900' },
  filterCountTextActive: { color: '#FFFFFF' },
});
