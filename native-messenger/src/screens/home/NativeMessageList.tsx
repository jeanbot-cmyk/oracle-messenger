import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Check, CheckCheck, Clock3, Mail, Phone, PhoneMissed, PhoneOff, UserRound, Video } from 'lucide-react-native';
import { NativeChatMediaMessage } from './NativeChatMediaMessage';
import type { LocalGalleryItem } from '@/services/localMedia';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import { highQualityImageUri, initials, messagePreview, parseCallTraceMessage, parseContactPayload, parseMediaPayload, type CallTraceMessage } from './homeUtils';

type NativeMessageListProps = {
  conversationId: string;
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
  onCallMessagePress?: (type: 'audio' | 'video', message: Message) => void | Promise<void>;
};

function formatMessageClock(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatMessageDay(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();
  if (sameDay(date, today)) return 'Aujourd’hui';
  if (sameDay(date, yesterday)) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function messageStatusLabel(status?: string) {
  const value = String(status || 'sent').toLowerCase();
  if (['read', 'seen'].includes(value)) return 'lu';
  if (['delivered', 'received'].includes(value)) return 'reçu';
  if (['pending', 'sending', 'queued', 'uploading'].includes(value)) return 'envoi';
  if (['failed', 'error'].includes(value)) return 'échec';
  return 'envoyé';
}

function MessageStatusIcon({ status }: { status?: string }) {
  const value = String(status || 'sent').toLowerCase();
  if (['failed', 'error'].includes(value)) return <AlertCircle size={12} color={colors.danger} strokeWidth={2.8} />;
  if (['pending', 'sending', 'queued', 'uploading'].includes(value)) return <Clock3 size={12} color={colors.muted} strokeWidth={2.8} />;
  if (['read', 'seen'].includes(value)) return <CheckCheck size={13} color={colors.readReceipt} strokeWidth={2.8} />;
  if (['delivered', 'received'].includes(value)) return <CheckCheck size={13} color={colors.muted} strokeWidth={2.8} />;
  return <Check size={13} color={colors.muted} strokeWidth={2.8} />;
}

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function openMessageUrl(rawUrl: string) {
  const cleanUrl = rawUrl.replace(/[.,!?;:)]+$/u, '');
  const normalized = cleanUrl.startsWith('www.') ? `https://${cleanUrl}` : cleanUrl;
  Linking.openURL(normalized).catch(() => undefined);
}

function renderLinkedMessageText(content: string) {
  const parts: { text: string; link: boolean }[] = [];
  let cursor = 0;
  for (const match of content.matchAll(URL_PATTERN)) {
    const value = match[0];
    const index = match.index || 0;
    if (index > cursor) parts.push({ text: content.slice(cursor, index), link: false });
    parts.push({ text: value, link: true });
    cursor = index + value.length;
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor), link: false });
  if (!parts.length) parts.push({ text: content, link: false });

  return (
    <Text style={styles.bubbleText}>
      {parts.map((part, index) => part.link ? (
        <Text
          key={`${part.text}-${index}`}
          accessibilityRole="link"
          onPress={() => openMessageUrl(part.text)}
          style={styles.bubbleLink}
        >
          {part.text}
        </Text>
      ) : (
        <Text key={`${part.text}-${index}`}>{part.text}</Text>
      ))}
    </Text>
  );
}

function inferMediaTypeFromContent(message: Message) {
  if (message.type !== 'text') return message.type;
  const payload = parseMediaPayload(message.content);
  if (!payload?.url) return 'text';
  const mime = String(payload.mime || '').toLowerCase();
  const url = String(payload.url || '').toLowerCase().split('?')[0] || '';
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(url)) return mime.includes('gif') || url.endsWith('.gif') ? 'gif' : 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|3gp|mkv)$/i.test(url)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|amr)$/i.test(url)) return 'audio';
  return 'file';
}

function NativeCallTraceMessage({
  trace,
  mine,
  clickable,
  clock,
}: {
  trace: CallTraceMessage;
  mine: boolean;
  clickable: boolean;
  clock: string;
}) {
  const StatusIcon = trace.status === 'missed'
    ? PhoneMissed
    : trace.status === 'refused' || trace.status === 'cancelled'
      ? PhoneOff
      : trace.type === 'video'
        ? Video
        : Phone;
  const ActionIcon = trace.type === 'video' ? Video : Phone;
  const isAlert = trace.status === 'missed' || trace.status === 'refused' || trace.status === 'cancelled';
  const statusText = trace.status === 'missed'
    ? 'Appel manqué'
    : trace.status === 'refused'
      ? 'Appel refusé'
      : trace.status === 'cancelled'
        ? 'Appel annulé'
        : trace.status === 'ended'
          ? 'Appel terminé'
          : 'Historique d’appel';

  return (
    <View
      style={[
        styles.callTraceCard,
        mine ? styles.callTraceMine : styles.callTraceOther,
        isAlert ? styles.callTraceAlert : styles.callTraceNeutral,
      ]}
    >
      <View style={[styles.callTraceIconWrap, isAlert ? styles.callTraceIconAlert : styles.callTraceIconNeutral]}>
        <StatusIcon size={19} color={isAlert ? colors.danger : colors.header} strokeWidth={2.7} />
      </View>
      <View style={styles.callTraceBody}>
        <Text numberOfLines={1} style={styles.callTraceTitle}>{trace.label}</Text>
        <Text numberOfLines={1} style={[styles.callTraceSubtitle, isAlert ? styles.callTraceSubtitleAlert : null]}>
          {clock ? `${clock} · ` : ''}{clickable ? trace.actionLabel : statusText}{trace.durationLabel ? ` · ${trace.durationLabel}` : ''}
        </Text>
      </View>
      {clickable ? (
        <View style={styles.callTraceAction}>
          <ActionIcon size={15} color={colors.header} strokeWidth={2.8} />
        </View>
      ) : null}
    </View>
  );
}

function NativeContactMessage({ content }: { content: string }) {
  const contact = parseContactPayload(content);
  const name = contact.name || contact.username || 'Contact Oracle';
  const detail = contact.phone || contact.email || contact.username || 'Oracle Messenger';
  const canOpen = Boolean(contact.phone || contact.email);
  const ContactActionIcon = contact.email && !contact.phone ? Mail : Phone;

  function openContactAction() {
    if (contact.phone) {
      Linking.openURL(`tel:${contact.phone.replace(/[^\d+]/g, '')}`).catch(() => undefined);
      return;
    }
    if (contact.email) Linking.openURL(`mailto:${contact.email}`).catch(() => undefined);
  }

  return (
    <View style={styles.contactCard}>
      <View style={styles.contactAvatar}>
        {contact.avatar ? <Image source={{ uri: highQualityImageUri(contact.avatar) || contact.avatar, cache: 'force-cache' }} style={styles.contactAvatarImage} /> : <Text style={styles.contactAvatarText}>{initials(name)}</Text>}
      </View>
      <View style={styles.contactBody}>
        <Text numberOfLines={1} style={styles.contactName}>{name}</Text>
        <Text numberOfLines={1} style={styles.contactDetail}>{detail}</Text>
      </View>
      {canOpen ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Contacter" onPress={openContactAction} style={styles.contactAction}>
          <ContactActionIcon size={15} color={colors.header} strokeWidth={2.7} />
        </Pressable>
      ) : (
        <View style={styles.contactActionMuted}>
          <UserRound size={15} color={colors.muted} strokeWidth={2.5} />
        </View>
      )}
    </View>
  );
}

function ReactionBadges({ reactions }: { reactions?: Message['reactions'] }) {
  if (!reactions?.length) return null;
  const groups = reactions.reduce<{ emoji: string; count: number }[]>((acc, reaction) => {
    const existing = acc.find(item => item.emoji === reaction.emoji);
    if (existing) existing.count += 1;
    else acc.push({ emoji: reaction.emoji, count: 1 });
    return acc;
  }, []);
  return (
    <View style={styles.reactionBadges}>
      {groups.map(group => (
        <View key={group.emoji} style={styles.reactionBadge}>
          <Text style={styles.reactionEmoji}>{group.emoji}</Text>
          {group.count > 1 ? <Text style={styles.reactionCount}>{group.count}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function NativeMessageList({
  conversationId,
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
  onCallMessagePress,
}: NativeMessageListProps) {
  const listRef = useRef<FlatList<Message>>(null);
  const nearBottomRef = useRef(true);
  const lastAutoScrolledMessageIdRef = useRef<string | null>(null);
  const initialPositioningRef = useRef(true);
  const inverted = !messageSearch;
  const displayMessages = useMemo(() => (
    inverted ? [...messages].reverse() : messages
  ), [inverted, messages]);
  const lastMessageId = messages[messages.length - 1]?.id;
  const lastMessageSenderId = messages[messages.length - 1]?.senderId;

  useEffect(() => {
    nearBottomRef.current = true;
    lastAutoScrolledMessageIdRef.current = null;
    initialPositioningRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (!lastMessageId || messageSearch) return;
    if (lastAutoScrolledMessageIdRef.current === lastMessageId) return;
    if (!nearBottomRef.current && lastMessageSenderId !== currentUserId) return;
    const frame = requestAnimationFrame(() => {
      const animated = !initialPositioningRef.current;
      listRef.current?.scrollToOffset({ offset: 0, animated });
      lastAutoScrolledMessageIdRef.current = lastMessageId;
      initialPositioningRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [currentUserId, lastMessageId, lastMessageSenderId, messageSearch]);

  return (
    <FlatList
      ref={listRef}
      data={displayMessages}
      keyExtractor={item => item.id}
      style={styles.list}
      contentContainerStyle={styles.messagesList}
      inverted={inverted}
      initialNumToRender={18}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={42}
      windowSize={9}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={{
        minIndexForVisible: 0,
      }}
      onScroll={({ nativeEvent }) => {
        if (inverted) {
          nearBottomRef.current = nativeEvent.contentOffset.y < 120;
          const distanceFromTop = nativeEvent.contentSize.height - (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height);
          if (distanceFromTop <= 160 && messages.length >= 45) void onLoadOlderMessages();
          return;
        }
        const distanceFromBottom = nativeEvent.contentSize.height - (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height);
        nearBottomRef.current = distanceFromBottom < 120;
        if (nativeEvent.contentOffset.y <= 24 && messages.length >= 45) void onLoadOlderMessages();
      }}
      scrollEventThrottle={120}
      ListEmptyComponent={messageSearch ? <Text style={styles.emptySearch}>Aucun message trouvé.</Text> : null}
      renderItem={({ item, index }) => {
        const mine = item.senderId === currentUserId;
        const isVoice = item.type === 'audio' || item.type === 'voice';
        const callTrace = item.type === 'text' ? parseCallTraceMessage(item.content) : null;
        const avatar = mine ? currentUserAvatar : item.sender?.avatar;
        const avatarLabel = initials(mine ? currentUserName : item.sender?.name);
        const selectedForAction = selectedMessageIds.includes(item.id);
        const adjacent = inverted ? displayMessages[index + 1] : displayMessages[index - 1];
        const showDay = !adjacent || formatMessageDay(adjacent.createdAt) !== formatMessageDay(item.createdAt);
        const callClickable = Boolean(callTrace && onCallMessagePress && !selectedMessageIds.length);
        const handleBubblePress = () => {
          if (selectedMessageIds.length) {
            onToggleSelection(item.id);
            return;
          }
          if (callTrace && onCallMessagePress) void onCallMessagePress(callTrace.type, item);
        };
        return (
          <>
            {showDay ? <Text style={styles.daySeparator}>{formatMessageDay(item.createdAt)}</Text> : null}
            <Pressable
              accessibilityRole={callClickable ? 'button' : undefined}
              accessibilityLabel={callClickable ? callTrace?.actionLabel : undefined}
              android_ripple={callClickable ? { color: 'rgba(16,42,42,0.08)' } : undefined}
              onPress={selectedMessageIds.length || callClickable ? handleBubblePress : undefined}
              onLongPress={() => onOpenMessageActions(item)}
              style={({ pressed }) => [
                styles.bubble,
                callTrace ? styles.systemBubble : mine ? styles.bubbleMine : styles.bubbleOther,
                isVoice ? styles.audioBubble : null,
                callTrace ? styles.callBubble : null,
                pressed && callClickable ? styles.callTracePressed : null,
                selectedForAction && styles.bubbleSelected,
              ]}
            >
              {item.replyTo ? (
                <View style={styles.replyPreview}>
                  <Text style={styles.replyPreviewTitle}>{item.replyTo.sender?.name || 'Réponse'}</Text>
                  <Text numberOfLines={1} style={styles.replyPreviewText}>{messagePreview(item.replyTo)}</Text>
                </View>
              ) : null}
              {isVoice ? (
                <NativeChatMediaMessage
                  message={item}
                  localItem={localMediaByMessageId[item.id]}
                  mine={mine}
                  avatar={avatar}
                  avatarLabel={avatarLabel}
                />
              ) : callTrace ? (
                <NativeCallTraceMessage
                  trace={callTrace}
                  mine={mine}
                  clickable={callClickable}
                  clock={formatMessageClock(item.createdAt)}
                />
              ) : (
                item.type === 'contact'
                  ? <NativeContactMessage content={item.content} />
                  : item.type === 'text' && inferMediaTypeFromContent(item) === 'text'
                  ? renderLinkedMessageText(item.content)
                  : <NativeChatMediaMessage message={{ ...item, type: inferMediaTypeFromContent(item) }} localItem={localMediaByMessageId[item.id]} mine={mine} />
              )}
              <ReactionBadges reactions={item.reactions} />
              {callTrace ? null : (
                <View style={styles.metaRow}>
                  <Text numberOfLines={1} style={styles.metaAuthor}>{mine ? 'Moi' : item.sender?.name || 'Contact'}</Text>
                  <Text style={styles.metaText}>{formatMessageClock(item.createdAt)}</Text>
                  {item.isEdited ? <Text style={styles.metaText}>modifié</Text> : null}
                  {mine ? (
                    <>
                      <MessageStatusIcon status={item.status} />
                      <Text style={[styles.metaText, ['read', 'seen'].includes(String(item.status || '').toLowerCase()) && styles.metaTextRead]}>{messageStatusLabel(item.status)}</Text>
                    </>
                  ) : null}
                </View>
              )}
            </Pressable>
          </>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  messagesList: { paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9, gap: 2 },
  daySeparator: { alignSelf: 'center', overflow: 'hidden', marginVertical: 8, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(16,42,42,0.08)', color: colors.header, fontSize: 11.5, fontWeight: '900' },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  audioBubble: { maxWidth: '88%', paddingHorizontal: 6, paddingVertical: 6 },
  callBubble: { minWidth: 226, paddingHorizontal: 7, paddingVertical: 7 },
  systemBubble: { alignSelf: 'center', width: '92%', maxWidth: 342, backgroundColor: 'transparent' },
  bubbleSelected: { borderWidth: 2, borderColor: colors.accent },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.bubbleOut },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptySearch: { color: colors.muted, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 30 },
  bubbleText: { color: colors.text, fontSize: 15.5, lineHeight: 20, fontWeight: '500' },
  bubbleLink: { color: '#0F766E', fontWeight: '900', textDecorationLine: 'underline' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 5, minHeight: 14 },
  metaAuthor: { flexShrink: 1, color: colors.muted, fontSize: 10.5, fontWeight: '800' },
  metaText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  metaTextRead: { color: colors.readReceipt, fontWeight: '900' },
  replyPreview: { borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 8, marginBottom: 7 },
  replyPreviewTitle: { color: colors.header, fontSize: 11, fontWeight: '900' },
  replyPreviewText: { color: colors.muted, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  reactionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignSelf: 'flex-start', marginTop: 7 },
  reactionBadge: { minHeight: 24, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, shadowColor: '#102A2A', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  reactionEmoji: { fontSize: 15, lineHeight: 19 },
  reactionCount: { color: colors.secondary, fontSize: 11, lineHeight: 14, fontWeight: '900' },
  callTraceCard: { minHeight: 58, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1 },
  callTraceMine: { backgroundColor: 'rgba(255,255,255,0.56)' },
  callTraceOther: { backgroundColor: 'rgba(16,42,42,0.035)' },
  callTraceAlert: { borderColor: 'rgba(180,35,24,0.16)' },
  callTraceNeutral: { borderColor: 'rgba(16,42,42,0.09)' },
  callTracePressed: { transform: [{ scale: 0.988 }], opacity: 0.88 },
  callTraceIconWrap: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  callTraceIconAlert: { backgroundColor: 'rgba(180,35,24,0.10)' },
  callTraceIconNeutral: { backgroundColor: 'rgba(16,42,42,0.09)' },
  callTraceBody: { flex: 1, minWidth: 0 },
  callTraceTitle: { color: colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  callTraceSubtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '800', marginTop: 1 },
  callTraceSubtitleAlert: { color: colors.danger },
  callTraceAction: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.08)' },
  contactCard: { minWidth: 236, maxWidth: 286, minHeight: 66, borderRadius: 16, backgroundColor: 'rgba(16,42,42,0.055)', borderWidth: 1, borderColor: 'rgba(16,42,42,0.08)', paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactAvatar: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.header },
  contactAvatarImage: { width: '100%', height: '100%' },
  contactAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  contactBody: { flex: 1, minWidth: 0 },
  contactName: { color: colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  contactDetail: { color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  contactAction: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.09)' },
  contactActionMuted: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.045)' },
});
