import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, FlatList, Image, InteractionManager, Linking, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Check, CheckCheck, Clock3, Mail, Phone, PhoneMissed, PhoneOff, Reply, UserRound, Video } from 'lucide-react-native';
import { NativeChatMediaAlbumMessage, NativeChatMediaMessage } from './NativeChatMediaMessage';
import { api } from '@/services/api';
import type { LocalGalleryItem } from '@/services/localMedia';
import { useNativeAutoTranslateSettings } from '@/services/nativeAutoTranslate';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import { highQualityImageUri, initials, messagePreview, normalizeTextLinkUrl, parseCallTraceMessage, parseContactPayload, parseMediaPayload, splitTextLinks, type CallTraceMessage } from './homeUtils';

type NativeMessageListProps = {
  conversationId: string;
  token?: string;
  messages: Message[];
  currentUserId?: string | null;
  currentUserName?: string | null;
  currentUserAvatar?: string | null;
  selectedMessageIds: string[];
  localMediaByMessageId: Record<string, LocalGalleryItem>;
  messageSearch: string;
  onToggleSelection: (messageId: string) => void;
  onOpenMessageActions: (message: Message) => void;
  onReplyMessage: (message: Message) => void;
  onLoadOlderMessages: () => void | Promise<void>;
  onCallMessagePress?: (type: 'audio' | 'video', message: Message) => void | Promise<void>;
  onAddImageToStory?: (message: Message, sourceUrl: string) => void | Promise<void>;
};

type AutoTranslatedMessage = { source: string; text: string };

type MessageListRow =
  | { kind: 'message'; id: string; message: Message }
  | { kind: 'album'; id: string; messages: Message[] };

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

function openMessageUrl(rawUrl: string) {
  Linking.openURL(normalizeTextLinkUrl(rawUrl)).catch(() => undefined);
}

function renderLinkedMessageText(content: string) {
  const parts = splitTextLinks(content);
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

function rowCreatedAt(row: MessageListRow) {
  return row.kind === 'album' ? row.messages[0]?.createdAt : row.message.createdAt;
}

function rowPrimaryMessage(row: MessageListRow) {
  return row.kind === 'album' ? row.messages[0] : row.message;
}

function rowStatusMessage(row: MessageListRow) {
  return row.kind === 'album' ? row.messages[row.messages.length - 1] || row.messages[0] : row.message;
}

function albumPayloadForMessage(message: Message) {
  if (message.isDeleted) return null;
  const inferredType = inferMediaTypeFromContent(message);
  if (!['image', 'gif', 'video'].includes(inferredType)) return null;
  const payload = parseMediaPayload(message.content);
  if (!payload?.albumId || (payload.albumCount ?? 0) < 2) return null;
  return payload;
}

function buildMessageRows(items: Message[]): MessageListRow[] {
  const rows: MessageListRow[] = [];
  let index = 0;
  while (index < items.length) {
    const message = items[index];
    const payload = albumPayloadForMessage(message);
    if (!payload) {
      rows.push({ kind: 'message', id: message.id, message });
      index += 1;
      continue;
    }

    const albumMessages = [message];
    let cursor = index + 1;
    while (cursor < items.length) {
      const next = items[cursor];
      const nextPayload = albumPayloadForMessage(next);
      if (!nextPayload || nextPayload.albumId !== payload.albumId || next.senderId !== message.senderId) break;
      albumMessages.push(next);
      cursor += 1;
    }

    if (albumMessages.length > 1) {
      const ordered = albumMessages.sort((left, right) => (albumPayloadForMessage(left)?.albumIndex ?? 0) - (albumPayloadForMessage(right)?.albumIndex ?? 0));
      rows.push({ kind: 'album', id: `album:${payload.albumId}:${ordered[0]?.id || message.id}`, messages: ordered });
    } else {
      rows.push({ kind: 'message', id: message.id, message });
    }
    index = cursor;
  }
  return rows;
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
        {contact.avatar ? <Image source={{ uri: highQualityImageUri(contact.avatar) || contact.avatar, cache: 'force-cache' }} style={styles.contactAvatarImage} resizeMode="cover" /> : <Text style={styles.contactAvatarText}>{initials(name)}</Text>}
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

function MessageSwipeWrap({
  message,
  disabled,
  onReplyMessage,
  children,
}: {
  message: Message;
  disabled: boolean;
  onReplyMessage: (message: Message) => void;
  children: ReactNode;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const replyProgress = translateX.interpolate({
    inputRange: [0, 62],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 6,
    }).start();
  }, [translateX]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      !disabled &&
      gesture.dx > 6 &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.05
    ),
    onMoveShouldSetPanResponderCapture: (_, gesture) => (
      !disabled &&
      gesture.dx > 8 &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.05
    ),
    onPanResponderMove: (_, gesture) => {
      if (disabled) return;
      translateX.setValue(Math.max(0, Math.min(86, gesture.dx * 0.56)));
    },
    onPanResponderRelease: (_, gesture) => {
      const shouldReply = !disabled && gesture.dx > 34 && Math.abs(gesture.dy) < 62;
      resetPosition();
      if (shouldReply) onReplyMessage(message);
    },
    onPanResponderTerminate: resetPosition,
  }), [disabled, message, onReplyMessage, resetPosition, translateX]);

  return (
    <View style={styles.swipeReplyWrap} {...panResponder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.swipeReplyCue,
          {
            opacity: replyProgress,
            transform: [{ scale: replyProgress }],
          },
        ]}
      >
        <Reply size={18} color="#FFFFFF" strokeWidth={2.8} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

export function NativeMessageList({
  conversationId,
  token,
  messages,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  selectedMessageIds,
  localMediaByMessageId,
  messageSearch,
  onToggleSelection,
  onOpenMessageActions,
  onReplyMessage,
  onLoadOlderMessages,
  onCallMessagePress,
  onAddImageToStory,
}: NativeMessageListProps) {
  const listRef = useRef<FlatList<MessageListRow>>(null);
  const translationCacheRef = useRef<Record<string, AutoTranslatedMessage>>({});
  const nearBottomRef = useRef(true);
  const lastAutoScrolledMessageIdRef = useRef<string | null>(null);
  const initialPositioningRef = useRef(true);
  const autoTranslate = useNativeAutoTranslateSettings(currentUserId || 'local');
  const [autoTranslations, setAutoTranslations] = useState<Record<string, AutoTranslatedMessage>>({});
  const inverted = !messageSearch;
  const displayRows = useMemo(() => {
    const rows = buildMessageRows(messages);
    return inverted ? [...rows].reverse() : rows;
  }, [inverted, messages]);
  const lastMessageId = messages[messages.length - 1]?.id;
  const lastMessageSenderId = messages[messages.length - 1]?.senderId;
  const translatableMessages = useMemo(() => messages
    .filter(message => (
      Boolean(token) &&
      autoTranslate.settings.mode === 'enabled' &&
      message.senderId !== currentUserId &&
      message.type === 'text' &&
      !message.isDeleted &&
      message.content.trim().length > 0 &&
      message.content.trim().length <= 1200 &&
      !parseCallTraceMessage(message.content)
    ))
    .slice(-25), [autoTranslate.settings.mode, currentUserId, messages, token]);

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

  useEffect(() => {
    if (!token || autoTranslate.settings.mode !== 'enabled' || !translatableMessages.length) return undefined;
    let cancelled = false;
    const target = autoTranslate.settings.targetLanguage || 'fr';
    const run = async () => {
      for (const message of translatableMessages) {
        if (cancelled) return;
        const cached = translationCacheRef.current[message.id];
        if (cached?.source === message.content) continue;
        translationCacheRef.current[message.id] = { source: message.content, text: '' };
        try {
          const result = await api.aiAutoTranslate(token, message.content, target);
          if (cancelled) return;
          const text = result.translated?.trim() || '';
          translationCacheRef.current[message.id] = { source: message.content, text };
          setAutoTranslations(current => ({ ...current, [message.id]: { source: message.content, text } }));
        } catch {
          delete translationCacheRef.current[message.id];
        }
      }
    };
    const task = InteractionManager.runAfterInteractions(() => {
      void run();
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [autoTranslate.settings.mode, autoTranslate.settings.targetLanguage, token, translatableMessages]);

  return (
    <FlatList
      ref={listRef}
      data={displayRows}
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
        const row = item;
        const message = rowPrimaryMessage(row);
        const statusMessage = rowStatusMessage(row);
        const mine = message.senderId === currentUserId;
        const isAlbum = row.kind === 'album';
        const isVoice = message.type === 'audio' || message.type === 'voice';
        const isSystem = message.type === 'system';
        const callTrace = message.type === 'text' ? parseCallTraceMessage(message.content) : null;
        const avatar = mine ? currentUserAvatar : message.sender?.avatar;
        const avatarLabel = initials(mine ? currentUserName : message.sender?.name);
        const rowSelectableMessages = row.kind === 'album'
          ? row.messages.filter(albumMessage => !albumMessage.isDeleted)
          : [message].filter(candidate => !candidate.isDeleted && candidate.type !== 'system');
        const selectedRowMessages = rowSelectableMessages.filter(candidate => selectedMessageIds.includes(candidate.id));
        const selectedForAction = selectedRowMessages.length > 0;
        const toggleRowSelection = () => {
          if (!rowSelectableMessages.length) return;
          const shouldUnselect = selectedRowMessages.length === rowSelectableMessages.length;
          rowSelectableMessages.forEach(candidate => {
            const alreadySelected = selectedMessageIds.includes(candidate.id);
            if (shouldUnselect ? alreadySelected : !alreadySelected) onToggleSelection(candidate.id);
          });
        };
        const adjacent = inverted ? displayRows[index + 1] : displayRows[index - 1];
        const showDay = !adjacent || formatMessageDay(rowCreatedAt(adjacent)) !== formatMessageDay(rowCreatedAt(row));
        const daySeparator = showDay ? <Text style={styles.daySeparator}>{formatMessageDay(rowCreatedAt(row))}</Text> : null;
        const callClickable = Boolean(callTrace && onCallMessagePress && !selectedMessageIds.length);
        const firstTextLink = message.type === 'text' && inferMediaTypeFromContent(message) === 'text'
          ? splitTextLinks(message.content).find(part => part.link)?.text
          : null;
        const translated = autoTranslate.settings.mode === 'enabled'
          ? autoTranslations[message.id]
          : undefined;
        const translatedText = translated?.source === message.content && translated.text && translated.text !== message.content
          ? translated.text
          : '';
        const linkClickable = Boolean(firstTextLink && !selectedMessageIds.length);
        const swipeReplyDisabled = Boolean(selectedMessageIds.length || isSystem || message.isDeleted);
        const handleBubblePress = () => {
          if (selectedMessageIds.length) {
            toggleRowSelection();
            return;
          }
          if (callTrace && onCallMessagePress) void onCallMessagePress(callTrace.type, message);
          else if (firstTextLink) openMessageUrl(firstTextLink);
        };
        const handleBubbleLongPress = () => {
          if (isSystem || message.isDeleted) return;
          if (!selectedForAction) toggleRowSelection();
          onOpenMessageActions(message);
        };
        return (
          <>
            {inverted ? null : daySeparator}
            <MessageSwipeWrap message={message} disabled={swipeReplyDisabled} onReplyMessage={onReplyMessage}>
              <Pressable
                accessibilityRole={callClickable || linkClickable ? 'button' : undefined}
                accessibilityLabel={callClickable ? callTrace?.actionLabel : linkClickable ? 'Ouvrir le lien du message' : undefined}
                android_ripple={callClickable || linkClickable ? { color: 'rgba(16,42,42,0.08)' } : undefined}
                onPress={selectedMessageIds.length || callClickable || linkClickable ? handleBubblePress : undefined}
                onLongPress={handleBubbleLongPress}
                delayLongPress={260}
                style={({ pressed }) => [
                  styles.bubble,
                  callTrace || isSystem ? styles.systemBubble : mine ? styles.bubbleMine : styles.bubbleOther,
                  isVoice ? styles.audioBubble : null,
                  callTrace ? styles.callBubble : null,
                  pressed && callClickable ? styles.callTracePressed : null,
                  selectedForAction && styles.bubbleSelected,
                ]}
              >
                {selectedForAction ? (
                  <View pointerEvents="none" style={[styles.selectedCheck, mine ? styles.selectedCheckMine : styles.selectedCheckOther]}>
                    <Check size={13} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : null}
                {message.replyTo && !isSystem ? (
                  <View style={styles.replyPreview}>
                    <Text style={styles.replyPreviewTitle}>{message.replyTo.sender?.name || 'Réponse'}</Text>
                    <Text numberOfLines={1} style={styles.replyPreviewText}>{messagePreview(message.replyTo)}</Text>
                  </View>
                ) : null}
                {isSystem ? (
                  <Text style={styles.groupSystemText}>{message.content}</Text>
                ) : isAlbum ? (
                  <NativeChatMediaAlbumMessage
                    items={row.messages.map(albumMessage => ({
                      message: { ...albumMessage, type: inferMediaTypeFromContent(albumMessage) },
                      localItem: localMediaByMessageId[albumMessage.id],
                    }))}
                    mine={mine}
                  />
                ) : isVoice ? (
                  <NativeChatMediaMessage
                    message={message}
                    localItem={localMediaByMessageId[message.id]}
                    mine={mine}
                    avatar={avatar}
                    avatarLabel={avatarLabel}
                    onAddImageToStory={onAddImageToStory}
                  />
                ) : callTrace ? (
                  <NativeCallTraceMessage
                    trace={callTrace}
                    mine={mine}
                    clickable={callClickable}
                    clock={formatMessageClock(message.createdAt)}
                  />
                ) : (
                  message.type === 'contact'
                    ? <NativeContactMessage content={message.content} />
                    : message.type === 'text' && inferMediaTypeFromContent(message) === 'text'
                    ? (
                      <>
                        {renderLinkedMessageText(message.content)}
                        {translatedText ? (
                          <View style={styles.translationBox}>
                            <Text style={styles.translationLabel}>Traduction</Text>
                            <Text style={styles.translationText}>{translatedText}</Text>
                          </View>
                        ) : null}
                      </>
                    )
                    : <NativeChatMediaMessage message={{ ...message, type: inferMediaTypeFromContent(message) }} localItem={localMediaByMessageId[message.id]} mine={mine} onAddImageToStory={onAddImageToStory} />
                )}
                {isSystem ? null : <ReactionBadges reactions={message.reactions} />}
                {callTrace || isSystem ? null : (
                  <View style={styles.metaRow}>
                    <Text numberOfLines={1} style={styles.metaAuthor}>{mine ? 'Moi' : message.sender?.name || 'Contact'}</Text>
                    <Text style={styles.metaText}>{formatMessageClock(statusMessage.createdAt)}</Text>
                    {statusMessage.isEdited ? <Text style={styles.metaText}>modifié</Text> : null}
                    {mine ? (
                      <>
                        <MessageStatusIcon status={statusMessage.status} />
                        <Text style={[styles.metaText, ['read', 'seen'].includes(String(statusMessage.status || '').toLowerCase()) && styles.metaTextRead]}>{messageStatusLabel(statusMessage.status)}</Text>
                      </>
                    ) : null}
                  </View>
                )}
              </Pressable>
            </MessageSwipeWrap>
            {inverted ? daySeparator : null}
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
  bubble: { position: 'relative', maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  audioBubble: { maxWidth: '88%', paddingHorizontal: 6, paddingVertical: 6 },
  callBubble: { minWidth: 226, paddingHorizontal: 7, paddingVertical: 7 },
  systemBubble: { alignSelf: 'center', width: '92%', maxWidth: 342, backgroundColor: 'transparent' },
  groupSystemText: { alignSelf: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(16,42,42,0.08)', color: colors.header, paddingHorizontal: 12, paddingVertical: 7, fontSize: 12.2, lineHeight: 16, fontWeight: '900', textAlign: 'center' },
  bubbleSelected: { borderWidth: 2, borderColor: colors.accent },
  selectedCheck: { position: 'absolute', top: -7, width: 23, height: 23, borderRadius: 12, backgroundColor: colors.brand, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 3 },
  selectedCheckMine: { left: -7 },
  selectedCheckOther: { right: -7 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.bubbleOut },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptySearch: { color: colors.muted, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 30 },
  bubbleText: { color: colors.text, fontSize: 15.5, lineHeight: 20, fontWeight: '500' },
  bubbleLink: { color: '#0F766E', fontWeight: '900', textDecorationLine: 'underline' },
  translationBox: { marginTop: 8, borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 8, gap: 2 },
  translationLabel: { color: colors.header, fontSize: 10.5, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase' },
  translationText: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 5, minHeight: 14 },
  metaAuthor: { flexShrink: 1, color: colors.muted, fontSize: 10.5, fontWeight: '800' },
  metaText: { color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  metaTextRead: { color: colors.readReceipt, fontWeight: '900' },
  replyPreview: { borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 8, marginBottom: 7 },
  replyPreviewTitle: { color: colors.header, fontSize: 11, fontWeight: '900' },
  replyPreviewText: { color: colors.muted, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  reactionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignSelf: 'flex-start', marginTop: 7 },
  swipeReplyWrap: { width: '100%', position: 'relative' },
  swipeReplyCue: { position: 'absolute', left: 16, top: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', zIndex: 0 },
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
  contactAvatar: { width: 42, height: 42, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.header },
  contactAvatarImage: { width: '100%', height: '100%' },
  contactAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  contactBody: { flex: 1, minWidth: 0 },
  contactName: { color: colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  contactDetail: { color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  contactAction: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.09)' },
  contactActionMuted: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.045)' },
});
