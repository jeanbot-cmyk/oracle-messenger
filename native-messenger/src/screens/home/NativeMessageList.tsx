import { useEffect, useRef } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeChatMediaMessage } from './NativeChatMediaMessage';
import type { LocalGalleryItem } from '@/services/localMedia';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import { initials, messagePreview } from './homeUtils';

type NativeMessageListProps = {
  messages: Message[];
  currentUserId?: string | null;
  currentUserName?: string | null;
  currentUserAvatar?: string | null;
  selectedMessageIds: string[];
  localMediaByMessageId: Record<string, LocalGalleryItem>;
  messageSearch: string;
  onToggleSelection: (messageId: string) => void;
  onOpenMessageActions: (message: Message) => void;
  onLoadOlderMessages: () => void | Promise<void>;
};

export function NativeMessageList({
  messages,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  selectedMessageIds,
  localMediaByMessageId,
  messageSearch,
  onToggleSelection,
  onOpenMessageActions,
  onLoadOlderMessages,
}: NativeMessageListProps) {
  const listRef = useRef<FlatList<Message>>(null);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (!lastMessageId || messageSearch) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [lastMessageId, messageSearch]);

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={item => item.id}
      style={styles.list}
      contentContainerStyle={styles.messagesList}
      onScroll={({ nativeEvent }) => {
        if (nativeEvent.contentOffset.y <= 24 && messages.length >= 45) void onLoadOlderMessages();
      }}
      scrollEventThrottle={120}
      ListEmptyComponent={messageSearch ? <Text style={styles.emptySearch}>Aucun message trouvé.</Text> : null}
      renderItem={({ item }) => {
        const mine = item.senderId === currentUserId;
        const isVoice = item.type === 'audio' || item.type === 'voice';
        const avatar = mine ? currentUserAvatar : item.sender?.avatar;
        const avatarLabel = initials(mine ? currentUserName : item.sender?.name);
        const selectedForAction = selectedMessageIds.includes(item.id);
        return (
          <Pressable
            onPress={() => selectedMessageIds.length ? onToggleSelection(item.id) : undefined}
            onLongPress={() => onOpenMessageActions(item)}
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, selectedForAction && styles.bubbleSelected]}
          >
            {item.replyTo ? (
              <View style={styles.replyPreview}>
                <Text style={styles.replyPreviewTitle}>{item.replyTo.sender?.name || 'Réponse'}</Text>
                <Text numberOfLines={1} style={styles.replyPreviewText}>{messagePreview(item.replyTo)}</Text>
              </View>
            ) : null}
            {isVoice ? (
              <View style={styles.voiceRow}>
                {!mine ? (
                  <View style={styles.voiceAvatar}>
                    {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.voiceAvatarText}>{avatarLabel}</Text>}
                  </View>
                ) : null}
                <NativeChatMediaMessage message={item} localItem={localMediaByMessageId[item.id]} />
                {mine ? (
                  <View style={styles.voiceAvatar}>
                    {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.voiceAvatarText}>{avatarLabel}</Text>}
                  </View>
                ) : null}
              </View>
            ) : (
              item.type === 'text'
                ? <Text style={styles.bubbleText}>{item.content}</Text>
                : <NativeChatMediaMessage message={item} localItem={localMediaByMessageId[item.id]} />
            )}
            {item.reactions?.length ? (
              <Text style={styles.reactionLine}>{item.reactions.map(reaction => reaction.emoji).join(' ')}</Text>
            ) : null}
            <Text style={styles.bubbleMeta}>{mine ? 'Moi' : item.sender?.name || 'Contact'} • {item.isEdited ? 'modifié • ' : ''}{item.status || 'sent'}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  messagesList: { paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9, gap: 2 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  bubbleSelected: { borderWidth: 2, borderColor: colors.accent },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.bubbleOut },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptySearch: { color: colors.muted, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 30 },
  bubbleText: { color: colors.text, fontSize: 15.5, lineHeight: 20, fontWeight: '500' },
  bubbleMeta: { color: colors.muted, fontSize: 10.5, marginTop: 4, fontWeight: '700' },
  replyPreview: { borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 8, marginBottom: 7 },
  replyPreviewTitle: { color: colors.header, fontSize: 11, fontWeight: '900' },
  replyPreviewText: { color: colors.muted, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  reactionLine: { alignSelf: 'flex-start', marginTop: 7, color: colors.header, fontSize: 15, fontWeight: '900' },
  voiceRow: { minWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 10 },
  voiceAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  voiceAvatarText: { color: colors.header, fontSize: 12, fontWeight: '900' },
});
