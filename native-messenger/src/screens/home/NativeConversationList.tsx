import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Image, InteractionManager, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { AlertCircle, Archive, Check, CheckCheck, Clock3, Eye, Image as ImageIcon, MessageCircle, Phone, Plus, Search, Shield, ShieldOff, Star, Trash2, UserMinus, UserPlus, Users, Video, X } from 'lucide-react-native';
import { api } from '@/services/api';
import { lightImpactHaptic, selectionHaptic } from '@/services/haptics';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { colors } from '@/theme/colors';
import type { Conversation, GroupInvitation, User } from '@/types/messenger';
import { conversationAvatar, conversationName, fastAvatarUri, highQualityImageUri, initials, isOfficialConversation, messagePreview, sortConversations } from './homeUtils';
import { NativePhotoViewer } from './NativePhotoViewer';
import { OfficialVerifiedBadge } from './OfficialVerifiedBadge';
import { ORACLE_APP_ICON, OracleOfficialAvatar } from './OracleOfficialAvatar';

type ConversationFilter = 'all' | 'unread' | 'fav' | 'groups' | 'archived';
type GroupModalMode = 'create' | 'add' | 'edit' | 'members';
type GroupModalState = { mode: GroupModalMode; conversation?: Conversation } | null;

type NativeConversationListProps = {
  token: string;
  ownerId: string;
  currentUserName?: string | null;
  conversations: Conversation[];
  search: string;
  busy: boolean;
  onSearchChange: (value: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onDeleteConversations: (conversations: Conversation[]) => void;
  onOpenContacts: () => void;
  onFindFriends?: () => void;
  storyAuthors?: Record<string, { hasUnread?: boolean } | undefined>;
  onOpenStoryAuthor?: (authorId: string) => void;
  onStartCallFromPeer?: (peerId: string, type: 'audio' | 'video') => Promise<void> | void;
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

function ConversationStatusIcon({ status }: { status?: string }) {
  const value = String(status || 'sent').toLowerCase();
  if (['failed', 'error'].includes(value)) return <AlertCircle size={13} color={colors.danger} strokeWidth={2.7} />;
  if (['pending', 'sending', 'queued', 'uploading'].includes(value)) return <Clock3 size={13} color={colors.muted} strokeWidth={2.7} />;
  if (['read', 'seen'].includes(value)) return <CheckCheck size={14} color={colors.readReceipt} strokeWidth={2.7} />;
  if (['delivered', 'received'].includes(value)) return <CheckCheck size={14} color={colors.muted} strokeWidth={2.7} />;
  return <Check size={14} color={colors.muted} strokeWidth={2.7} />;
}

function VerifiedLabel({ style }: { style: any }) {
  return (
    <Text numberOfLines={1} style={style}>
      <Text style={styles.verifiedInitial}>V</Text>
      érifié
    </Text>
  );
}

export function NativeConversationList({
  token,
  ownerId,
  currentUserName,
  conversations,
  search,
  busy,
  onSearchChange,
  onOpenConversation,
  onDeleteConversations,
  onOpenContacts,
  onFindFriends,
  storyAuthors,
  onOpenStoryAuthor,
  onStartCallFromPeer,
  onGroupChanged,
  onSwipeTab,
}: NativeConversationListProps) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [avatarPreview, setAvatarPreview] = useState<{ uri?: string | null; name: string; official?: boolean; storyAuthorId?: string | null; conversation?: Conversation; peerId?: string | null } | null>(null);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [groupModal, setGroupModal] = useState<GroupModalState>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [groupSelectedIds, setGroupSelectedIds] = useState<Set<string>>(new Set());
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupNotice, setGroupNotice] = useState('');
  const [groupInvitations, setGroupInvitations] = useState<GroupInvitation[]>([]);
  const prefetchedAvatarUrisRef = useRef<Set<string>>(new Set());
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

  const refreshGroupInvitations = useCallback(() => {
    api.pendingGroupInvitations(token)
      .then(invitations => setGroupInvitations(invitations))
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    refreshGroupInvitations();
  }, [refreshGroupInvitations]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = ensureNativeSocket(token);
    const refresh = () => refreshGroupInvitations();
    socket.on('group:invitation', refresh);
    socket.on('group:invitation:update', refresh);
    return () => {
      socket.off('group:invitation', refresh);
      socket.off('group:invitation:update', refresh);
    };
  }, [refreshGroupInvitations, token]);

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
  const selectedConversations = useMemo(() => conversations.filter(conversation => selectedConversationIds.has(conversation.id)), [conversations, selectedConversationIds]);
  const selectionMode = selectedConversationIds.size > 0;
  const activeConversations = useMemo(() => conversations.filter(conversation => !archivedIds.has(conversation.id)), [archivedIds, conversations]);
  useEffect(() => {
    const avatarUris = visibleConversations
      .slice(0, 12)
      .map(conversation => fastAvatarUri(conversationAvatar(conversation)))
      .filter((uri): uri is string => Boolean(uri));
    const prefetched = prefetchedAvatarUrisRef.current;
    if (prefetched.size > 180) prefetched.clear();
    const task = InteractionManager.runAfterInteractions(() => {
      [...new Set(avatarUris)].filter(uri => !prefetched.has(uri)).forEach(uri => {
        prefetched.add(uri);
        Image.prefetch(uri).catch(() => undefined);
      });
    });
    return () => task.cancel();
  }, [visibleConversations]);
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
    for (const invitation of groupModal?.conversation?.pendingInvitations || []) {
      if (['PENDING', 'INVITED'].includes(String(invitation.status || '').toUpperCase())) existing.add(invitation.invitedUserId);
    }
    return knownContacts.filter(contact => !existing.has(contact.id));
  }, [groupModal?.conversation?.participants, groupModal?.conversation?.pendingInvitations, knownContacts]);
  const filters = [
    { id: 'all' as const, label: 'Toutes', count: activeConversations.length },
    { id: 'unread' as const, label: 'Non lues', count: activeConversations.filter(item => item.unreadCount).length },
    { id: 'fav' as const, label: 'Favoris', count: activeConversations.filter(item => favoriteIds.has(item.id) || (item as any).isFavorite || (item as any).favorite).length },
    { id: 'groups' as const, label: 'Groupes', count: activeConversations.filter(item => item.type === 'group').length },
    { id: 'archived' as const, label: 'Archivées', count: archivedIds.size },
  ];
  const firstName = useMemo(() => {
    const clean = String(currentUserName || '').trim();
    return clean ? clean.split(/\s+/)[0] : 'ami';
  }, [currentUserName]);
  const isNewAccountEmpty = !search.trim() && filter === 'all' && conversations.length === 0;
  const openFindFriends = useCallback(() => {
    lightImpactHaptic();
    if (onFindFriends) onFindFriends();
    else onOpenContacts();
  }, [onFindFriends, onOpenContacts]);

  const clearConversationSelection = useCallback(() => {
    setSelectedConversationIds(new Set());
  }, []);

  useEffect(() => {
    if (!selectionMode) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      clearConversationSelection();
      return true;
    });
    return () => subscription.remove();
  }, [clearConversationSelection, selectionMode]);

  const toggleConversationSelection = useCallback((conversationId: string) => {
    setSelectedConversationIds(current => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  }, []);

  const beginConversationSelection = useCallback((conversation: Conversation) => {
    selectionHaptic();
    setSelectedConversationIds(new Set([conversation.id]));
  }, []);

  const favoriteSelectedConversations = useCallback(() => {
    if (!selectedConversationIds.size) return;
    setFavoriteIds(current => {
      const next = new Set(current);
      selectedConversationIds.forEach(id => next.add(id));
      writeIdSet(favoriteKey, next).catch(() => undefined);
      return next;
    });
    clearConversationSelection();
  }, [clearConversationSelection, favoriteKey, selectedConversationIds]);

  const archiveSelectedConversations = useCallback(() => {
    if (!selectedConversationIds.size) return;
    setArchivedIds(current => {
      const next = new Set(current);
      selectedConversationIds.forEach(id => next.add(id));
      writeIdSet(archivedKey, next).catch(() => undefined);
      return next;
    });
    clearConversationSelection();
  }, [archivedKey, clearConversationSelection, selectedConversationIds]);

  const createGroupFromSelectedConversations = useCallback(() => {
    const participantIds = new Set<string>();
    selectedConversations.forEach(conversation => {
      if (conversation.type === 'official' || conversation.isOfficial) return;
      conversation.participants.forEach(participant => {
        if (!participant?.id || participant.id === ownerId) return;
        participantIds.add(participant.id);
      });
    });
    if (!participantIds.size) {
      Alert.alert('Créer un groupe', 'Sélectionnez au moins une conversation avec un contact Oracle Messenger.');
      return;
    }
    setGroupModal({ mode: 'create' });
    setGroupName('Nouveau groupe');
    setGroupDescription('');
    setGroupAvatar(null);
    setGroupSelectedIds(participantIds);
    setGroupNotice('');
    clearConversationSelection();
  }, [clearConversationSelection, ownerId, selectedConversations]);

  const deleteSelectedConversations = useCallback(() => {
    if (!selectedConversations.length) return;
    const deletable = selectedConversations.filter(conversation => conversation.type !== 'official' && !conversation.isOfficial);
    if (!deletable.length) {
      Alert.alert('Effacer', 'La conversation officielle ne peut pas être effacée.');
      return;
    }
    clearConversationSelection();
    onDeleteConversations(deletable);
  }, [clearConversationSelection, onDeleteConversations, selectedConversations]);

  const openGroupModal = useCallback((mode: GroupModalMode, conversation?: Conversation) => {
    setGroupModal({ mode, conversation });
    setGroupName(mode === 'create' ? '' : conversationName(conversation as Conversation));
    setGroupDescription(mode === 'create' ? '' : conversation?.description || '');
    setGroupAvatar(mode === 'create' ? null : conversation?.avatar || null);
    setGroupSelectedIds(new Set());
    setGroupNotice('');
    if (conversation?.id && mode !== 'create') {
      api.conversation(conversation.id, token)
        .then(fresh => {
          setGroupModal(current => current?.conversation?.id === conversation.id ? { ...current, conversation: fresh } : current);
          setGroupName(conversationName(fresh));
          setGroupDescription(fresh.description || '');
          setGroupAvatar(fresh.avatar || null);
        })
        .catch(() => undefined);
    }
  }, [token]);

  const closeGroupModal = useCallback(() => {
    if (groupBusy) return;
    setGroupModal(null);
    setGroupSelectedIds(new Set());
    setGroupAvatar(null);
    setGroupDescription('');
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

  const currentGroupIsAdmin = useMemo(() => (
    groupModal?.conversation?.type === 'group'
      ? groupModal.conversation.currentUserRole === 'admin' || !groupModal.conversation.currentUserRole
      : true
  ), [groupModal?.conversation]);

  const pickGroupAvatar = useCallback(async () => {
    if (groupBusy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setGroupNotice('Permission galerie requise pour choisir la photo du groupe.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.84,
      allowsEditing: true,
      aspect: [1, 1],
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setGroupBusy(true);
    setGroupNotice('Préparation de la photo du groupe...');
    try {
      const uploaded = await api.mediaUploadFile(token, {
        uri: asset.uri,
        name: asset.fileName || `oracle-group-${Date.now()}.jpg`,
        mime: asset.mimeType || 'image/jpeg',
        kind: 'group-avatar',
      });
      setGroupAvatar(uploaded.url);
      setGroupNotice('');
    } catch (error) {
      setGroupNotice(error instanceof Error ? error.message : 'Photo du groupe impossible.');
    } finally {
      setGroupBusy(false);
    }
  }, [groupBusy, token]);

  const submitGroupModal = useCallback(async () => {
    if (!groupModal) return;
    const participantIds = [...groupSelectedIds];
    if (groupModal.mode === 'members') return;
    if ((groupModal.mode === 'create' || groupModal.mode === 'add') && !participantIds.length) {
      setGroupNotice('Sélectionnez au moins un membre.');
      return;
    }
    if ((groupModal.mode === 'create' || groupModal.mode === 'edit') && !groupName.trim()) {
      setGroupNotice('Donnez un nom au groupe.');
      return;
    }
    setGroupBusy(true);
    setGroupNotice('');
    try {
      const conversation = groupModal.mode === 'create'
        ? await api.createGroup(token, { name: groupName.trim(), participantIds, avatar: groupAvatar || undefined, description: groupDescription.trim() || undefined })
        : groupModal.mode === 'add'
          ? await api.addGroupMembers(token, groupModal.conversation!.id, participantIds)
          : await api.updateGroup(token, groupModal.conversation!.id, { name: groupName.trim(), avatar: groupAvatar, description: groupDescription.trim() || null });
      await onGroupChanged(conversation);
      refreshGroupInvitations();
      setGroupModal(null);
      setGroupSelectedIds(new Set());
      setGroupName('');
      setGroupDescription('');
      setGroupAvatar(null);
    } catch (error) {
      setGroupNotice(error instanceof Error ? error.message : 'Action groupe impossible.');
    } finally {
      setGroupBusy(false);
    }
  }, [groupAvatar, groupDescription, groupModal, groupName, groupSelectedIds, onGroupChanged, refreshGroupInvitations, token]);

  const updateGroupMemberRole = useCallback(async (participant: User, role: 'admin' | 'member') => {
    if (!groupModal?.conversation || groupBusy) return;
    setGroupBusy(true);
    setGroupNotice('');
    try {
      const conversation = await api.setGroupMemberRole(token, groupModal.conversation.id, participant.id, role);
      await onGroupChanged(conversation);
      setGroupModal(current => current ? { ...current, conversation } : current);
      setGroupNotice(role === 'admin' ? `${participant.name || 'Membre'} est admin.` : `${participant.name || 'Membre'} n’est plus admin.`);
    } catch (error) {
      setGroupNotice(error instanceof Error ? error.message : 'Rôle impossible à modifier.');
    } finally {
      setGroupBusy(false);
    }
  }, [groupBusy, groupModal, onGroupChanged, token]);

  const removeGroupMember = useCallback((participant: User) => {
    if (!groupModal?.conversation || groupBusy) return;
    Alert.alert(
      'Retirer du groupe',
      `Retirer ${participant.name || participant.username || 'ce membre'} de "${conversationName(groupModal.conversation)}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => {
            if (!groupModal?.conversation) return;
            setGroupBusy(true);
            setGroupNotice('');
            api.removeGroupMember(token, groupModal.conversation.id, participant.id)
              .then(async conversation => {
                await onGroupChanged(conversation);
                setGroupModal(current => current ? { ...current, conversation } : current);
                setGroupNotice(`${participant.name || 'Membre'} retiré du groupe.`);
              })
              .catch(error => setGroupNotice(error instanceof Error ? error.message : 'Retrait impossible.'))
              .finally(() => setGroupBusy(false));
          },
        },
      ],
    );
  }, [groupBusy, groupModal, onGroupChanged, token]);

  const acceptInvitation = useCallback(async (invitation: GroupInvitation) => {
    if (groupBusy) return;
    setGroupBusy(true);
    setGroupNotice('');
    try {
      const result = await api.acceptGroupInvitation(token, invitation.id);
      setGroupInvitations(current => current.filter(item => item.id !== invitation.id));
      if (result.conversation) await onGroupChanged(result.conversation);
      refreshGroupInvitations();
    } catch (error) {
      setGroupNotice(error instanceof Error ? error.message : 'Acceptation impossible.');
    } finally {
      setGroupBusy(false);
    }
  }, [groupBusy, onGroupChanged, refreshGroupInvitations, token]);

  const declineInvitation = useCallback(async (invitation: GroupInvitation) => {
    if (groupBusy) return;
    setGroupBusy(true);
    setGroupNotice('');
    try {
      await api.declineGroupInvitation(token, invitation.id);
      setGroupInvitations(current => current.filter(item => item.id !== invitation.id));
      refreshGroupInvitations();
    } catch (error) {
      setGroupNotice(error instanceof Error ? error.message : 'Refus impossible.');
    } finally {
      setGroupBusy(false);
    }
  }, [groupBusy, refreshGroupInvitations, token]);

  const cancelGroupInvitation = useCallback((invitation: GroupInvitation) => {
    if (!groupModal?.conversation || groupBusy) return;
    Alert.alert(
      'Annuler l’invitation',
      `Annuler l’invitation envoyée à ${invitation.invitedUser?.name || invitation.invitedUser?.username || 'ce contact'} ?`,
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Annuler',
          style: 'destructive',
          onPress: () => {
            if (!groupModal?.conversation) return;
            setGroupBusy(true);
            setGroupNotice('');
            api.cancelGroupInvitation(token, groupModal.conversation.id, invitation.id)
              .then(async conversation => {
                await onGroupChanged(conversation);
                setGroupModal(current => current ? { ...current, conversation } : current);
                setGroupNotice('Invitation annulée.');
              })
              .catch(error => setGroupNotice(error instanceof Error ? error.message : 'Annulation impossible.'))
              .finally(() => setGroupBusy(false));
          },
        },
      ],
    );
  }, [groupBusy, groupModal, onGroupChanged, token]);

  const listSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Boolean(onSwipeTab) && Math.abs(gesture.dx) > 110 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.65
    ),
    onPanResponderRelease: (_, gesture) => {
      if (!onSwipeTab || Math.abs(gesture.dx) <= 132 || Math.abs(gesture.dy) >= 52) return;
      selectionHaptic();
      onSwipeTab(gesture.dx < 0 ? 'next' : 'previous');
    },
  }), [onSwipeTab]);
  const groupModalMode = groupModal?.mode;
  const groupModalTitle = groupModalMode === 'add'
    ? 'Inviter des membres'
    : groupModalMode === 'edit'
      ? 'Modifier le groupe'
      : groupModalMode === 'members'
        ? 'Membres et rôles'
        : 'Créer un groupe';
  const groupModalSubtitle = groupModalMode === 'add'
    ? 'Choisissez les contacts à inviter. Ils ne seront membres qu’après acceptation.'
    : groupModalMode === 'edit'
      ? 'Mettez à jour le nom et la photo de profil du groupe.'
      : groupModalMode === 'members'
        ? `Votre rôle : ${currentGroupIsAdmin ? 'admin' : 'membre'}.`
        : 'Sélectionnez les contacts à inviter et donnez un nom clair au groupe.';
  const groupSubmitDisabled = groupBusy || (
    groupModalMode === 'create' || groupModalMode === 'add'
      ? !groupSelectedIds.size || (groupModalMode === 'create' && !groupName.trim())
      : groupModalMode === 'edit'
        ? !groupName.trim()
        : false
  );

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
            else openFindFriends();
          }}
          style={styles.filterPlus}
        >
          <Plus size={20} color={colors.brand} strokeWidth={2.2} />
        </Pressable>
      </ScrollView>
      {selectionMode ? (
        <View style={styles.conversationSelectionBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Annuler la sélection" onPress={clearConversationSelection} style={styles.selectionCloseButton}>
            <X size={18} color={colors.header} strokeWidth={2.6} />
          </Pressable>
          <Text style={styles.selectionCount}>{selectedConversationIds.size} sélectionnée(s)</Text>
          <View style={styles.selectionActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Ajouter aux favoris" onPress={favoriteSelectedConversations} style={styles.selectionActionButton}>
              <Star size={18} color={colors.header} strokeWidth={2.5} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Archiver" onPress={archiveSelectedConversations} style={styles.selectionActionButton}>
              <Archive size={18} color={colors.header} strokeWidth={2.5} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Créer un groupe" onPress={createGroupFromSelectedConversations} style={styles.selectionActionButton}>
              <Users size={18} color={colors.header} strokeWidth={2.5} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Effacer" onPress={deleteSelectedConversations} style={[styles.selectionActionButton, styles.selectionDangerButton]}>
              <Trash2 size={18} color={colors.danger} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} /> : null}
      {groupInvitations.length ? (
        <View style={styles.invitationStack}>
          {groupInvitations.map(invitation => {
            const groupName = invitation.group?.name || 'Groupe Oracle Messenger';
            const avatar = highQualityImageUri(invitation.group?.avatar);
            return (
              <View key={invitation.id} style={styles.invitationCard}>
                <View style={styles.groupMemberAvatar}>
                  {avatar ? <Image source={{ uri: avatar, cache: 'force-cache' }} style={styles.groupMemberAvatarImage} resizeMode="cover" /> : <Users size={20} color="#FFFFFF" strokeWidth={2.5} />}
                </View>
                <View style={styles.invitationBody}>
                  <Text numberOfLines={1} style={styles.invitationTitle}>{groupName}</Text>
                  <Text numberOfLines={2} style={styles.invitationText}>
                    {invitation.invitedBy?.name || 'Un administrateur'} vous invite à rejoindre ce groupe.
                  </Text>
                </View>
                <View style={styles.invitationActions}>
                  <Pressable onPress={() => void declineInvitation(invitation)} disabled={groupBusy} style={styles.invitationReject}>
                    <X size={16} color={colors.danger} strokeWidth={2.8} />
                  </Pressable>
                  <Pressable onPress={() => void acceptInvitation(invitation)} disabled={groupBusy} style={styles.invitationAccept}>
                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.listSwipeArea} {...listSwipeResponder.panHandlers}>
        <FlatList
          data={visibleConversations}
          keyExtractor={item => item.id}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={48}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.conversationList, { paddingBottom: 88 + insets.bottom }]}
          ListEmptyComponent={!busy ? (
            isNewAccountEmpty ? (
              <View style={styles.newAccountEmpty}>
                <View style={styles.newAccountIcon}>
                  <UserPlus size={31} color={colors.header} strokeWidth={2.6} />
                </View>
                <Text maxFontSizeMultiplier={1.08} style={styles.emptyTitle}>Bienvenue {firstName}</Text>
                <Text maxFontSizeMultiplier={1.08} style={styles.emptySearch}>
                  Synchronise tes contacts pour afficher les amis déjà présents sur Oracle Messenger. L’import initial se fait une seule fois, puis l’application met la liste à jour automatiquement.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Synchroniser mes contacts"
                  onPress={openFindFriends}
                  android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
                  style={({ pressed }) => [styles.findFriendsButton, pressed && styles.findFriendsButtonPressed]}
                >
                  <UserPlus size={22} color="#FFFFFF" strokeWidth={2.6} />
                  <Text maxFontSizeMultiplier={1.06} style={styles.findFriendsButtonText}>Synchroniser mes contacts</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text maxFontSizeMultiplier={1.12} style={styles.emptyTitle}>{search.trim() ? 'Aucun résultat' : filter === 'unread' ? 'Aucune non lue' : filter === 'groups' ? 'Aucun groupe' : filter === 'archived' ? 'Aucune discussion archivée' : 'Aucune conversation'}</Text>
                <Text maxFontSizeMultiplier={1.12} style={styles.emptySearch}>{search.trim() ? 'Aucune conversation ne correspond à cette recherche.' : 'Importez vos contacts pour commencer à discuter.'}</Text>
              </View>
            )
          ) : null}
          renderItem={({ item }) => {
            const name = conversationName(item);
            const sourceAvatar = conversationAvatar(item);
            const avatar = fastAvatarUri(sourceAvatar);
            const previewAvatar = highQualityImageUri(sourceAvatar);
            const official = isOfficialConversation(item);
            const lastMessageIsMine = item.lastMessage?.senderId === ownerId;
            const selectedForBatch = selectedConversationIds.has(item.id);
            const storyAuthorId = item.type === 'direct'
              ? item.participants.find(participant => participant.id && participant.id !== ownerId)?.id
              : null;
            const peerId = item.type === 'direct'
              ? item.participants.find(participant => participant.id && participant.id !== ownerId)?.id || null
              : null;
            const storyState = storyAuthorId ? storyAuthors?.[storyAuthorId] : undefined;
            const hasStory = Boolean(storyState);
            return (
              <View style={[styles.conversationRow, official && styles.officialRow, selectedForBatch && styles.conversationRowSelected]}>
                <Pressable
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Photo de ${name}`}
                  onPress={() => {
                    selectionHaptic();
                    setAvatarPreview({
                      uri: official ? null : previewAvatar,
                      name,
                      official,
                      storyAuthorId: hasStory ? storyAuthorId : null,
                      conversation: item,
                      peerId,
                    });
                  }}
                  hitSlop={8}
                  style={styles.avatarWrap}
                >
                  <View style={[styles.avatarStoryFrame, hasStory ? (storyState?.hasUnread ? styles.avatarStoryUnread : styles.avatarStorySeen) : null]}>
                    <View style={[styles.avatar, official && styles.officialAvatar]}>
                      {official ? <OracleOfficialAvatar size={50} /> : avatar ? <Image source={{ uri: avatar, cache: 'force-cache' }} style={styles.avatarImage} resizeMode="cover" /> : <Text maxFontSizeMultiplier={1.05} style={styles.avatarText}>{initials(name)}</Text>}
                    </View>
                  </View>
                  {selectedForBatch ? <View style={styles.batchSelectedDot}><Check size={13} color="#FFFFFF" strokeWidth={3.2} /></View> : null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ouvrir la conversation ${name}`}
                  hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                  pressRetentionOffset={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  android_ripple={{ color: 'rgba(16,42,42,0.06)', borderless: false }}
                  style={({ pressed }) => [styles.conversationOpenArea, pressed && styles.conversationOpenAreaPressed]}
                  onPress={() => {
                    selectionHaptic();
                    if (selectionMode) {
                      toggleConversationSelection(item.id);
                      return;
                    }
                    onOpenConversation(item);
                  }}
                  onLongPress={() => beginConversationSelection(item)}
                >
                  <View style={styles.conversationText}>
                    <View style={styles.titleLine}>
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.conversationTitle}>{name}</Text>
                      {official ? <OfficialVerifiedBadge size={22} /> : null}
                      {official ? <VerifiedLabel style={styles.verifiedLabel} /> : null}
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
              </View>
            );
          }}
        />
      </View>
      <NativePhotoViewer
        visible={Boolean(avatarPreview)}
        uri={avatarPreview?.uri}
        source={avatarPreview?.official ? ORACLE_APP_ICON : undefined}
        title={avatarPreview?.name}
        fallbackText={initials(avatarPreview?.name)}
        imageResizeMode={avatarPreview?.official ? 'contain' : 'cover'}
        onClose={() => setAvatarPreview(null)}
      >
        {!avatarPreview?.official && avatarPreview?.conversation ? (
          <View style={styles.avatarPreviewActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ouvrir la conversation"
              style={styles.avatarPreviewAction}
              onPress={() => {
                const conversation = avatarPreview.conversation;
                setAvatarPreview(null);
                if (conversation) onOpenConversation(conversation);
              }}
            >
              <MessageCircle size={18} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.avatarPreviewActionText}>Message</Text>
            </Pressable>
            {avatarPreview.peerId && onStartCallFromPeer ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Appeler en audio"
                  style={styles.avatarPreviewAction}
                  onPress={() => {
                    const peerId = avatarPreview.peerId;
                    setAvatarPreview(null);
                    if (peerId) void onStartCallFromPeer(peerId, 'audio');
                  }}
                >
                  <Phone size={18} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.avatarPreviewActionText}>Audio</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Appeler en vidéo"
                  style={styles.avatarPreviewAction}
                  onPress={() => {
                    const peerId = avatarPreview.peerId;
                    setAvatarPreview(null);
                    if (peerId) void onStartCallFromPeer(peerId, 'video');
                  }}
                >
                  <Video size={18} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.avatarPreviewActionText}>Vidéo</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}
        {avatarPreview?.storyAuthorId && onOpenStoryAuthor ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voir le statut"
            style={styles.avatarPreviewAction}
            onPress={() => {
              const authorId = avatarPreview.storyAuthorId;
              setAvatarPreview(null);
              if (authorId) onOpenStoryAuthor(authorId);
            }}
          >
            <Eye size={18} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.avatarPreviewActionText}>Voir le statut</Text>
          </Pressable>
        ) : null}
      </NativePhotoViewer>
      <Modal visible={Boolean(groupModal)} transparent animationType="fade" onRequestClose={closeGroupModal}>
        <Pressable style={styles.groupModalBackdrop} onPress={closeGroupModal}>
          <Pressable style={styles.groupModalCard} onPress={event => event.stopPropagation()}>
            <Text style={styles.groupModalTitle}>{groupModalTitle}</Text>
            <Text style={styles.groupModalSub}>{groupModalSubtitle}</Text>
            {groupModalMode === 'create' || groupModalMode === 'edit' ? (
              <View style={styles.groupProfileEditor}>
                <Pressable
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Choisir la photo du groupe"
                  onPress={pickGroupAvatar}
                  disabled={groupBusy}
                  style={styles.groupProfileAvatar}
                >
                  {groupAvatar ? (
                    <Image source={{ uri: highQualityImageUri(groupAvatar) || groupAvatar }} style={styles.groupProfileAvatarImage} resizeMode="cover" />
                  ) : (
                    <ImageIcon size={24} color="#FFFFFF" strokeWidth={2.4} />
                  )}
                </Pressable>
                <View style={styles.groupProfileFields}>
                  <TextInput
                    value={groupName}
                    onChangeText={setGroupName}
                    placeholder="Nom du groupe"
                    placeholderTextColor={colors.muted}
                    style={styles.groupNameInput}
                  />
                  <TextInput
                    value={groupDescription}
                    onChangeText={setGroupDescription}
                    placeholder="Description du groupe"
                    placeholderTextColor={colors.muted}
                    multiline
                    style={[styles.groupNameInput, styles.groupDescriptionInput]}
                  />
                  <Pressable onPress={pickGroupAvatar} disabled={groupBusy} style={styles.groupAvatarButton}>
                    <ImageIcon size={16} color={colors.header} strokeWidth={2.5} />
                    <Text style={styles.groupAvatarButtonText}>{groupAvatar ? 'Changer la photo' : 'Ajouter une photo'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {groupModalMode === 'create' || groupModalMode === 'add' ? (
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
                        {avatar ? <Image source={{ uri: avatar, cache: 'force-cache' }} style={styles.groupMemberAvatarImage} resizeMode="cover" /> : <Text style={styles.groupMemberAvatarText}>{initials(contact.name || contact.username)}</Text>}
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
            ) : null}
            {groupModalMode === 'members' ? (
              <ScrollView style={styles.groupMemberList} contentContainerStyle={styles.groupMemberListContent}>
                {!groupModal?.conversation?.participants?.length ? (
                  <Text style={styles.groupEmptyText}>Aucun autre membre à afficher.</Text>
                ) : null}
                {(groupModal?.conversation?.participants || []).map(contact => {
                  const avatar = highQualityImageUri(contact.avatar);
                  const admin = contact.role === 'admin';
                  return (
                    <View key={contact.id} style={styles.groupManageRow}>
                      <View style={styles.groupMemberAvatar}>
                        {avatar ? <Image source={{ uri: avatar, cache: 'force-cache' }} style={styles.groupMemberAvatarImage} resizeMode="cover" /> : <Text style={styles.groupMemberAvatarText}>{initials(contact.name || contact.username)}</Text>}
                      </View>
                      <View style={styles.groupMemberText}>
                        <Text numberOfLines={1} style={styles.groupMemberName}>{contact.name || contact.username || 'Contact'}</Text>
                        <View style={styles.groupRoleLine}>
                          {admin ? <Shield size={13} color={colors.header} strokeWidth={2.6} /> : <Users size={13} color={colors.muted} strokeWidth={2.4} />}
                          <Text numberOfLines={1} style={[styles.groupMemberMeta, admin && styles.groupAdminMeta]}>{admin ? 'Admin du groupe' : 'Membre'}</Text>
                        </View>
                      </View>
                      {currentGroupIsAdmin ? (
                        <View style={styles.groupMemberActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={admin ? 'Retirer le rôle admin' : 'Nommer admin'}
                            onPress={() => void updateGroupMemberRole(contact, admin ? 'member' : 'admin')}
                            disabled={groupBusy}
                            style={styles.groupIconAction}
                          >
                            {admin ? <ShieldOff size={16} color={colors.header} strokeWidth={2.5} /> : <Shield size={16} color={colors.header} strokeWidth={2.5} />}
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Retirer ce membre"
                            onPress={() => removeGroupMember(contact)}
                            disabled={groupBusy}
                            style={styles.groupDangerIconAction}
                          >
                            <UserMinus size={16} color={colors.danger} strokeWidth={2.6} />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {groupModal?.conversation?.pendingInvitations?.length ? (
                  <View style={styles.pendingInvitationsBlock}>
                    <Text style={styles.pendingInvitationsTitle}>Invitations</Text>
                    {groupModal.conversation.pendingInvitations.map(invitation => {
                      const contact = invitation.invitedUser;
                      const avatar = highQualityImageUri(contact?.avatar);
                      const status = String(invitation.status || '').toUpperCase();
                      const pending = status === 'PENDING' || status === 'INVITED';
                      return (
                        <View key={invitation.id} style={styles.groupManageRow}>
                          <View style={styles.groupMemberAvatar}>
                            {avatar ? <Image source={{ uri: avatar, cache: 'force-cache' }} style={styles.groupMemberAvatarImage} resizeMode="cover" /> : <Text style={styles.groupMemberAvatarText}>{initials(contact?.name || contact?.username)}</Text>}
                          </View>
                          <View style={styles.groupMemberText}>
                            <Text numberOfLines={1} style={styles.groupMemberName}>{contact?.name || contact?.username || 'Contact invité'}</Text>
                            <Text numberOfLines={1} style={[styles.groupMemberMeta, pending ? styles.groupPendingMeta : null]}>
                              {pending ? 'Invitation en attente' : status === 'DECLINED' ? 'Invitation refusée' : status}
                            </Text>
                          </View>
                          {currentGroupIsAdmin && pending ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Annuler cette invitation"
                              onPress={() => cancelGroupInvitation(invitation)}
                              disabled={groupBusy}
                              style={styles.groupDangerIconAction}
                            >
                              <X size={16} color={colors.danger} strokeWidth={2.6} />
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
            {groupNotice ? <Text style={styles.groupNotice}>{groupNotice}</Text> : null}
            <View style={styles.groupModalActions}>
              <Pressable onPress={closeGroupModal} disabled={groupBusy} style={styles.groupSecondaryButton}>
                <Text style={styles.groupSecondaryText}>{groupModalMode === 'members' ? 'Fermer' : 'Annuler'}</Text>
              </Pressable>
              {groupModalMode === 'members' ? null : (
                <Pressable onPress={() => void submitGroupModal()} disabled={groupSubmitDisabled} style={[styles.groupPrimaryButton, groupSubmitDisabled && styles.groupButtonDisabled]}>
                  {groupBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.groupPrimaryText}>{groupModalMode === 'add' ? 'Inviter' : groupModalMode === 'edit' ? 'Enregistrer' : 'Créer'}</Text>}
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
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
  searchWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, backgroundColor: colors.surface },
  conversationSearchRow: { minHeight: 50, borderRadius: 25, backgroundColor: colors.input, borderWidth: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 },
  conversationSearchInput: { flex: 1, minHeight: 46, color: colors.text, fontWeight: '500', paddingHorizontal: 0, fontSize: 18 },
  searchClear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  searchClearText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  filterScroller: { maxHeight: 50, backgroundColor: colors.surface },
  filters: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, backgroundColor: colors.surface, alignItems: 'center' },
  filterPill: { minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(17,27,33,0.16)', backgroundColor: '#FFFFFF', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  filterPillActive: { backgroundColor: '#E9EDEA', borderColor: '#D7DDDA' },
  filterPillPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  filterText: { color: colors.secondary, fontSize: 14, lineHeight: 16, fontWeight: '800' },
  filterTextActive: { color: colors.text, fontWeight: '900' },
  filterCount: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterCountActive: { backgroundColor: colors.brand },
  filterCountText: { color: colors.muted, fontSize: 11, lineHeight: 13, fontWeight: '900' },
  filterCountTextActive: { color: '#FFFFFF' },
  filterPlus: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  conversationSelectionBar: { minHeight: 58, marginHorizontal: 12, marginTop: 4, marginBottom: 8, borderRadius: 20, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(0,168,132,0.24)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 10 },
  selectionCloseButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  selectionCount: { flex: 1, minWidth: 0, color: colors.header, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectionActionButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(16,42,42,0.10)' },
  selectionDangerButton: { backgroundColor: '#FEE2E2', borderColor: 'rgba(180,35,24,0.16)' },
  listSwipeArea: { flex: 1 },
  conversationList: { flexGrow: 1, paddingTop: 2 },
  conversationRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', paddingVertical: 9, paddingLeft: 16, paddingRight: 16 },
  conversationRowSelected: { backgroundColor: 'rgba(0,168,132,0.10)' },
  officialRow: { backgroundColor: 'rgba(16,42,42,0.025)' },
  conversationOpenArea: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', borderRadius: 14 },
  conversationOpenAreaPressed: { backgroundColor: 'rgba(16,42,42,0.045)' },
  avatarWrap: { width: 56, height: 56, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  avatarStoryFrame: { width: 56, height: 56, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  avatarStoryUnread: { borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.08)' },
  avatarStorySeen: { borderColor: '#94A3B8', backgroundColor: 'rgba(148,163,184,0.08)' },
  avatar: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  officialAvatar: { backgroundColor: colors.header, borderColor: 'rgba(217,183,91,0.82)', borderWidth: 2 },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontWeight: '900', fontSize: 16 },
  batchSelectedDot: { position: 'absolute', right: -2, top: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatarPreviewActions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  avatarPreviewAction: { minHeight: 46, borderRadius: 23, backgroundColor: 'rgba(37,211,102,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  avatarPreviewActionText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  conversationText: { flex: 1, minWidth: 0, marginLeft: 12 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  conversationTitle: { flexShrink: 1, color: colors.text, fontSize: 15.7, fontWeight: '900', lineHeight: 19 },
  verifiedLabel: { color: colors.header, fontSize: 11, lineHeight: 14, fontWeight: '900' },
  verifiedInitial: { color: colors.accent },
  previewLine: { minHeight: 19, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  conversationPreview: { flex: 1, minWidth: 0, color: colors.muted, fontSize: 13.6, lineHeight: 18, fontWeight: '700' },
  conversationPreviewUnread: { color: colors.text, fontWeight: '900' },
  conversationTrailing: { width: 68, alignItems: 'flex-end', justifyContent: 'center', gap: 5 },
  conversationTime: { color: colors.muted, fontSize: 11.5, lineHeight: 14, fontWeight: '700' },
  officialBadge: { overflow: 'hidden', borderRadius: 10, backgroundColor: '#E7F5FF', color: '#1167B1', borderWidth: 1, borderColor: 'rgba(17,103,177,0.16)', paddingHorizontal: 7, paddingVertical: 2, fontSize: 9.8, lineHeight: 12, fontWeight: '900' },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginLeft: 8 },
  unreadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  emptyState: { minHeight: 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 8 },
  newAccountEmpty: { minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  newAccountIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(0,168,132,0.20)', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emptyTitle: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  emptySearch: { color: colors.secondary, fontSize: 15, lineHeight: 22, fontWeight: '500', textAlign: 'center' },
  findFriendsButton: { width: '100%', maxWidth: 320, minHeight: 58, borderRadius: 22, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, marginTop: 4, shadowColor: colors.header, shadowOpacity: 0.20, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  findFriendsButtonPressed: { opacity: 0.9, transform: [{ scale: 0.988 }] },
  findFriendsButtonText: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '900' },
  groupModalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.48)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 28 },
  groupModalCard: { width: '100%', maxWidth: 430, maxHeight: '86%', borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
  groupModalTitle: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  groupModalSub: { color: colors.secondary, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  groupProfileEditor: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupProfileAvatar: { width: 66, height: 66, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.header, borderWidth: 1, borderColor: 'rgba(16,42,42,0.18)' },
  groupProfileAvatarImage: { width: '100%', height: '100%' },
  groupProfileFields: { flex: 1, minWidth: 0, gap: 8 },
  groupNameInput: { minHeight: 46, borderRadius: 16, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 13, fontSize: 15, fontWeight: '800' },
  groupDescriptionInput: { minHeight: 58, maxHeight: 92, paddingTop: 10, textAlignVertical: 'top', fontSize: 13.5, lineHeight: 18 },
  groupAvatarButton: { alignSelf: 'flex-start', minHeight: 34, borderRadius: 17, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(0,168,132,0.22)', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11 },
  groupAvatarButtonText: { color: colors.header, fontSize: 12, lineHeight: 15, fontWeight: '900' },
  groupMemberList: { maxHeight: 330 },
  groupMemberListContent: { gap: 7, paddingVertical: 2 },
  groupEmptyText: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '800', paddingVertical: 12, textAlign: 'center' },
  groupMemberRow: { minHeight: 58, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  groupMemberRowSelected: { backgroundColor: '#EAF4F1', borderColor: 'rgba(16,42,42,0.22)' },
  groupMemberAvatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.header, borderWidth: 1, borderColor: 'rgba(16,42,42,0.10)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  groupMemberAvatarImage: { width: '100%', height: '100%' },
  groupMemberAvatarText: { color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '900' },
  groupMemberText: { flex: 1, minWidth: 0 },
  groupMemberName: { color: colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  groupMemberMeta: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  groupAdminMeta: { color: colors.header, fontWeight: '900' },
  groupPendingMeta: { color: '#B7791F', fontWeight: '900' },
  groupRoleLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  groupManageRow: { minHeight: 66, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  groupMemberActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  groupIconAction: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(0,168,132,0.20)', alignItems: 'center', justifyContent: 'center' },
  groupDangerIconAction: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: 'rgba(180,35,24,0.16)', alignItems: 'center', justifyContent: 'center' },
  groupCheck: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  groupCheckSelected: { borderColor: colors.header, backgroundColor: colors.header },
  groupNotice: { color: colors.danger, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  groupModalActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  groupSecondaryButton: { flex: 1, minHeight: 44, borderRadius: 16, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  groupSecondaryText: { color: colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  groupPrimaryButton: { flex: 1, minHeight: 44, borderRadius: 16, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  groupButtonDisabled: { opacity: 0.55 },
  groupPrimaryText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  invitationStack: { paddingHorizontal: 12, paddingTop: 10, gap: 8, backgroundColor: colors.background },
  invitationCard: { minHeight: 70, borderRadius: 18, backgroundColor: '#F4FBF8', borderWidth: 1, borderColor: 'rgba(0,128,105,0.16)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9 },
  invitationBody: { flex: 1, minWidth: 0 },
  invitationTitle: { color: colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  invitationText: { color: colors.secondary, fontSize: 12.2, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  invitationActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  invitationReject: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  invitationAccept: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
  pendingInvitationsBlock: { gap: 7, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  pendingInvitationsTitle: { color: colors.header, fontSize: 12.5, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase' },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 54, height: 54, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A2A', shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
});
