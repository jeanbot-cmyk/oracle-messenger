import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, InteractionManager, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, Eye, MessageCircle, MoreVertical, Phone, Search, Video } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import type { Conversation } from '@/types/messenger';
import { conversationAvatar, conversationName, fastAvatarUri, highQualityImageUri, initials, isOfficialConversation } from './homeUtils';
import { NativePhotoViewer } from './NativePhotoViewer';
import { OfficialVerifiedBadge } from './OfficialVerifiedBadge';
import { ORACLE_APP_ICON, OracleOfficialAvatar } from './OracleOfficialAvatar';

type NativeChatHeaderProps = {
  conversation: Conversation;
  currentUserId?: string | null;
  presenceText: string;
  callNotice?: string;
  messageSearch: string;
  storyAuthors?: Record<string, { hasUnread?: boolean } | undefined>;
  onBack: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onConversationActions: () => void;
  onMessageSearchChange: (value: string) => void;
  onOpenStoryAuthor?: (authorId: string) => void;
  onOpenGroupInfo?: () => void;
};

function VerifiedLabel() {
  return (
    <Text numberOfLines={1} style={styles.chatVerifiedLabel}>
      <Text style={styles.verifiedInitial}>V</Text>
      érifié
    </Text>
  );
}

function AutoScrollingText({ text, style }: { text: string; style: any }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const overflow = Math.max(0, contentWidth - containerWidth);
  const shouldScroll = overflow > 8;
  const duration = useMemo(() => Math.max(2600, Math.min(9000, overflow * 46)), [overflow]);

  useEffect(() => {
    animationRef.current?.stop();
    translateX.setValue(0);
    if (!shouldScroll) return undefined;
    const sequence = Animated.loop(
      Animated.sequence([
        Animated.delay(750),
        Animated.timing(translateX, {
          toValue: -overflow,
          duration,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(900),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(650),
      ]),
    );
    animationRef.current = sequence;
    sequence.start();
    return () => {
      sequence.stop();
      translateX.setValue(0);
    };
  }, [duration, overflow, shouldScroll, translateX, text]);

  return (
    <View
      style={styles.autoScrollViewport}
      onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <Animated.Text
        numberOfLines={1}
        onLayout={event => setContentWidth(event.nativeEvent.layout.width)}
        onTextLayout={event => {
          const lineWidth = event.nativeEvent.lines?.[0]?.width;
          if (lineWidth) setContentWidth(current => Math.max(current, lineWidth));
        }}
        style={[style, styles.autoScrollText, shouldScroll ? { transform: [{ translateX }] } : null]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

export function NativeChatHeader({
  conversation,
  currentUserId,
  presenceText,
  callNotice,
  messageSearch,
  storyAuthors,
  onBack,
  onStartAudioCall,
  onStartVideoCall,
  onConversationActions,
  onMessageSearchChange,
  onOpenStoryAuthor,
  onOpenGroupInfo,
}: NativeChatHeaderProps) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const name = conversationName(conversation);
  const sourceAvatar = conversationAvatar(conversation);
  const avatar = fastAvatarUri(sourceAvatar);
  const previewAvatar = highQualityImageUri(sourceAvatar);
  const official = isOfficialConversation(conversation);
  const isOnline = presenceText === 'En ligne' || presenceText.includes('écrit');
  const storyAuthorId = conversation.type === 'direct'
    ? conversation.participants.find(participant => participant.id && participant.id !== currentUserId)?.id
    : null;
  const storyState = storyAuthorId ? storyAuthors?.[storyAuthorId] : undefined;
  const hasStory = Boolean(storyAuthorId && storyState);
  useEffect(() => {
    if (!avatar) return;
    const task = InteractionManager.runAfterInteractions(() => {
      Image.prefetch(avatar).catch(() => undefined);
    });
    return () => task.cancel();
  }, [avatar]);
  return (
    <>
      <View style={styles.chatTopRow}>
        <Pressable style={styles.backButton} onPress={onBack} accessibilityLabel="Retour">
          <ArrowLeft size={23} color={colors.text} strokeWidth={2.5} />
        </Pressable>
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Agrandir la photo du profil"
          onPress={() => setAvatarOpen(true)}
          android_ripple={{ color: 'rgba(17,27,33,0.08)', borderless: true }}
          style={({ pressed }) => [
            styles.chatAvatarButton,
            hasStory ? (storyState?.hasUnread ? styles.chatAvatarStoryUnread : styles.chatAvatarStorySeen) : null,
            pressed ? styles.chatAvatarPressed : null,
          ]}
        >
          <View style={styles.chatAvatar}>
            {official ? <OracleOfficialAvatar size={42} /> : avatar ? <Image source={{ uri: avatar, cache: 'force-cache' }} style={styles.avatarImage} resizeMode="cover" /> : <Text style={styles.avatarText}>{initials(name)}</Text>}
          </View>
          {official ? null : isOnline ? <View style={styles.presenceDot} /> : null}
        </Pressable>
        <Pressable
          accessibilityRole={onOpenGroupInfo ? 'button' : undefined}
          accessibilityLabel={onOpenGroupInfo ? 'Ouvrir les informations du groupe' : undefined}
          onPress={onOpenGroupInfo}
          disabled={!onOpenGroupInfo}
          style={({ pressed }) => [styles.titleWrap, pressed && onOpenGroupInfo ? styles.titlePressed : null]}
        >
          <View style={styles.chatTitleLine}>
            <Text numberOfLines={1} style={styles.chatTitle}>{name}</Text>
            {official ? <OfficialVerifiedBadge size={21} /> : null}
            {official ? <VerifiedLabel /> : null}
          </View>
          <AutoScrollingText text={official ? 'Compte officiel vérifié' : presenceText} style={styles.chatPresence} />
        </Pressable>
        {official ? null : (
          <View style={styles.callShortcutRow}>
            <Pressable style={styles.callShortcut} onPress={onStartAudioCall}>
              <Phone size={18} color={colors.brand} strokeWidth={2.35} />
            </Pressable>
            <Pressable style={styles.callShortcut} onPress={onStartVideoCall}>
              <Video size={18} color={colors.brand} strokeWidth={2.35} />
            </Pressable>
            <Pressable style={styles.callShortcut} onPress={onConversationActions}>
              <MoreVertical size={18} color={colors.brand} strokeWidth={2.35} />
            </Pressable>
          </View>
        )}
      </View>
      {callNotice ? <Text style={styles.banner}>{callNotice}</Text> : null}
      <View style={styles.messageSearchRow}>
        <Search size={16} color={colors.muted} strokeWidth={1.9} />
        <TextInput
          value={messageSearch}
          onChangeText={onMessageSearchChange}
          placeholder="Rechercher dans la conversation"
          placeholderTextColor={colors.muted}
          style={styles.messageSearchInput}
        />
        {messageSearch ? (
          <Pressable onPress={() => onMessageSearchChange('')} style={styles.messageSearchClear}>
            <Text style={styles.messageSearchClearText}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <NativePhotoViewer
        visible={avatarOpen}
        uri={official ? undefined : previewAvatar}
        source={official ? ORACLE_APP_ICON : undefined}
        title={name}
        fallbackText={initials(name)}
        imageResizeMode="contain"
        onClose={() => setAvatarOpen(false)}
      >
        <View style={styles.avatarPreviewActions}>
          {official ? null : <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ouvrir la conversation"
            style={styles.avatarPreviewAction}
            onPress={() => setAvatarOpen(false)}
          >
            <MessageCircle size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.avatarPreviewActionText}>Message</Text>
          </Pressable>}
          {official ? null : <Pressable
            accessibilityRole="button"
            accessibilityLabel="Relancer un appel audio"
            style={styles.avatarPreviewAction}
            onPress={() => {
              setAvatarOpen(false);
              onStartAudioCall();
            }}
          >
            <Phone size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.avatarPreviewActionText}>Audio</Text>
          </Pressable>}
          {official ? null : <Pressable
            accessibilityRole="button"
            accessibilityLabel="Relancer un appel vidéo"
            style={styles.avatarPreviewAction}
            onPress={() => {
              setAvatarOpen(false);
              onStartVideoCall();
            }}
          >
            <Video size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.avatarPreviewActionText}>Vidéo</Text>
          </Pressable>}
          {!official && storyAuthorId && hasStory ? <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voir le statut"
            style={styles.avatarPreviewAction}
            onPress={() => {
              setAvatarOpen(false);
              onOpenStoryAuthor?.(storyAuthorId);
            }}
          >
            <Eye size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.avatarPreviewActionText}>Voir le statut</Text>
          </Pressable> : null}
        </View>
      </NativePhotoViewer>
    </>
  );
}

const styles = StyleSheet.create({
  chatTopRow: { minHeight: 60, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chatAvatarButton: { width: 48, height: 48, borderRadius: 16, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  chatAvatarStoryUnread: { borderWidth: 2, borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.08)' },
  chatAvatarStorySeen: { borderWidth: 2, borderColor: '#94A3B8', backgroundColor: 'rgba(148,163,184,0.08)' },
  chatAvatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chatAvatarPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  presenceDot: { position: 'absolute', right: 1, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.online, borderWidth: 2.5, borderColor: colors.surface },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontSize: 17, fontWeight: '900' },
  titleWrap: { flex: 1, minWidth: 0 },
  titlePressed: { opacity: 0.78 },
  chatTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chatTitle: { flexShrink: 1, color: colors.title, fontSize: 16, lineHeight: 19, fontWeight: '900' },
  chatVerifiedLabel: { overflow: 'hidden', borderRadius: 10, backgroundColor: '#E7F5FF', color: colors.header, borderWidth: 1, borderColor: 'rgba(17,103,177,0.16)', paddingHorizontal: 6, paddingVertical: 1, fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  verifiedInitial: { color: colors.accent },
  autoScrollViewport: { width: '100%', height: 20, marginTop: 3, overflow: 'hidden', justifyContent: 'center' },
  autoScrollText: { alignSelf: 'flex-start' },
  chatPresence: { color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: '700' },
  callShortcutRow: { flexDirection: 'row', gap: 8 },
  callShortcut: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  banner: { margin: 10, padding: 10, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, fontWeight: '800' },
  messageSearchRow: { marginHorizontal: 10, marginVertical: 7, minHeight: 42, borderRadius: 21, backgroundColor: colors.input, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 8 },
  messageSearchInput: { flex: 1, minHeight: 38, color: colors.text, fontWeight: '700', paddingHorizontal: 0 },
  messageSearchClear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  messageSearchClearText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  avatarPreviewActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  avatarPreviewAction: { minWidth: 112, minHeight: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  avatarPreviewActionText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
});
