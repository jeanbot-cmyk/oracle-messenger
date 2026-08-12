import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertCircle, Check, CheckCheck, Clock3, MoreVertical, Plus, Search } from 'lucide-react-native';
import { api } from '@/services/api';
import { lightImpactHaptic, selectionHaptic } from '@/services/haptics';
import { colors } from '@/theme/colors';
import type { Conversation, User } from '@/types/messenger';
import { conversationAvatar, conversationName, highQualityImageUri, initials, isOfficialConversation, messagePreview, sortConversations } from './homeUtils';
import { NativePhotoViewer } from './NativePhotoViewer';
import { OracleOfficialAvatar } from './OracleOfficialAvatar';

type ConversationFilter = 'all' | 'unread' | 'fav' | 'groups' | 'archived';

type NativeConversationListProps = {
  token: string;
  ownerId: string;
  conversations: Conversation[];
  search: string;
  busy: boolean;
  onSearchChange: (value: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onConversationActions: (conversation: Conversation) => void;
  onOpenContacts: () => void;
  onGroupChanged: (conversation: Conversation) => void | Promise<void>;
  onSwipeTab?: (direction: 'next' | 'previous') => void;
};

function storageKey(kind: 'favorites' | 'archived', ownerId: string) {
  return `oracle-native-${kind}-conversations:${ownerId || 'local'}`;
}

async function readIdSet(key: string) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return new Set<string>();
  const parsed = JSON.parse(raw);
  return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
}

async function writeIdSet(key: string, ids: Set<string>) {
  await AsyncStorage.setItem(key, JSON.stringify([...ids]));
}

function formatConversationTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function peerOnline(conversation: Conversation, ownerId: string) {
  return conversation.type !== 'official' && conversation.participants.some(user => (
    user.id !== ownerId && user.status === 'online'
  ));
}

function ConversationStatusIcon({ status }: { status?: string }) {
  const value = String(status || 'sent').toLowerCase();
  if (['failed', 'error'].includes(value)) return <AlertCircle size={13} color={colors.danger} strokeWidth={2.7} />;
  if (['pending', 'sending', 'queued'].includes(value)) return <Clock3 size={13} color={colors.muted} strokeWidth={2.7} />;
  if (['read', 'seen'].includes(value)) return <CheckCheck size={14} color={colors.readReceipt} strokeWidth={2.7} />;
  if (['delivered', 'received'].includes(value)) return <CheckCheck size={14} color={colors.muted} strokeWidth={2.7} />;
  return <Check size={14} color={colors.muted} strokeWidth={2.7} />;
}

export function NativeConversationList({
  token,
  ownerId,
  conversations,
  search,
  busy,
  onSearchChange,
  onOpenConversation,
  onConversationActions,
  onOpenContacts,
  onGroupChanged,
  onSwipeTab,
}: NativeConversationListProps) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [avatarPreview, setAvatarPreview] = useState<{ uri?: string | null; name: string } | null>(null);
  const [groupModal, setGroupModal] = useState<{ mode: 'create' | 'add'; conversation?: Conversation } | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupSelectedIds, setGroupSelectedIds] = useState<Set<string>>(new Set());
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupNotice, setGroupNotice] = useState('');
  const favoriteKey = useMemo(() => storageKey('favorites', ownerId), [ownerId]);
  const archivedKey = useMemo(() => storageKey('archived', ownerId), [ownerId]);

  useEffect(() => {
    let alive = true;
    Promise.all([readIdSet(favoriteKey), readIdSet(archivedKey)])
      .then(([favorites, archived]) => {
        if (!alive) return;
        setFavoriteIds(favorites);
        setArchivedIds(archived);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [archivedKey, favoriteKey]);

  const toggleFavorite = useCallback((conversationId: string) => {
    setFavoriteIds(current => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      writeIdSet(favoriteKey, next).catch(() => undefined);
      return next;
    });
  }, [favoriteKey]);

  const toggleArchive = useCallback((conversationId: string) => {
    setArchivedIds(current => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      writeIdSet(archivedKey, next).catch(() => undefined);
      return next;
    });
  }, [archivedKey]);

  const visibleConversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sortConversations(conversations.filter(conversation => {
      const archived = archivedIds.has(conversation.id);
      const favorite = favoriteIds.has(conversation.id) || Boolean((conversation as any).isFavorite || (conversation as any).favorite);
      if (filter === 'archived' && !archived) return false;
      if (filter !== 'archived' && archived) return false;
      if (filter === 'unread' && !conversation.unreadCount) return false;
      if (filter === 'groups' && conversation.type !== 'group') return false;
      if (filter === 'fav' && !favorite) return false;
      if (!needle) return true;
      const haystack = [
        conversationName(conversation),
        conversation.name,
        conversation.lastMessage?.content,
        messagePreview(conversation.lastMessage),
        ...conversation.participants.flatMap(participant => [participant.name, participant.username, participant.phone, participant.email]),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    }));
  }, [archivedIds, conversations, favoriteIds, filter, search]);
  const activeConversations = useMemo(() => conversations.filter(conversation => !archivedIds.has(conversation.id)), [archivedIds, conversations]);
  const knownContacts = useMemo(() => {
    const map = new Map<string, User>();
    for (const conversation of conversations) {
      if (conversation.type === 'official') continue;
      for (const participant of conversation.participants || []) {
        if (!participant?.id || participant.id === ownerId) continue;
        map.set(participant.id, participant);
      }
    }
    return [...map.values()].sort((left, right) => String(left.name || left.username || '').localeCompare(String(right.name || right.username || '')));
  }, [conversations, ownerId]);
  const groupSelectableContacts = useMemo(() => {
    const existing = new Set(groupModal?.conversation?.participants?.map(participant => participant.id) || []);
    return knownContacts.filter(contact => !existing.has(contact.id));
  }, [groupModal?.conversation?.participants, knownContacts]);
  const filters = [
    { id: 'all' as const, label: 'Toutes', count: activeConversations.length },
    { id: 'unread' as const, label: 'Non lues', count: activeConversations.filter(item => item.unreadCount).length },
    { id: 'fav' as const, label: 'Favoris', count: activeConversations.filter(item => favoriteIds.has(item.id) || (item as any).isFavorite || (item as any).favorite).length },
    { id: 'groups' as const, label: 'Groupes', count: activeConversations.filter(item => item.type === 'group').length },
    { id: 'archived' as const, label: 'Archivées', count: archivedIds.size },
  ];

  const openGroupModal = useCallback((mode: 'create' | 'add', conversation?: Conversation) => {
    setGroupModal({ mode, conversation });
    setGroupName(mode === 'create' ? '' : conversationName(conversation as Conversation));
    setGroupSelectedIds(new Set());
    setGroupNotice('');
  }, []);

  const closeGroupModal = useCallback(() => {
    if (groupBusy) return;
    setGroupModal(null);
    setGroupSelectedIds(new Set());
    setGroupNotice('');
  }, [groupBusy]);

  const toggleGroupMember = useCallback((userId: string) => {
    setGroupSelectedIds(current => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const submitGroupModal = useCallback(async () => {
    if (!groupModal) return;
    const participantIds = [...groupSelectedIds];
    if (!participantIds.length) {
      setGroupNotice('Sélectionnez au moins un membre.');
      return;
    }
    if (groupModal.mode === 'create' && !groupName.trim()) {
      setGroupNotice('Donnez un nom au groupe.');
      return;
    }
    setGroupBusy(true);
    setGroupNotice('');
    try {
      const conversation = groupModal.mode === 'create'
        ? await api.createGroup(token, { name: groupName.trim(), participantIds })
        : await api.addGroupMembers(token, groupModal.conversation!.id, participantIds);
      await onGroupChanged(conversation);
      setGroupModal(null);
      setGroupSelectedIds(new Set());
      setGroupName('');
    } catch (error) {
      setGroupNotice(error instanceof Error ? error.message : 'Action groupe impossible.');
    } finally {
      setGroupBusy(false);
    }
  }, [groupModal, groupName, groupSelectedIds, onGroupChanged, token]);

  const showConversationActions = useCallback((conversation: Conversation) => {
    selectionHaptic();
    const isFavorite = favoriteIds.has(conversation.id);
    const isArchived = archivedIds.has(conversation.id);
    const actions: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Ouvrir', onPress: () => onOpenConversation(conversation) },
      { text: isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', onPress: () => toggleFavorite(conversation.id) },
      { text: isArchived ? 'Désarchiver' : 'Archiver', onPress: () => toggleArchive(conversation.id) },
      { text: 'Supprimer / options', style: 'destructive', onPress: () => onConversationActions(conversation) },
    ];
    if (conversation.type === 'group') {
      actions.splice(2, 0, {
        text: 'Ajouter membres',
        onPress: () => openGroupModal('add', conversation),
      });
    }
    actions.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Conversation', conversationName(conversation), actions);
  }, [archivedIds, favoriteIds, onConversationActions, onOpenConversation, openGroupModal, toggleArchive, toggleFavorite]);

  const listSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Boolean(onSwipeTab) && Math.abs(gesture.dx) > 76 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.45
    ),
    onPanResponderRelease: (_, gesture) => {
      if (!onSwipeTab || Math.abs(gesture.dx) <= 90 || Math.abs(gesture.dy) >= 56) return;
      selectionHaptic();
      onSwipeTab(gesture.dx < 0 ? 'next' : 'previous');
    },
  }), [onSwipeTab]);

  return (
    <View style={styles.listPanel}>
      <View style={styles.searchWrap}>
        <View style={styles.conversationSearchRow}>
          <Search size={18} color={colors.muted} strokeWidth={1.9} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Rechercher..."
            placeholderTextColor={colors.muted}
            maxFontSizeMultiplier={1.08}
            style={styles.conversationSearchInput}
          />
          {search ? (
            <Pressable
              onPress={() => {
                selectionHaptic();
                onSearchChange('');
              }}
              style={styles.searchClear}
            >
              <Text style={styles.searchClearText}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
        contentContainerStyle={styles.filters}
        keyboardShouldPersistTaps="handled"
      >
        {filters.map(item => {
          const active = filter === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label}, ${item.count}`}
              onPress={() => {
                selectionHaptic();
                setFilter(item.id);
              }}
              android_ripple={{ color: 'rgba(16,42,42,0.08)', borderless: false }}
              style={({ pressed }) => [styles.filterPill, active && styles.filterPillActive, pressed && styles.filterPillPressed]}
            >
              <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
              <View style={[styles.filterCount, active && styles.filterCountActive]}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.05} style={[styles.filterCountText, active && styles.filterCountTextActive]}>{item.count}</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            lightImpactHaptic();
            if (filter === 'groups') openGroupModal('create');
            else onOpenContacts();
          }}
          style={styles.filterPlus}
        >
          <Plus size={20} color={colors.brand} strokeWidth={2.2} />
        </Pressable>
      </ScrollView>
      {busy ? <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} /> : null}
      <View style={styles.listSwipeArea} {...listSwipeResponder.panHandlers}>
        <FlatList
          data={visibleConversations}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.conversationList, { paddingBottom: 88 + insets.bottom }]}
          ListEmptyComponent={!busy ? (
            <View style={styles.emptyState}>
              <Text maxFontSizeMultiplier={1.12} style={styles.emptyTitle}>{search.trim() ? 'Aucun résultat' : filter === 'unread' ? 'Aucune non lue' : filter === 'groups' ? 'Aucun groupe' : filter === 'archived' ? 'Aucune discussion archivée' : 'Aucune conversation'}</Text>
              <Text maxFontSizeMultiplier={1.12} style={styles.emptySearch}>{search.trim() ? 'Aucune conversation ne correspond à cette recherche.' : 'Importez vos contacts pour commencer à discuter.'}</Text>
            </View>
          ) : null}
          renderItem={({ item }) => {
            const name = conversationName(item);
            const avatar = highQualityImageUri(conversationAvatar(item));
            const official = isOfficialConversation(item);
            const lastMessageIsMine = item.lastMessage?.senderId === ownerId;
            const online = peerOnline(item, ownerId);
            return (
              <View style={[styles.conversationRow, official && styles.officialRow]}>
                <Pressable
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Photo de ${name}`}
                  onPress={() => {
                    selectionHaptic();
                    setAvatarPreview({ uri: official ? null : avatar, name });
                  }}
                  hitSlop={8}
                  style={styles.avatarWrap}
                >
                  <View style={[styles.avatar, official && styles.officialAvatar]}>
                    {official ? <OracleOfficialAvatar size={50} /> : avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text maxFontSizeMultiplier={1.05} style={styles.avatarText}>{initials(name)}</Text>}
                  </View>
                  {official ? <View style={styles.verifiedDot}><Text style={styles.verifiedText}>✓</Text></View> : null}
                  {online ? <View style={styles.presenceDot} /> : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ouvrir la conversation ${name}`}
                  style={({ pressed }) => [styles.conversationOpenArea, pressed && styles.conversationOpenAreaPressed]}
                  onPress={() => {
                    selectionHaptic();
                    onOpenConversation(item);
                  }}
                >
                  <View style={styles.conversationText}>
                    <View style={styles.titleLine}>
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.conversationTitle}>{name}</Text>
                      {official ? <Text style={styles.inlineVerified}>✓</Text> : null}
                      {official ? <Text numberOfLines={1} style={styles.verifiedLabel}>Vérifié</Text> : null}
                    </View>
                    <View style={styles.previewLine}>
                      {lastMessageIsMine ? <ConversationStatusIcon status={item.lastMessage?.status} /> : null}
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={[styles.conversationPreview, item.unreadCount ? styles.conversationPreviewUnread : null]}>{messagePreview(item.lastMessage)}</Text>
                    </View>
                  </View>
                  <View style={styles.conversationTrailing}>
                    <Text style={styles.conversationTime}>{formatConversationTime(item.lastMessage?.createdAt || item.updatedAt)}</Text>
                    {official ? <Text style={styles.officialBadge}>OFFICIEL</Text> : null}
                    {item.unreadCount ? <View style={styles.unread}><Text maxFontSizeMultiplier={1.05} style={styles.unreadText}>{item.unreadCount}</Text></View> : null}
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Options de conversation"
                  onPress={() => showConversationActions(item)}
                  hitSlop={8}
                  style={styles.rowMenu}
                >
                  <MoreVertical size={18} color="#64748B" strokeWidth={2.1} />
                </Pressable>
              </View>
            );
          }}
        />
      </View>
      <NativePhotoViewer
        visible={Boolean(avatarPreview)}
        uri={avatarPreview?.uri}
        title={avatarPreview?.name}
        fallbackText={initials(avatarPreview?.name)}
        onClose={() => setAvatarPreview(null)}
      />
      <Modal visible={Boolean(groupModal)} transparent animationType="fade" onRequestClose={closeGroupModal}>
        <View style={styles.groupModalBackdrop}>
          <View style={styles.groupModalCard}>
            <Text style={styles.groupModalTitle}>{groupModal?.mode === 'add' ? 'Ajouter des membres' : 'Créer un groupe'}</Text>
            <Text style={styles.groupModalSub}>
              {groupModal?.mode === 'add'
                ? 'Choisissez les contacts à ajouter à ce groupe.'
                : 'Sélectionnez les membres et donnez un nom clair au groupe.'}
            </Text>
            {groupModal?.mode === 'create' ? (
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Nom du groupe"
                placeholderTextColor={colors.muted}
                style={styles.groupNameInput}
              />
            ) : null}
            <ScrollView style={styles.groupMemberList} contentContainerStyle={styles.groupMemberListContent}>
              {!groupSelectableContacts.length ? (
                <Text style={styles.groupEmptyText}>Aucun contact disponible. Importez ou ouvrez d’abord des contacts Oracle Messenger.</Text>
              ) : null}
              {groupSelectableContacts.map(contact => {
                const selected = groupSelectedIds.has(contact.id);
                const avatar = highQualityImageUri(contact.avatar);
                return (
                  <Pressable key={contact.id} onPress={() => toggleGroupMember(contact.id)} style={[styles.groupMemberRow, selected && styles.groupMemberRowSelected]}>
                    <View style={styles.groupMemberAvatar}>
                      {avatar ? <Image source={{ uri: avatar, cache: 'force-cache' }} style={styles.groupMemberAvatarImage} /> : <Text style={styles.groupMemberAvatarText}>{initials(contact.name || contact.username)}</Text>}
                    </View>
                    <View style={styles.groupMemberText}>
                      <Text numberOfLines={1} style={styles.groupMemberName}>{contact.name || contact.username || 'Contact'}</Text>
                      <Text numberOfLines={1} style={styles.groupMemberMeta}>{contact.phone || contact.email || contact.username || 'Oracle Messenger'}</Text>
                    </View>
                    <View style={[styles.groupCheck, selected && styles.groupCheckSelected]}>
                      {selected ? <Check size={16} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            {groupNotice ? <Text style={styles.groupNotice}>{groupNotice}</Text> : null}
            <View style={styles.groupModalActions}>
              <Pressable onPress={closeGroupModal} disabled={groupBusy} style={styles.groupSecondaryButton}>
                <Text style={styles.groupSecondaryText}>Annuler</Text>
              </Pressable>
              <Pressable onPress={() => void submitGroupModal()} disabled={groupBusy || !groupSelectedIds.size} style={[styles.groupPrimaryButton, (groupBusy || !groupSelectedIds.size) && styles.groupButtonDisabled]}>
                {groupBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.groupPrimaryText}>{groupModal?.mode === 'add' ? 'Ajouter' : 'Créer'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Pressable
        style={[styles.fab, { bottom: 8 }]}
        onPress={() => {
          lightImpactHaptic();
          if (filter === 'groups') openGroupModal('create');
          else onOpenContacts();
        }}
      >
        <Plus size={24} color="#FFFFFF" strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  listPanel: { flex: 1, backgroundColor: colors.background, position: 'relative' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 9, backgroundColor: colors.surface },
  conversationSearchRow: { minHeight: 44, borderRadius: 22, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  conversationSearchInput: { flex: 1, minHeight: 42, color: colors.text, fontWeight: '600', paddingHorizontal: 0, fontSize: 15 },
  searchClear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  searchClearText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  filterScroller: { maxHeight: 50, backgroundColor: colors.surface },
  filters: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, backgroundColor: colors.surface, alignItems: 'center' },
  filterPill: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  filterPillActive: { backgroundColor: colors.brandSoft, borderColor: 'transparent' },
  filterPillPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  filterText: { color: colors.secondary, fontSize: 14, lineHeight: 16, fontWeight: '900' },
  filterTextActive: { color: colors.brand },
  filterCount: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterCountActive: { backgroundColor: colors.brand },
  filterCountText: { color: colors.muted, fontSize: 11, lineHeight: 13, fontWeight: '900' },
  filterCountTextActive: { color: '#FFFFFF' },
  filterPlus: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  listSwipeArea: { flex: 1 },
  conversationList: { flexGrow: 1, paddingTop: 2 },
  conversationRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', paddingVertical: 9, paddingLeft: 16, paddingRight: 10 },
  officialRow: { backgroundColor: 'rgba(16,42,42,0.025)' },
  conversationOpenArea: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', borderRadius: 14 },
  conversationOpenAreaPressed: { backgroundColor: 'rgba(16,42,42,0.045)' },
  avatarWrap: { width: 50, height: 50, position: 'relative' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  officialAvatar: { backgroundColor: colors.header, borderColor: 'rgba(217,183,91,0.82)', borderWidth: 2 },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontWeight: '900', fontSize: 16 },
  verifiedDot: { position: 'absolute', right: -1, bottom: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#38BDF8', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  verifiedText: { color: '#FFFFFF', fontSize: 10, lineHeight: 12, fontWeight: '900' },
  presenceDot: { position: 'absolute', right: -1, bottom: 0, width: 15, height: 15, borderRadius: 8, backgroundColor: colors.online, borderWidth: 2.5, borderColor: colors.surface },
  conversationText: { flex: 1, minWidth: 0, marginLeft: 12 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  conversationTitle: { flexShrink: 1, color: colors.text, fontSize: 15.7, fontWeight: '900', lineHeight: 19 },
  inlineVerified: { overflow: 'hidden', width: 17, height: 17, borderRadius: 8.5, backgroundColor: '#38BDF8', color: '#FFFFFF', textAlign: 'center', fontSize: 10, lineHeight: 17, fontWeight: '900' },
  verifiedLabel: { color: '#2563EB', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  previewLine: { minHeight: 19, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  conversationPreview: { flex: 1, minWidth: 0, color: colors.muted, fontSize: 13.6, lineHeight: 18, fontWeight: '700' },
  conversationPreviewUnread: { color: colors.text, fontWeight: '900' },
  conversationTrailing: { width: 68, alignItems: 'flex-end', justifyContent: 'center', gap: 5 },
  conversationTime: { color: colors.muted, fontSize: 11.5, lineHeight: 14, fontWeight: '700' },
  officialBadge: { overflow: 'hidden', borderRadius: 10, backgroundColor: '#E0F2FE', color: '#2563EB', paddingHorizontal: 6, paddingVertical: 2, fontSize: 9.8, lineHeight: 12, fontWeight: '900' },
  rowMenu: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginLeft: 8 },
  unreadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  emptyState: { minHeight: 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  emptySearch: { color: colors.secondary, fontSize: 15, lineHeight: 22, fontWeight: '500', textAlign: 'center' },
  groupModalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.48)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 28 },
  groupModalCard: { width: '100%', maxWidth: 430, maxHeight: '86%', borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
  groupModalTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  groupModalSub: { color: colors.secondary, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  groupNameInput: { minHeight: 46, borderRadius: 16, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 13, fontSize: 15, fontWeight: '800' },
  groupMemberList: { maxHeight: 330 },
  groupMemberListContent: { gap: 7, paddingVertical: 2 },
  groupEmptyText: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '800', paddingVertical: 12, textAlign: 'center' },
  groupMemberRow: { minHeight: 58, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  groupMemberRowSelected: { backgroundColor: '#EAF4F1', borderColor: 'rgba(16,42,42,0.22)' },
  groupMemberAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.header, borderWidth: 1, borderColor: 'rgba(16,42,42,0.10)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  groupMemberAvatarImage: { width: '100%', height: '100%' },
  groupMemberAvatarText: { color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '900' },
  groupMemberText: { flex: 1, minWidth: 0 },
  groupMemberName: { color: colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  groupMemberMeta: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  groupCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  groupCheckSelected: { borderColor: colors.header, backgroundColor: colors.header },
  groupNotice: { color: colors.danger, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  groupModalActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  groupSecondaryButton: { flex: 1, minHeight: 44, borderRadius: 16, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  groupSecondaryText: { color: colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  groupPrimaryButton: { flex: 1, minHeight: 44, borderRadius: 16, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  groupButtonDisabled: { opacity: 0.55 },
  groupPrimaryText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 54, height: 54, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A2A', shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
});
