import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image as ImageIcon, Mic, Paperclip, Send } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import { messagePreview } from './homeUtils';

type NativeChatComposerProps = {
  draft: string;
  replyTo: Message | null;
  editingMessage: Message | null;
  voiceRecording: boolean;
  voiceStartedAt: number | null;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onClearContext: () => void;
  onCancelVoiceRecording: () => void | Promise<void>;
  onAttachImage: () => void | Promise<void>;
  onAttachDocument: () => void | Promise<void>;
  onToggleVoiceRecording: () => void | Promise<void>;
  onSend: () => void | Promise<void>;
};

export function NativeChatComposer({
  draft,
  replyTo,
  editingMessage,
  voiceRecording,
  voiceStartedAt,
  busy,
  onDraftChange,
  onClearContext,
  onCancelVoiceRecording,
  onAttachImage,
  onAttachDocument,
  onToggleVoiceRecording,
  onSend,
}: NativeChatComposerProps) {
  const contextMessage = editingMessage || replyTo;

  return (
    <View style={styles.inputRow}>
      {contextMessage ? (
        <View style={styles.composerContext}>
          <View style={styles.composerContextText}>
            <Text style={styles.composerContextTitle}>{editingMessage ? 'Modifier le message' : 'Répondre'}</Text>
            <Text numberOfLines={1} style={styles.composerContextPreview}>{messagePreview(contextMessage)}</Text>
          </View>
          <Pressable onPress={onClearContext} style={styles.contextClose}>
            <Text style={styles.contextCloseText}>×</Text>
          </Pressable>
        </View>
      ) : null}
      {voiceRecording ? (
        <View style={styles.voiceRecordingBar}>
          <View style={styles.recordingDot} />
          <Text style={styles.voiceRecordingText}>
            Enregistrement vocal{voiceStartedAt ? ` - ${Math.max(0, Math.floor((Date.now() - voiceStartedAt) / 1000))}s` : ''}
          </Text>
          <Pressable onPress={onCancelVoiceRecording} style={styles.contextClose}>
            <Text style={styles.contextCloseText}>×</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable style={styles.attachButton} onPress={onAttachImage} disabled={busy}>
        <ImageIcon size={19} color={colors.header} />
      </Pressable>
      <Pressable style={styles.attachButton} onPress={onAttachDocument} disabled={busy}>
        <Paperclip size={19} color={colors.header} />
      </Pressable>
      <Pressable style={[styles.attachButton, voiceRecording && styles.recordingButton]} onPress={onToggleVoiceRecording} disabled={busy && !voiceRecording}>
        <Mic size={19} color={voiceRecording ? '#FFFFFF' : colors.header} />
      </Pressable>
      <TextInput value={draft} onChangeText={onDraftChange} placeholder="Message" placeholderTextColor={colors.muted} style={styles.input} />
      <Pressable style={styles.sendButton} onPress={onSend}>
        <Send size={20} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  composerContext: { width: '100%', minHeight: 48, borderRadius: 16, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  composerContextText: { flex: 1, minWidth: 0 },
  composerContextTitle: { color: colors.header, fontSize: 12, fontWeight: '900' },
  composerContextPreview: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  contextClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.10)' },
  contextCloseText: { color: colors.header, fontSize: 21, lineHeight: 24, fontWeight: '900' },
  voiceRecordingBar: { width: '100%', minHeight: 46, borderRadius: 16, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  voiceRecordingText: { flex: 1, color: colors.danger, fontSize: 12.5, fontWeight: '900' },
  attachButton: { width: 44, height: 46, borderRadius: 16, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center' },
  recordingButton: { backgroundColor: colors.danger },
  input: { flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: colors.input, paddingHorizontal: 14, color: colors.text, fontWeight: '700' },
  sendButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
