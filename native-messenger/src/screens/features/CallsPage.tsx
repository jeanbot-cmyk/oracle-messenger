import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check, MoreVertical, Phone, PhoneCall, Search, Trash2, Video, X } from 'lucide-react-native';
import { api } from '@/services/api';
import { lightImpactHaptic, selectionHaptic } from '@/services/haptics';
import { ensureNativeSocket } from '@/services/nativeSocket';
import {
  findLocalPhoneContactForUser,
  loadLocalPhoneContactsForIdentity,
  privacyDisplayNameForUser,
  type LocalPhoneContact,
} from '@/services/nativePhoneContacts';
import { colors } from '@/theme/colors';
import { NativePhotoViewer } from '@/screens/home/NativePhotoViewer';
import { fastAvatarUri, highQualityImageUri } from '@/screens/home/homeUtils';
import { AlertText } from './FeatureUi';
import type { NativeCallDiagnosticEntry } from '@/hooks/nativeCallUtils';

type CallEntry = {
  id: string;
  callId?: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed' | 'refused' | 'cancelled';
  duration?: number;
  startedAt: string;
};

type DisplayCallEntry = CallEntry & {
  displayPeerName: string;
  displayPeerAvatar?: string | null;
};

const SHOW_CALL_DIAGNOSTICS = false;

function directionText(direction: CallEntry['direction']) {
  if (direction === 'missed') return 'Manqué';
  if (direction === 'refused') return 'Refusé';
  if (direction === 'cancelled') return 'Annulé';
  if (direction === 'incoming') return 'Reçu';
  return 'Émis';
}

function typeText(type: CallEntry['type']) {
  return type === 'video' ? 'Vidéo' : 'Audio';
}

function isUnsuccessfulCall(direction: CallEntry['direction']) {
  return direction === 'missed' || direction === 'refused' || direction === 'cancelled';
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function phoneLike(value?: string | null) {
  return /^\+?\d[\d\s().-]{6,}$/.test(String(value || '').trim());
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
  ownerId,
  onOpenContacts,
  onStartCallFromPeer,
  callDiagnostics,
  onClearCallDiagnostics,
  isAdmin,
}: {
  token: string;
  ownerId: string;
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
  const [localIdentityContacts, setLocalIdentityContacts] = useState<LocalPhoneContact[]>([]);
  const [selectedCallIds, setSelectedCallIds] = useState<Set<string>>(new Set());
  const longPressHandledRef = useRef(false);
  const cacheKey = `oracle-native-call-history:${ownerId || 'local'}`;
  const showDiagnostics = isAdmin && SHOW_CALL_DIAGNOSTICS;
  const selectionMode = selectedCallIds.size > 0;

  const persistItems = useCallback((nextItems: CallEntry[]) => {
    AsyncStorage.setItem(cacheKey, JSON.stringify(nextItems.slice(0, 200))).catch(() => undefined);
  }, [cacheKey]);

  const refreshFromServer = useCallback(async (showBusy = false) => {
    if (showBusy) setBusy(true);
    try {
      const data = await api.callHistory(token);
      const nextItems = Array.isArray(data) ? data : [];
      setItems(nextItems);
      persistItems(nextItems);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Historique des appels indisponible.');
    } finally {
      if (showBusy) setBusy(false);
    }
  }, [persistItems, token]);

  const load = useCallback(async () => {
    setNotice('');
    let cacheAvailable = false;
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      const cached = raw ? JSON.parse(raw) : null;
      if (Array.isArray(cached)) {
        setItems(cached);
        cacheAvailable = true;
      }
    } catch {
      cacheAvailable = false;
    }
    await refreshFromServer(!cacheAvailable);
  }, [cacheKey, refreshFromServer]);

  const upsertHistoryEntry = useCallback((entry?: CallEntry | null) => {
    if (!entry?.id) return;
    setItems(current => {
      const next = [entry, ...current.filter(item => item.id !== entry.id)]
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
      persistItems(next);
      return next;
    });
  }, [persistItems]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    const refreshLocalContacts = () => {
      loadLocalPhoneContactsForIdentity(ownerId)
        .then(contacts => {
          if (active) setLocalIdentityContacts(contacts);
        })
        .catch(() => undefined);
    };
    refreshLocalContacts();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshLocalContacts();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [ownerId]);

  useEffect(() => {
    if (!token) return;
    const socket = ensureNativeSocket(token);
    const onHistoryChanged = (event?: { entry?: CallEntry | null }) => {
      if (event?.entry) upsertHistoryEntry(event.entry);
      void refreshFromServer(false);
    };
    socket.on('call:history:changed', onHistoryChanged);
    return () => {
      socket.off('call:history:changed', onHistoryChanged);
    };
  }, [refreshFromServer, token, upsertHistoryEntry]);

  useEffect(() => {
    setSelectedCallIds(current => {
      if (!current.size) return current;
      const validIds = new Set(items.map(item => item.id));
      const next = new Set([...current].filter(id => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedCallIds(new Set());
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedCallIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    if (!items.length) return;
    setBusy(true);
    setNotice('');
    try {
      await api.clearCallHistory(token);
      setItems([]);
      clearSelection();
      AsyncStorage.removeItem(cacheKey).catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Effacement de l’historique impossible.');
    } finally {
      setBusy(false);
    }
  }, [cacheKey, clearSelection, items.length, token]);

  const deleteEntry = useCallback(async (id: string) => {
    setBusy(true);
    setNotice('');
    try {
      await api.deleteCallHistoryEntry(token, id);
      setItems(current => {
        const next = current.filter(item => item.id !== id);
        persistItems(next);
        return next;
      });
      setSelectedCallIds(current => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Suppression appel impossible.');
    } finally {
      setBusy(false);
    }
  }, [persistItems, token]);

  const deleteSelectedEntries = useCallback(async () => {
    const ids = [...selectedCallIds];
    if (!ids.length) return;
    setBusy(true);
    setNotice('');
    try {
      await Promise.all(ids.map(id => api.deleteCallHistoryEntry(token, id)));
      setItems(current => {
        const selected = new Set(ids);
        const next = current.filter(item => !selected.has(item.id));
        persistItems(next);
        return next;
      });
      clearSelection();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Suppression des appels impossible.');
    } finally {
      setBusy(false);
    }
  }, [clearSelection, persistItems, selectedCallIds, token]);

  const callBack = useCallback(async (entry: CallEntry, typeOverride?: CallEntry['type']) => {
    if (!entry.peerId || busy || callingId || selectionMode) return;
    setCallingId(entry.id);
    setNotice('');
    try {
      await onStartCallFromPeer(entry.peerId, typeOverride || entry.type || 'audio');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Relance de l’appel impossible.');
    } finally {
      setCallingId('');
    }
  }, [busy, callingId, onStartCallFromPeer, selectionMode]);

  const displayItems: DisplayCallEntry[] = items.map(item => {
    const peerPhone = phoneLike(item.peerName) ? item.peerName : '';
    const localContact = findLocalPhoneContactForUser({ phone: peerPhone, email: '' }, localIdentityContacts);
    return {
      ...item,
      displayPeerName: privacyDisplayNameForUser({ phone: peerPhone, email: '', username: '', name: '' }, localContact),
      displayPeerAvatar: localContact?.avatar || item.peerAvatar || null,
    };
  });

  const openEntryMenu = useCallback((entry: DisplayCallEntry) => {
    Alert.alert(entry.displayPeerName || 'Appel', 'Choisissez une action.', [
      { text: 'Appel audio', onPress: () => void callBack(entry, 'audio') },
      { text: 'Appel vidéo', onPress: () => void callBack(entry, 'video') },
      { text: 'Supprimer de l’historique', style: 'destructive', onPress: () => void deleteEntry(entry.id) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [callBack, deleteEntry]);

  const filteredItems = (filter === 'all' ? displayItems : displayItems.filter(item => item.direction === filter)).filter(item => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${item.displayPeerName} ${item.peerName} ${directionText(item.direction)} ${typeText(item.type)}`.toLowerCase().includes(needle);
  });
  const filters = [
    { id: 'all' as const, label: 'Tous', count: items.length },
    { id: 'missed' as const, label: 'Manqués', count: items.filter(item => item.direction === 'missed').length },
    { id: 'refused' as const, label: 'Refusés', count: items.filter(item => item.direction === 'refused').length },
    { id: 'cancelled' as const, label: 'Annulés', count: items.filter(item => item.direction === 'cancelled').length },
    { id: 'incoming' as const, label: 'Reçus', count: items.filter(item => item.direction === 'incoming').length },
    { id: 'outgoing' as const, label: 'Émis', count: items.filter(item => item.direction === 'outgoing').length },
  ];

  const renderCallEntry = ({ item }: { item: DisplayCallEntry }) => {
    const interactionDisabled = busy || Boolean(callingId);
    const callDisabled = interactionDisabled || !item.peerId || selectionMode;
    const isCalling = callingId === item.id;
    const isSelected = selectedCallIds.has(item.id);
    const peerAvatar = fastAvatarUri(item.displayPeerAvatar) || item.displayPeerAvatar;
    const previewAvatar = highQualityImageUri(item.displayPeerAvatar) || item.displayPeerAvatar;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selectionMode ? `${item.displayPeerName || 'Contact'} ${isSelected ? 'sélectionné' : 'non sélectionné'}` : `Rappeler ${item.displayPeerName || 'ce contact'} en ${typeText(item.type).toLowerCase()}`}
        onPress={() => {
          if (longPressHandledRef.current) {
            longPressHandledRef.current = false;
            return;
          }
          if (selectionMode) {
            selectionHaptic();
            toggleSelection(item.id);
            return;
          }
          lightImpactHaptic();
          void callBack(item);
        }}
        onLongPress={() => {
          if (interactionDisabled) return;
          longPressHandledRef.current = true;
          selectionHaptic();
          toggleSelection(item.id);
        }}
        delayLongPress={260}
        disabled={interactionDisabled}
        android_ripple={{ color: 'rgba(16,42,42,0.08)' }}
        style={({ pressed }) => [
          styles.callRow,
          isUnsuccessfulCall(item.direction) && styles.missedRow,
          isSelected && styles.callRowSelected,
          pressed && !interactionDisabled && styles.callRowPressed,
          interactionDisabled && styles.disabledRow,
        ]}
      >
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo de ${item.displayPeerName || 'Contact'}`}
          onPress={event => {
            event.stopPropagation();
            if (selectionMode) {
              selectionHaptic();
              toggleSelection(item.id);
              return;
            }
            selectionHaptic();
            setAvatarPreview({ uri: previewAvatar, name: item.displayPeerName || 'Contact' });
          }}
          hitSlop={8}
          style={styles.avatarWrap}
        >
          <View style={[styles.avatar, isUnsuccessfulCall(item.direction) && styles.missedAvatar]}>
            {peerAvatar ? (
              <Image source={{ uri: peerAvatar, cache: 'force-cache' }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.avatarText, isUnsuccessfulCall(item.direction) && styles.missedText]}>{(item.displayPeerName || '?').slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
          {selectionMode ? (
            <View style={[styles.selectionBadge, isSelected && styles.selectionBadgeActive]}>
              {isSelected ? <Check size={13} color="#FFFFFF" strokeWidth={3.1} /> : null}
            </View>
          ) : null}
        </Pressable>
        <View style={styles.callText}>
          <Text numberOfLines={1} style={styles.callName}>{item.displayPeerName || 'Contact'}</Text>
          {isCalling ? (
            <Text numberOfLines={1} style={styles.callStatus}>Relance de l’appel...</Text>
          ) : (
            <Text numberOfLines={1} style={[styles.callMeta, isUnsuccessfulCall(item.direction) && styles.missedText]}>
              {directionText(item.direction)} · {typeText(item.type)}
            </Text>
          )}
        </View>
        <View style={styles.rowTrailing}>
          {selectionMode ? (
            <View style={[styles.rowCheck, isSelected && styles.rowCheckActive]}>
              {isSelected ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
          ) : (
            <View style={styles.rowActions}>
              <IconAction label={`Rappeler en ${typeText(item.type).toLowerCase()}`} icon={item.type === 'video' ? Video : PhoneCall} onPress={() => callBack(item)} disabled={callDisabled} />
              <IconAction label="Autres actions" icon={MoreVertical} onPress={() => openEntryMenu(item)} disabled={interactionDisabled} />
            </View>
          )}
          <Text numberOfLines={1} style={[styles.callTime, isUnsuccessfulCall(item.direction) && styles.missedText]}>
            {formatTime(item.startedAt)}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <>
    <FlatList
      data={filteredItems}
      keyExtractor={item => item.id}
      renderItem={renderCallEntry}
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      initialNumToRender={16}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={48}
      windowSize={7}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={(
        <>
          <CallsSearch value={query} onChange={setQuery} />
          {selectionMode ? (
            <View style={styles.selectionBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Annuler la sélection"
                onPress={() => {
                  selectionHaptic();
                  clearSelection();
                }}
                hitSlop={8}
                style={({ pressed }) => [styles.selectionIconButton, pressed && styles.selectionIconButtonPressed]}
              >
                <X size={18} color={colors.header} strokeWidth={2.7} />
              </Pressable>
              <Text numberOfLines={1} style={styles.selectionTitle}>
                {selectedCallIds.size} sélectionné{selectedCallIds.size > 1 ? 's' : ''}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Supprimer les appels sélectionnés"
                onPress={() => {
                  selectionHaptic();
                  void deleteSelectedEntries();
                }}
                disabled={busy}
                hitSlop={8}
                style={({ pressed }) => [styles.selectionDeleteButton, pressed && !busy && styles.selectionIconButtonPressed, busy && styles.disabledAction]}
              >
                <Trash2 size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.selectionDeleteText}>Supprimer</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.intro}>
            <View style={styles.headRow}>
              <View style={styles.titleBlock}>
                <Text maxFontSizeMultiplier={1.08} style={styles.title}>Appels</Text>
                <View style={styles.subtitleRow}>
                  <Text maxFontSizeMultiplier={1.08} style={styles.subtitle}>{items.length} appel{items.length > 1 ? 's' : ''} récent{items.length > 1 ? 's' : ''}</Text>
                  <InlineButton label="Effacer" onPress={clearHistory} disabled={!items.length || busy || selectionMode} />
                </View>
              </View>
              <HeaderButton label="Nouvel appel" onPress={onOpenContacts} disabled={Boolean(callingId) || selectionMode} primary />
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
                    disabled={selectionMode}
                    style={({ pressed }) => [styles.filterPill, active && styles.filterPillActive, pressed && !selectionMode && styles.filterPillPressed, selectionMode && styles.disabledAction]}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                    <View style={[styles.filterCount, active && styles.filterCountActive]}>
                      <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{item.count}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {busy ? <Text style={styles.refreshingText}>Actualisation...</Text> : null}
            <AlertText text={notice} />
          </View>
        </>
      )}
      ListEmptyComponent={!busy ? (
        <View style={styles.empty}>
          <Phone size={32} color={colors.accent} />
          <Text style={styles.emptyTitle}>{items.length ? 'Aucun appel pour ce filtre' : 'Aucun appel récent'}</Text>
          <Text style={styles.emptyText}>{items.length ? 'Changez de filtre pour revoir tout l’historique.' : 'Vos appels apparaîtront ici.'}</Text>
        </View>
      ) : null}
      ListFooterComponent={showDiagnostics ? (
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
    />
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
  page: { flex: 1, backgroundColor: colors.background },
  pageContent: { paddingBottom: 132, backgroundColor: colors.surface },
  searchWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, backgroundColor: colors.surface },
  searchRow: { minHeight: 50, borderRadius: 25, backgroundColor: colors.input, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  searchInput: { flex: 1, minHeight: 46, color: colors.text, fontSize: 18, fontWeight: '500', paddingHorizontal: 0 },
  selectionBar: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F4FBF8', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectionIconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  selectionIconButtonPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  selectionTitle: { flex: 1, minWidth: 0, color: colors.header, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  selectionDeleteButton: { minHeight: 38, borderRadius: 19, backgroundColor: colors.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 13 },
  selectionDeleteText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  intro: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, backgroundColor: colors.background, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { color: colors.title, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 12.5, lineHeight: 16, fontWeight: '700' },
  refreshingText: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 12, backgroundColor: colors.accentSoft, color: colors.title, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11.5, lineHeight: 14, fontWeight: '900' },
  topActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, maxWidth: 168 },
  headerButton: { minHeight: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  headerButtonPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  headerButtonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  headerButtonText: { color: colors.header, fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  headerButtonTextPrimary: { color: '#FFFFFF' },
  inlineButton: { minHeight: 24, borderRadius: 12, backgroundColor: '#EAF4F1', paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  inlineButtonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  inlineButtonText: { color: colors.header, fontSize: 11.5, lineHeight: 14, fontWeight: '900' },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  callsList: { paddingTop: 2, paddingBottom: 24, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
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
  callRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  callRowSelected: { backgroundColor: '#EEF8F5', borderBottomColor: '#D6E9E4' },
  callRowPressed: { backgroundColor: '#F5F7F7' },
  missedRow: { backgroundColor: '#FFFBFB' },
  disabledRow: { opacity: 0.68 },
  avatarWrap: { width: 50, height: 50, justifyContent: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  missedAvatar: { backgroundColor: '#FEF2F2' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.brand, fontSize: 17, fontWeight: '900' },
  selectionBadge: { position: 'absolute', right: 1, bottom: 1, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  selectionBadgeActive: { backgroundColor: colors.header, borderColor: colors.header },
  missedText: { color: '#DC2626' },
  callText: { flex: 1, minWidth: 0 },
  callName: { color: colors.text, fontSize: 15.2, lineHeight: 19, fontWeight: '900' },
  callMeta: { color: colors.secondary, fontSize: 12, lineHeight: 15, fontWeight: '800', marginTop: 3 },
  callStatus: { color: colors.brand, fontSize: 12, lineHeight: 15, fontWeight: '800', marginTop: 3 },
  rowTrailing: { alignItems: 'flex-end', justifyContent: 'center', gap: 5, flexShrink: 0 },
  callTime: { color: colors.muted, fontSize: 11, lineHeight: 13, fontWeight: '800', textAlign: 'right' },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 5, flexShrink: 0 },
  rowCheck: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  rowCheckActive: { backgroundColor: colors.header, borderColor: colors.header },
  iconAction: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  iconActionDanger: { backgroundColor: '#FEF2F2', borderColor: 'rgba(180,35,24,0.14)' },
  iconActionPressed: { transform: [{ scale: 0.96 }], opacity: 0.85 },
  disabledAction: { opacity: 0.45 },
  filters: { minHeight: 38, alignItems: 'center', gap: 7, paddingRight: 16 },
  filterPill: { height: 36, minWidth: 74, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(17,27,33,0.16)', backgroundColor: '#FFFFFF', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  filterPillActive: { backgroundColor: '#E9EDEA', borderColor: '#D7DDDA' },
  filterPillPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  filterText: { color: colors.secondary, fontSize: 12.5, lineHeight: 15, fontWeight: '900' },
  filterTextActive: { color: colors.header },
  filterCount: { minWidth: 19, height: 19, borderRadius: 9.5, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterCountActive: { backgroundColor: colors.header },
  filterCountText: { color: colors.muted, fontSize: 10.5, lineHeight: 12, fontWeight: '900' },
  filterCountTextActive: { color: '#FFFFFF' },
});
