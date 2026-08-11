import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { Conversation } from '@/types/messenger';
import { conversationName, initials, messagePreview } from './homeUtils';

type NativeConversationListProps = {
  conversations: Conversation[];
  search: string;
  busy: boolean;
  onSearchChange: (value: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onConversationActions: (conversation: Conversation) => void;
  onLogout: () => void | Promise<void>;
};

export function NativeConversationList({
  conversations,
  search,
  busy,
  onSearchChange,
  onOpenConversation,
  onConversationActions,
  onLogout,
}: NativeConversationListProps) {
  return (
    <View style={styles.listPanel}>
      <View style={styles.conversationSearchRow}>
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder="Rechercher une conversation"
          placeholderTextColor={colors.muted}
          style={styles.conversationSearchInput}
        />
        {search ? (
          <Pressable onPress={() => onSearchChange('')} style={styles.searchClear}>
            <Text style={styles.searchClearText}>×</Text>
          </Pressable>
        ) : null}
      </View>
      {busy ? <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} /> : null}
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.conversationList}
        ListEmptyComponent={!busy ? <Text style={styles.emptySearch}>{search.trim() ? 'Aucune conversation trouvée.' : 'Aucune conversation.'}</Text> : null}
        ListFooterComponent={<Pressable onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>Déconnexion</Text></Pressable>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.conversationRow}
            onPress={() => onOpenConversation(item)}
            onLongPress={() => onConversationActions(item)}
          >
            <View style={styles.avatar}>
              {item.avatar ? <Image source={{ uri: item.avatar }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(conversationName(item))}</Text>}
            </View>
            <View style={styles.conversationText}>
              <Text style={styles.conversationTitle}>{conversationName(item)}</Text>
              <Text numberOfLines={1} style={styles.conversationPreview}>{messagePreview(item.lastMessage)}</Text>
            </View>
            {item.unreadCount ? <View style={styles.unread}><Text style={styles.unreadText}>{item.unreadCount}</Text></View> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listPanel: { flex: 1 },
  conversationSearchRow: { marginHorizontal: 12, marginTop: 12, minHeight: 46, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  conversationSearchInput: { flex: 1, minHeight: 44, color: colors.text, fontWeight: '800', paddingHorizontal: 4 },
  searchClear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  searchClearText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  conversationList: { padding: 12, paddingBottom: 24 },
  conversationRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
  avatar: { width: 50, height: 50, borderRadius: 18, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontWeight: '900', fontSize: 16 },
  conversationText: { flex: 1, minWidth: 0, marginLeft: 12 },
  conversationTitle: { color: colors.text, fontSize: 15.5, fontWeight: '900' },
  conversationPreview: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 3 },
  unread: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  unreadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  emptySearch: { color: colors.muted, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 30 },
  logoutButton: { marginTop: 8, alignItems: 'center', padding: 14 },
  logoutText: { color: colors.danger, fontWeight: '900' },
});
