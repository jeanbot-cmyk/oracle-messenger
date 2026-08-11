import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Phone, Video } from 'lucide-react-native';
import { colors } from '@/theme/colors';

type NativeChatHeaderProps = {
  presenceText: string;
  callNotice?: string;
  messageSearch: string;
  onBack: () => void;
  onStartAudioCall: () => void;
  onStartVideoCall: () => void;
  onMessageSearchChange: (value: string) => void;
};

export function NativeChatHeader({
  presenceText,
  callNotice,
  messageSearch,
  onBack,
  onStartAudioCall,
  onStartVideoCall,
  onMessageSearchChange,
}: NativeChatHeaderProps) {
  return (
    <>
      <View style={styles.chatTopRow}>
        <Pressable style={styles.backRow} onPress={onBack}>
          <Text style={styles.backText}>Retour aux conversations</Text>
          <Text style={styles.chatPresence}>{presenceText}</Text>
        </Pressable>
        <View style={styles.callShortcutRow}>
          <Pressable style={styles.callShortcut} onPress={onStartAudioCall}>
            <Phone size={18} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.callShortcut} onPress={onStartVideoCall}>
            <Video size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
      {callNotice ? <Text style={styles.banner}>{callNotice}</Text> : null}
      <View style={styles.messageSearchRow}>
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
  chatTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 },
  backRow: { paddingHorizontal: 16, paddingVertical: 12 },
  backText: { color: colors.brand, fontWeight: '900' },
  chatPresence: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 2 },
  callShortcutRow: { flexDirection: 'row', gap: 8 },
  callShortcut: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  banner: { margin: 12, padding: 10, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, fontWeight: '800' },
  messageSearchRow: { marginHorizontal: 12, marginBottom: 8, minHeight: 44, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  messageSearchInput: { flex: 1, minHeight: 42, color: colors.text, fontWeight: '800', paddingHorizontal: 4 },
  messageSearchClear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  messageSearchClearText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
});
