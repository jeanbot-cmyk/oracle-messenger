import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, Phone, Search, Video } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import type { Conversation } from '@/types/messenger';
import { conversationAvatar, conversationName, highQualityImageUri, initials, isOfficialConversation } from './homeUtils';
import { NativePhotoViewer } from './NativePhotoViewer';
import { OracleOfficialAvatar } from './OracleOfficialAvatar';

type NativeChatHeaderProps = {
  conversation: Conversation;
  presenceText: string;
  callNotice?: string;
  messageSearch: string;
  onBack: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onMessageSearchChange: (value: string) => void;
};

export function NativeChatHeader({
  conversation,
  presenceText,
  callNotice,
  messageSearch,
  onBack,
  onStartAudioCall,
  onStartVideoCall,
  onMessageSearchChange,
}: NativeChatHeaderProps) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const name = conversationName(conversation);
  const avatar = highQualityImageUri(conversationAvatar(conversation));
  const official = isOfficialConversation(conversation);
  const isOnline = presenceText === 'En ligne' || presenceText.includes('écrit');
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
          style={({ pressed }) => [styles.chatAvatarButton, pressed ? styles.chatAvatarPressed : null]}
        >
          <View style={styles.chatAvatar}>
            {official ? <OracleOfficialAvatar size={42} /> : avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(name)}</Text>}
          </View>
          {official ? <View style={styles.verifiedDot}><Text style={styles.verifiedText}>✓</Text></View> : isOnline ? <View style={styles.presenceDot} /> : null}
        </Pressable>
        <View style={styles.titleWrap}>
          <View style={styles.chatTitleLine}>
            <Text numberOfLines={1} style={styles.chatTitle}>{name}</Text>
            {official ? <Text numberOfLines={1} style={styles.chatVerifiedLabel}>Vérifié</Text> : null}
          </View>
          <Text numberOfLines={1} style={styles.chatPresence}>{official ? 'Compte officiel vérifié' : presenceText}</Text>
        </View>
        {official ? null : (
          <View style={styles.callShortcutRow}>
            <Pressable style={styles.callShortcut} onPress={onStartAudioCall}>
              <Phone size={18} color={colors.brand} strokeWidth={2.35} />
            </Pressable>
            <Pressable style={styles.callShortcut} onPress={onStartVideoCall}>
              <Video size={18} color={colors.brand} strokeWidth={2.35} />
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
        uri={official ? undefined : avatar}
        title={name}
        fallbackText={initials(name)}
        onClose={() => setAvatarOpen(false)}
      >
        <View style={styles.avatarPreviewActions}>
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
        </View>
      </NativePhotoViewer>
    </>
  );
}

const styles = StyleSheet.create({
  chatTopRow: { minHeight: 60, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chatAvatarButton: { width: 42, height: 42, position: 'relative' },
  chatAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chatAvatarPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  presenceDot: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.online, borderWidth: 2.5, borderColor: colors.surface },
  verifiedDot: { position: 'absolute', right: -1, bottom: -1, width: 15, height: 15, borderRadius: 8, backgroundColor: '#38BDF8', borderWidth: 2.5, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  verifiedText: { color: '#FFFFFF', fontSize: 8.5, lineHeight: 10, fontWeight: '900' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontSize: 17, fontWeight: '900' },
  titleWrap: { flex: 1, minWidth: 0 },
  chatTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chatTitle: { flexShrink: 1, color: colors.text, fontSize: 16, lineHeight: 19, fontWeight: '900' },
  chatVerifiedLabel: { overflow: 'hidden', borderRadius: 10, backgroundColor: '#E0F2FE', color: '#2563EB', paddingHorizontal: 6, paddingVertical: 1, fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  chatPresence: { color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: '700', marginTop: 3 },
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
