import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, Phone, Search, Video } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import type { Conversation } from '@/types/messenger';
import { conversationName, initials } from './homeUtils';

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
  const name = conversationName(conversation);
  const avatar = conversation.type === 'group' ? conversation.avatar : conversation.participants[0]?.avatar || conversation.avatar;
  return (
    <>
      <View style={styles.chatTopRow}>
        <Pressable style={styles.backButton} onPress={onBack} accessibilityLabel="Retour">
          <ArrowLeft size={22} color="#F8FAFC" strokeWidth={2.5} />
        </Pressable>
        <View style={styles.chatAvatar}>
          {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(name)}</Text>}
        </View>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.chatTitle}>{name}</Text>
          <Text numberOfLines={1} style={styles.chatPresence}>{presenceText}</Text>
        </View>
        <View style={styles.callShortcutRow}>
          <Pressable style={styles.callShortcut} onPress={onStartAudioCall}>
            <Phone size={17} color="#F8FAFC" />
          </Pressable>
          <Pressable style={styles.callShortcut} onPress={onStartVideoCall}>
            <Video size={17} color="#F8FAFC" />
          </Pressable>
        </View>
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
    </>
  );
}

const styles = StyleSheet.create({
  chatTopRow: { minHeight: 56, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  backButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chatAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontSize: 17, fontWeight: '900' },
  titleWrap: { flex: 1, minWidth: 0 },
  chatTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 18, fontWeight: '900' },
  chatPresence: { color: 'rgba(255,255,255,0.68)', fontSize: 12, lineHeight: 14, fontWeight: '700', marginTop: 3 },
  callShortcutRow: { flexDirection: 'row', gap: 8 },
  callShortcut: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  banner: { margin: 10, padding: 10, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, fontWeight: '800' },
  messageSearchRow: { marginHorizontal: 10, marginVertical: 7, minHeight: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  messageSearchInput: { flex: 1, minHeight: 38, color: colors.text, fontWeight: '700', paddingHorizontal: 0 },
  messageSearchClear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  messageSearchClearText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
});
