import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, Image as ImageIcon, Mic, Paperclip, Send, Smile, Sparkles } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import { messagePreview } from './homeUtils';

const EMOJI_CATEGORIES = [
  ['😀', '😃', '😄', '😁', '😆', '😂', '🙂', '😉', '😊', '😍', '😘', '😎', '🥳', '😇', '🤔', '🙏'],
  ['❤️', '💚', '💙', '💜', '✨', '🔥', '✅', '⭐', '💡', '📌', '📞', '🎉', '💼', '💳', '📄', '📷'],
  ['👍', '👎', '👏', '🙌', '🤝', '👌', '💪', '👀', '✍️', '🚀', '🎯', '📅', '⏰', '🔒', '🌍', '💬'],
];

type NativeChatComposerProps = {
  draft: string;
  replyTo: Message | null;
  editingMessage: Message | null;
  voiceRecording: boolean;
  voiceStartedAt: number | null;
  busy: boolean;
  aiBusy: boolean;
  onDraftChange: (value: string) => void;
  onClearContext: () => void;
  onCancelVoiceRecording: () => void | Promise<void>;
  onAttachCamera: () => void | Promise<void>;
  onAttachImage: () => void | Promise<void>;
  onAttachDocument: () => void | Promise<void>;
  onToggleVoiceRecording: () => void | Promise<void>;
  onAskAiDraft: () => void | Promise<void>;
  onSend: () => void | Promise<void>;
};

export function NativeChatComposer({
  draft,
  replyTo,
  editingMessage,
  voiceRecording,
  voiceStartedAt,
  busy,
  aiBusy,
  onDraftChange,
  onClearContext,
  onCancelVoiceRecording,
  onAttachCamera,
  onAttachImage,
  onAttachDocument,
  onToggleVoiceRecording,
  onAskAiDraft,
  onSend,
}: NativeChatComposerProps) {
  const contextMessage = editingMessage || replyTo;
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);

  function insertEmoji(emoji: string) {
    onDraftChange(`${draft}${emoji}`);
  }

  return (
    <View style={styles.composerShell}>
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
      {emojiOpen ? (
        <View style={styles.emojiPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiTabs}>
            {EMOJI_CATEGORIES.map((category, index) => (
              <Pressable key={category[0]} onPress={() => setEmojiCategory(index)} style={[styles.emojiTab, emojiCategory === index && styles.emojiTabActive]}>
                <Text style={styles.emojiTabText}>{category[0]}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.emojiGrid}>
            {EMOJI_CATEGORIES[emojiCategory].map(emoji => (
              <Pressable key={emoji} onPress={() => insertEmoji(emoji)} style={styles.emojiButton}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <Pressable style={styles.roundButton} onPress={onAttachDocument} disabled={busy}>
          <Paperclip size={21} color={colors.secondary} />
        </Pressable>
        <Pressable style={styles.roundButton} onPress={onAttachCamera} disabled={busy}>
          <Camera size={20} color={colors.secondary} />
        </Pressable>
        <Pressable style={styles.roundButton} onPress={onAttachImage} disabled={busy}>
          <ImageIcon size={20} color={colors.secondary} />
        </Pressable>
        <View style={styles.inputShell}>
          <TextInput value={draft} onChangeText={onDraftChange} placeholder="Message" placeholderTextColor={colors.muted} multiline style={styles.input} />
          <Pressable accessibilityLabel="Emoji" style={styles.emojiToggle} onPress={() => setEmojiOpen(current => !current)} disabled={busy || voiceRecording}>
            <Smile size={20} color={emojiOpen ? colors.brand : colors.muted} />
          </Pressable>
          <Pressable accessibilityLabel="Gemini IA" style={styles.aiButton} onPress={onAskAiDraft} disabled={busy || aiBusy || voiceRecording}>
            {aiBusy ? <ActivityIndicator size="small" color="#1D9BF0" /> : (
              <>
                <Text style={styles.aiLabel}>IA</Text>
                <Sparkles size={20} color="#1D9BF0" />
              </>
            )}
          </Pressable>
        </View>
        {draft.trim() ? (
          <Pressable style={styles.sendButton} onPress={onSend}>
            <Send size={20} color="#FFFFFF" />
          </Pressable>
        ) : (
          <Pressable style={[styles.sendButton, voiceRecording && styles.recordingButton]} onPress={onToggleVoiceRecording} disabled={busy && !voiceRecording}>
            <Mic size={20} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composerShell: { paddingHorizontal: 8, paddingTop: 5, paddingBottom: 6, backgroundColor: colors.input, borderTopWidth: 1, borderTopColor: '#D7DBDF' },
  emojiPanel: { maxHeight: 164, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 6, overflow: 'hidden' },
  emojiTabs: { paddingHorizontal: 8, paddingVertical: 6, gap: 6 },
  emojiTab: { width: 38, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  emojiTabActive: { backgroundColor: '#EAF4F1' },
  emojiTabText: { fontSize: 18 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 8, gap: 4 },
  emojiButton: { width: '11.9%', aspectRatio: 1, minWidth: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 23 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  composerContext: { width: '100%', minHeight: 48, borderRadius: 16, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  composerContextText: { flex: 1, minWidth: 0 },
  composerContextTitle: { color: colors.header, fontSize: 12, fontWeight: '900' },
  composerContextPreview: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  contextClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.10)' },
  contextCloseText: { color: colors.header, fontSize: 21, lineHeight: 24, fontWeight: '900' },
  voiceRecordingBar: { width: '100%', minHeight: 46, borderRadius: 16, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  voiceRecordingText: { flex: 1, color: colors.danger, fontSize: 12.5, fontWeight: '900' },
  roundButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  inputShell: { flex: 1, minHeight: 42, borderRadius: 23, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  emojiToggle: { width: 34, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  aiButton: { width: 40, height: 42, borderRadius: 14, backgroundColor: 'rgba(29,155,240,0.08)', alignItems: 'center', justifyContent: 'center' },
  aiLabel: { color: colors.text, fontSize: 10, lineHeight: 11, fontWeight: '900' },
  recordingButton: { backgroundColor: colors.danger },
  input: { flex: 1, minWidth: 80, minHeight: 38, maxHeight: 108, color: colors.text, fontSize: 15.5, lineHeight: 20, fontWeight: '500', paddingHorizontal: 0, paddingVertical: 8, textAlignVertical: 'center' },
  sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
});
