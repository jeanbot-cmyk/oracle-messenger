import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Plus, Search } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import type { Conversation } from '@/types/messenger';
import { conversationName, initials, messagePreview } from './homeUtils';

type ConversationFilter = 'all' | 'unread' | 'fav' | 'groups' | 'archived';

type NativeConversationListProps = {
  ownerId: string;
  conversations: Conversation[];
  search: string;
  busy: boolean;
  onSearchChange: (value: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onConversationActions: (conversation: Conversation) => void;
  onOpenContacts: () => void;
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

export function NativeConversationList({
  ownerId,
  conversations,
  search,
  busy,
  onSearchChange,
  onOpenConversation,
  onConversationActions,
  onOpenContacts,
}: NativeConversationListProps) {
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
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

  const visibleConversations = useMemo(() => conversations.filter(conversation => {
    const archived = archivedIds.has(conversation.id);
    const favorite = favoriteIds.has(conversation.id) || Boolean((conversation as any).isFavorite || (conversation as any).favorite);
    if (filter === 'archived') return archived;
    if (archived) return false;
    if (filter === 'unread') return Boolean(conversation.unreadCount);
    if (filter === 'groups') return conversation.type === 'group';
    if (filter === 'fav') return favorite;
    return true;
  }), [archivedIds, conversations, favoriteIds, filter]);
  const activeConversations = useMemo(() => conversations.filter(conversation => !archivedIds.has(conversation.id)), [archivedIds, conversations]);
  const filters = [
    { id: 'all' as const, label: 'Toutes', count: activeConversations.length },
    { id: 'unread' as const, label: 'Non lues', count: activeConversations.filter(item => item.unreadCount).length },
    { id: 'fav' as const, label: 'Favoris', count: activeConversations.filter(item => favoriteIds.has(item.id) || (item as any).isFavorite || (item as any).favorite).length },
    { id: 'groups' as const, label: 'Groupes', count: activeConversations.filter(item => item.type === 'group').length },
    { id: 'archived' as const, label: 'Archivées', count: archivedIds.size },
  ];

  const showConversationActions = useCallback((conversation: Conversation) => {
    const isFavorite = favoriteIds.has(conversation.id);
    const isArchived = archivedIds.has(conversation.id);
    Alert.alert('Conversation', conversationName(conversation), [
      { text: 'Ouvrir', onPress: () => onOpenConversation(conversation) },
      { text: isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', onPress: () => toggleFavorite(conversation.id) },
      { text: isArchived ? 'Désarchiver' : 'Archiver', onPress: () => toggleArchive(conversation.id) },
      { text: 'Supprimer / options', style: 'destructive', onPress: () => onConversationActions(conversation) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [archivedIds, favoriteIds, onConversationActions, onOpenConversation, toggleArchive, toggleFavorite]);

  return (
    <View style={styles.listPanel}>
      <View style={styles.searchWrap}>
        <View style={styles.conversationSearchRow}>
          <Search size={18} color={colors.muted} strokeWidth={1.9} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Rechercher"
            placeholderTextColor={colors.muted}
            style={styles.conversationSearchInput}
          />
          {search ? (
            <Pressable onPress={() => onSearchChange('')} style={styles.searchClear}>
              <Text style={styles.searchClearText}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map(item => {
          const active = filter === item.id;
          return (
            <Pressable key={item.id} onPress={() => setFilter(item.id)} style={[styles.filterPill, active && styles.filterPillActive]}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
              <View style={[styles.filterCount, active && styles.filterCountActive]}>
                <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{item.count}</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable onPress={onOpenContacts} style={styles.filterPlus}><Plus size={20} color={colors.brand} strokeWidth={2.2} /></Pressable>
      </ScrollView>
      {busy ? <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} /> : null}
      <FlatList
        data={visibleConversations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.conversationList}
        ListEmptyComponent={!busy ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{search.trim() ? 'Aucun résultat' : filter === 'unread' ? 'Aucune non lue' : filter === 'groups' ? 'Aucun groupe' : filter === 'archived' ? 'Aucune discussion archivée' : 'Aucune conversation'}</Text>
            <Text style={styles.emptySearch}>{search.trim() ? 'Aucune conversation ne correspond à cette recherche.' : 'Importez vos contacts pour commencer à discuter.'}</Text>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <Pressable
            style={styles.conversationRow}
            onPress={() => onOpenConversation(item)}
            onLongPress={() => showConversationActions(item)}
          >
            <View style={styles.avatar}>
              {item.avatar ? <Image source={{ uri: item.avatar }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(conversationName(item))}</Text>}
            </View>
            <View style={styles.conversationText}>
              <Text numberOfLines={1} style={styles.conversationTitle}>{conversationName(item)}</Text>
              <Text numberOfLines={1} style={styles.conversationPreview}>{messagePreview(item.lastMessage)}</Text>
            </View>
            {item.unreadCount ? <View style={styles.unread}><Text style={styles.unreadText}>{item.unreadCount}</Text></View> : null}
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={onOpenContacts}>
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
  filters: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, backgroundColor: colors.surface },
  filterPill: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  filterPillActive: { backgroundColor: colors.brandSoft, borderColor: 'transparent' },
  filterText: { color: colors.secondary, fontSize: 14, fontWeight: '900' },
  filterTextActive: { color: colors.brand },
  filterCount: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterCountActive: { backgroundColor: colors.brand },
  filterCountText: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  filterCountTextActive: { color: '#FFFFFF' },
  filterPlus: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  conversationList: { paddingTop: 2, paddingBottom: 92 },
  conversationRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', paddingVertical: 9, paddingLeft: 16, paddingRight: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontWeight: '900', fontSize: 16 },
  conversationText: { flex: 1, minWidth: 0, marginLeft: 12 },
  conversationTitle: { color: colors.text, fontSize: 15.5, fontWeight: '900', lineHeight: 18 },
  conversationPreview: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginLeft: 8 },
  unreadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  emptyState: { minHeight: 320, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  emptySearch: { color: colors.secondary, fontSize: 15, lineHeight: 22, fontWeight: '500', textAlign: 'center' },
  fab: { position: 'absolute', right: 18, bottom: 96, width: 54, height: 54, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A2A', shadowOpacity: 0.2, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
});
