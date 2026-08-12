import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Image as ImageIcon, Mic, Paperclip, Send, Smile, Sparkles } from 'lucide-react-native';
import { OracleAudioPlayer } from '@/screens/features/NativeMediaPlayers';
import { lightImpactHaptic, selectionHaptic } from '@/services/haptics';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import type { VoicePreview } from './useNativeVoiceRecorder';
import { formatBytes, messagePreview } from './homeUtils';

const EMOJI_CATEGORIES = [
  { label: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','😤','😡'] },
  { label: '👋', emojis: ['👋','🤚','🖐️','✋','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','👏','🙌','👐','🤲','🤝','🙏','✍️','💪','👀','👁️','👂','👃','🧠','👄','💋'] },
  { label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','✨','⭐','🌟','💫','🔥','💯','✅','☑️','⚠️','❌','⭕','🔒','🔓','📌','📍'] },
  { label: '💼', emojis: ['💼','📄','📑','🧾','💳','💰','💵','🏦','📦','🛒','🧮','📊','📈','📉','📞','☎️','📱','💻','🖥️','⌨️','🖨️','📧','✉️','📨','📅','⏰','⏳','🚚','✅','📋','🖊️','🔎'] },
  { label: '🍎', emojis: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🥭','🍍','🥥','🥝','🍅','🥑','🥦','🥬','🌶️','🥐','🍞','🥚','🍳','🥞','🥩','🍗','🍖','🍔','🍟','🍕','🥪','🌮','🥗','🍝','🍜','🍚','🍰','🎂','☕','🍵','🥤'] },
  { label: '⚽', emojis: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🥋','🏆','🥇','🥈','🥉','🎖️','🎫','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎲','🎯','🎳','🎮'] },
  { label: '🚗', emojis: ['🚗','🚕','🚙','🚌','🚓','🚑','🚒','🚐','🚚','🚛','🏍️','🛵','🚲','✈️','🚀','🛸','🌍','🌎','🌏','🗺️','🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','🏭','⛪','🕌','🌅','🌆','🌃','🎡'] },
];

const MIC_RECORD_START_DELAY_MS = 0;

type NativeChatComposerProps = {
  draft: string;
  replyTo: Message | null;
  editingMessage: Message | null;
  voiceRecording: boolean;
  voiceStartedAt: number | null;
  voiceLocked: boolean;
  voicePreview: VoicePreview | null;
  voiceSending: boolean;
  busy: boolean;
  aiBusy: boolean;
  keyboardVisible?: boolean;
  onDraftChange: (value: string) => void;
  onClearContext: () => void;
  onCancelVoiceRecording: () => void | Promise<void>;
  onAttachCamera: () => void | Promise<void>;
  onAttachImage: () => void | Promise<void>;
  onAttachDocument: () => void | Promise<void>;
  onStartVoiceRecording: () => void | Promise<void>;
  onStopVoiceRecording: () => void | Promise<unknown>;
  onLockVoiceRecording: () => void;
  onSendVoicePreview: () => void | Promise<void>;
  onAskAiDraft: () => void | Promise<void>;
  onOpenAiTools: () => void;
  onSend: () => void | Promise<void>;
};

export function NativeChatComposer({
  draft,
  replyTo,
  editingMessage,
  voiceRecording,
  voiceStartedAt,
  voiceLocked,
  voicePreview,
  voiceSending,
  busy,
  aiBusy,
  keyboardVisible,
  onDraftChange,
  onClearContext,
  onCancelVoiceRecording,
  onAttachCamera,
  onAttachImage,
  onAttachDocument,
  onStartVoiceRecording,
  onStopVoiceRecording,
  onLockVoiceRecording,
  onSendVoicePreview,
  onAskAiDraft,
  onOpenAiTools,
  onSend,
}: NativeChatComposerProps) {
  const contextMessage = editingMessage || replyTo;
  const insets = useSafeAreaInsets();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [, setRecordingTick] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micGestureActiveRef = useRef(false);
  const gestureRecordingStartedRef = useRef(false);
  const gestureLockedRef = useRef(false);
  const gestureReleasePendingRef = useRef(false);
  const gestureStartPromiseRef = useRef<Promise<void> | null>(null);
  const voiceLockedRef = useRef(false);
  const bottomPadding = keyboardVisible ? 8 : Math.max(8, insets.bottom + 6);
  const recordingSeconds = voiceStartedAt ? Math.max(0, Math.floor((Date.now() - voiceStartedAt) / 1000)) : 0;

  useEffect(() => {
    voiceLockedRef.current = voiceLocked;
  }, [voiceLocked]);

  useEffect(() => {
    if (!voiceRecording) return undefined;
    const timer = setInterval(() => setRecordingTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [voiceRecording]);

  useEffect(() => {
    if (voiceRecording) return;
    micGestureActiveRef.current = false;
    gestureRecordingStartedRef.current = false;
    gestureLockedRef.current = false;
    gestureReleasePendingRef.current = false;
  }, [voiceRecording]);

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  function insertEmoji(emoji: string) {
    selectionHaptic();
    onDraftChange(`${draft}${emoji}`);
  }

  function runAttachment(action: () => void | Promise<void>) {
    lightImpactHaptic();
    setAttachmentOpen(false);
    void action();
  }

  const beginMicGesture = useCallback(() => {
    if (busy || draft.trim() || voicePreview) return;
    if (micGestureActiveRef.current || holdTimerRef.current || gestureRecordingStartedRef.current || gestureStartPromiseRef.current) return;
    micGestureActiveRef.current = true;
    gestureRecordingStartedRef.current = false;
    gestureLockedRef.current = false;
    gestureReleasePendingRef.current = false;
    gestureStartPromiseRef.current = null;
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      gestureRecordingStartedRef.current = true;
      lightImpactHaptic();
      const startPromise = Promise.resolve(onStartVoiceRecording())
        .then(() => {
          if (gestureReleasePendingRef.current && !gestureLockedRef.current && !voiceLockedRef.current) {
            gestureReleasePendingRef.current = false;
            gestureRecordingStartedRef.current = false;
            void onStopVoiceRecording();
          }
        })
        .finally(() => {
          gestureStartPromiseRef.current = null;
        });
      gestureStartPromiseRef.current = startPromise;
    }, MIC_RECORD_START_DELAY_MS);
  }, [busy, draft, onStartVoiceRecording, onStopVoiceRecording, voicePreview]);

  const releaseMicGesture = useCallback(() => {
    micGestureActiveRef.current = false;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!gestureRecordingStartedRef.current) return;
    if (gestureLockedRef.current || voiceLockedRef.current) return;
    if (gestureStartPromiseRef.current) {
      gestureReleasePendingRef.current = true;
      return;
    }
    gestureRecordingStartedRef.current = false;
    void onStopVoiceRecording();
  }, [onStopVoiceRecording]);

  const terminateMicGesture = useCallback(() => {
    micGestureActiveRef.current = false;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (gestureRecordingStartedRef.current && !gestureLockedRef.current && !voiceLockedRef.current) {
      if (gestureStartPromiseRef.current) {
        gestureReleasePendingRef.current = true;
        return;
      }
      gestureRecordingStartedRef.current = false;
      void onStopVoiceRecording();
    }
  }, [onStopVoiceRecording]);

  const micPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !busy && !draft.trim() && !voicePreview,
    onMoveShouldSetPanResponder: () => !busy && !draft.trim() && !voicePreview,
    onPanResponderGrant: beginMicGesture,
    onPanResponderMove: (_, gesture) => {
      if (!gestureRecordingStartedRef.current || gestureLockedRef.current || voiceLockedRef.current) return;
      if (gesture.dy < -46) {
        gestureLockedRef.current = true;
        lightImpactHaptic();
        onLockVoiceRecording();
      }
    },
    onPanResponderRelease: releaseMicGesture,
    onPanResponderTerminate: terminateMicGesture,
  }), [beginMicGesture, busy, draft, onLockVoiceRecording, releaseMicGesture, terminateMicGesture, voicePreview]);

  return (
    <View style={[styles.composerShell, { paddingBottom: bottomPadding }]}>
      {contextMessage ? (
        <View style={styles.composerContext}>
          <View style={styles.composerContextText}>
            <Text style={styles.composerContextTitle}>{editingMessage ? 'Modifier le message' : 'Répondre'}</Text>
            <Text numberOfLines={1} style={styles.composerContextPreview}>{messagePreview(contextMessage)}</Text>
          </View>
          <Pressable onPress={() => {
            selectionHaptic();
            onClearContext();
          }} style={styles.contextClose}>
            <Text style={styles.contextCloseText}>×</Text>
          </Pressable>
        </View>
      ) : null}
      {voiceRecording ? (
        <View style={styles.voiceRecordingBar}>
          <View style={styles.recordingDot} />
          <Text style={styles.voiceRecordingText}>
            {voiceLocked ? 'Vocal verrouillé' : 'Maintenez pour parler'}
            {` - ${formatDuration(recordingSeconds)}`}
            {voiceLocked ? ' - Stop pour écouter' : ' - glissez vers le haut pour verrouiller'}
          </Text>
          {voiceLocked ? (
            <Pressable onPress={() => {
              lightImpactHaptic();
              void onStopVoiceRecording();
            }} style={styles.stopVoiceButton}>
              <Text style={styles.stopVoiceText}>Stop</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => {
            selectionHaptic();
            void onCancelVoiceRecording();
          }} style={styles.contextClose}>
            <Text style={styles.contextCloseText}>×</Text>
          </Pressable>
        </View>
      ) : null}
      {voicePreview ? (
        <View style={styles.voicePreviewPanel}>
          <View style={styles.voicePreviewHeader}>
            <View>
              <Text style={styles.voicePreviewTitle}>{voiceSending ? 'Envoi du vocal...' : 'Message vocal prêt'}</Text>
              <Text style={styles.voicePreviewMeta}>{formatDuration(voicePreview.duration)} - {formatBytes(voicePreview.size)}</Text>
            </View>
            <Pressable onPress={() => {
              selectionHaptic();
              void onCancelVoiceRecording();
            }} disabled={voiceSending} style={[styles.contextClose, voiceSending && styles.aiPanelDisabled]}>
              <Text style={styles.contextCloseText}>×</Text>
            </Pressable>
          </View>
          <OracleAudioPlayer sourceUrl={voicePreview.uri} style={styles.voicePreviewPlayer} />
          <View style={styles.voicePreviewActions}>
            <Pressable onPress={() => {
              selectionHaptic();
              void onCancelVoiceRecording();
            }} disabled={voiceSending} style={[styles.voicePreviewSecondary, voiceSending && styles.aiPanelDisabled]}>
              <Text style={styles.voicePreviewSecondaryText}>Supprimer</Text>
            </Pressable>
            <Pressable disabled={busy || voiceSending} onPress={() => {
              lightImpactHaptic();
              void onSendVoicePreview();
            }} style={[styles.voicePreviewSend, (busy || voiceSending) && styles.aiPanelDisabled]}>
              {voiceSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={17} color="#FFFFFF" strokeWidth={2.7} />}
              <Text style={styles.voicePreviewSendText}>{voiceSending ? 'Envoi...' : 'Envoyer'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {emojiOpen ? (
        <View style={styles.emojiPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiTabs}>
            {EMOJI_CATEGORIES.map((category, index) => (
              <Pressable key={category.label} onPress={() => {
                selectionHaptic();
                setEmojiCategory(index);
              }} style={[styles.emojiTab, emojiCategory === index && styles.emojiTabActive]}>
                <Text style={styles.emojiTabText}>{category.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView style={styles.emojiGridScroll} contentContainerStyle={styles.emojiGrid}>
            {EMOJI_CATEGORIES[emojiCategory].emojis.map(emoji => (
              <Pressable key={emoji} onPress={() => insertEmoji(emoji)} style={styles.emojiButton}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {attachmentOpen ? (
        <View style={styles.attachmentPanel}>
          <Pressable disabled={busy} style={styles.attachmentAction} onPress={() => runAttachment(onAttachCamera)}>
            <Camera size={19} color={colors.header} />
            <Text style={styles.attachmentText}>Caméra</Text>
          </Pressable>
          <Pressable disabled={busy} style={styles.attachmentAction} onPress={() => runAttachment(onAttachImage)}>
            <ImageIcon size={19} color={colors.header} />
            <Text style={styles.attachmentText}>Image</Text>
          </Pressable>
          <Pressable disabled={busy} style={styles.attachmentAction} onPress={() => runAttachment(onAttachDocument)}>
            <Paperclip size={19} color={colors.header} />
            <Text style={styles.attachmentText}>Fichier</Text>
          </Pressable>
        </View>
      ) : null}
      {aiMenuOpen ? (
        <View style={styles.aiPanel}>
          <View style={styles.aiPanelHeader}>
            <View style={styles.aiPanelIcon}>
              <Sparkles size={18} color="#FFFFFF" fill="#FFFFFF" />
            </View>
            <View style={styles.aiPanelText}>
              <Text style={styles.aiPanelTitle}>Gemini IA</Text>
              <Text style={styles.aiPanelSub}>Lit le dernier message reçu et prépare un brouillon selon votre limite IA.</Text>
            </View>
          </View>
          <Pressable
            style={[styles.aiPanelPrimary, (busy || aiBusy || voiceRecording) && styles.aiPanelDisabled]}
            disabled={busy || aiBusy || voiceRecording}
            onPress={() => {
              lightImpactHaptic();
              setAiMenuOpen(false);
              void onAskAiDraft();
            }}
          >
            {aiBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.aiPanelPrimaryText}>Répondre avec l’IA</Text>}
          </Pressable>
          <Pressable
            style={styles.aiPanelSecondary}
            onPress={() => {
              selectionHaptic();
              setAiMenuOpen(false);
              onOpenAiTools();
            }}
          >
            <Text style={styles.aiPanelSecondaryText}>Ouvrir Outils / IA pour activer l’auto-réponse</Text>
          </Pressable>
        </View>
      ) : null}
      {!voicePreview ? <View style={styles.inputRow}>
        <Pressable style={[styles.roundButton, attachmentOpen && styles.roundButtonActive]} onPress={() => {
          selectionHaptic();
          setEmojiOpen(false);
          setAiMenuOpen(false);
          setAttachmentOpen(current => !current);
        }} disabled={busy}>
          <Paperclip size={21} color={colors.secondary} />
        </Pressable>
        <View style={styles.inputShell}>
          <TextInput value={draft} onChangeText={onDraftChange} placeholder="Message" placeholderTextColor={colors.muted} multiline style={styles.input} />
          <Pressable accessibilityLabel="Emoji" style={styles.emojiToggle} onPress={() => {
            selectionHaptic();
            setAttachmentOpen(false);
            setAiMenuOpen(false);
            setEmojiOpen(current => !current);
          }} disabled={busy || voiceRecording}>
            <Smile size={20} color={emojiOpen ? colors.brand : colors.muted} />
          </Pressable>
          <Pressable accessibilityLabel="Gemini IA" style={[styles.aiButton, aiMenuOpen && styles.aiButtonActive]} onPress={() => {
            selectionHaptic();
            setAttachmentOpen(false);
            setEmojiOpen(false);
            setAiMenuOpen(current => !current);
          }} disabled={busy || voiceRecording}>
            {aiBusy ? <ActivityIndicator size="small" color="#1D9BF0" /> : (
              <>
                <Text style={styles.aiLabel}>IA</Text>
                <Sparkles size={20} color="#1D9BF0" />
              </>
            )}
          </Pressable>
        </View>
        {draft.trim() ? (
          <Pressable style={styles.sendButton} onPress={() => {
            lightImpactHaptic();
            void onSend();
          }}>
            <Send size={20} color="#FFFFFF" />
          </Pressable>
        ) : voiceRecording && voiceLocked ? (
          <Pressable style={[styles.sendButton, styles.recordingButton]} onPress={() => {
            lightImpactHaptic();
            void onStopVoiceRecording();
          }} disabled={busy}>
            <Text style={styles.stopVoiceCompactText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendButton, voiceRecording && styles.recordingButton]}
            onPress={() => undefined}
            onPressIn={beginMicGesture}
            onPressOut={releaseMicGesture}
            disabled={busy && !voiceRecording}
            {...micPanResponder.panHandlers}
          >
            <Mic size={20} color="#FFFFFF" />
          </Pressable>
        )}
      </View> : null}
    </View>
  );
}

function formatDuration(totalSeconds?: number) {
  const total = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  composerShell: { paddingHorizontal: 7, paddingTop: 5, backgroundColor: colors.input, borderTopWidth: 1, borderTopColor: '#D7DBDF' },
  emojiPanel: { height: 206, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 6, overflow: 'hidden' },
  emojiTabs: { paddingHorizontal: 8, paddingVertical: 6, gap: 6 },
  emojiTab: { width: 38, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  emojiTabActive: { backgroundColor: '#EAF4F1' },
  emojiTabText: { fontSize: 18 },
  emojiGridScroll: { flex: 1 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 10, gap: 4 },
  emojiButton: { width: '11.9%', aspectRatio: 1, minWidth: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 22 },
  attachmentPanel: { marginBottom: 6, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 8, flexDirection: 'row', gap: 8, shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  attachmentAction: { flex: 1, minHeight: 52, borderRadius: 15, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6 },
  attachmentText: { color: colors.header, fontSize: 12, lineHeight: 15, fontWeight: '900' },
  aiPanel: { marginBottom: 6, alignSelf: 'flex-end', width: '100%', maxWidth: 310, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8, shadowColor: '#102A2A', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  aiPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  aiPanelIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
  aiPanelText: { flex: 1, minWidth: 0 },
  aiPanelTitle: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  aiPanelSub: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  aiPanelPrimary: { width: '100%', minHeight: 44, borderRadius: 12, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  aiPanelPrimaryText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  aiPanelSecondary: { width: '100%', minHeight: 40, borderRadius: 12, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  aiPanelSecondaryText: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  aiPanelDisabled: { opacity: 0.62 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  composerContext: { width: '100%', minHeight: 48, borderRadius: 16, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  composerContextText: { flex: 1, minWidth: 0 },
  composerContextTitle: { color: colors.header, fontSize: 12, fontWeight: '900' },
  composerContextPreview: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  contextClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.10)' },
  contextCloseText: { color: colors.header, fontSize: 21, lineHeight: 24, fontWeight: '900' },
  voiceRecordingBar: { width: '100%', minHeight: 46, borderRadius: 16, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  voiceRecordingText: { flex: 1, color: colors.danger, fontSize: 12.5, fontWeight: '900' },
  stopVoiceButton: { minHeight: 30, borderRadius: 15, paddingHorizontal: 12, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  stopVoiceText: { color: '#FFFFFF', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  voicePreviewPanel: { marginBottom: 6, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 8, shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  voicePreviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  voicePreviewTitle: { color: colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  voicePreviewMeta: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '800', marginTop: 2 },
  voicePreviewPlayer: { width: '100%', height: 58 },
  voicePreviewActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voicePreviewSecondary: { flex: 1, minHeight: 40, borderRadius: 14, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  voicePreviewSecondaryText: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  voicePreviewSend: { flex: 1, minHeight: 40, borderRadius: 14, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  voicePreviewSendText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  roundButton: { width: 39, height: 44, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  roundButtonActive: { backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: colors.borderStrong },
  inputShell: { flex: 1, minHeight: 44, borderRadius: 23, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingLeft: 12, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  emojiToggle: { width: 32, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  aiButton: { width: 36, height: 42, borderRadius: 14, backgroundColor: 'rgba(29,155,240,0.08)', alignItems: 'center', justifyContent: 'center' },
  aiButtonActive: { backgroundColor: 'rgba(29,155,240,0.18)', borderWidth: 1, borderColor: 'rgba(29,155,240,0.22)' },
  aiLabel: { color: colors.text, fontSize: 10, lineHeight: 11, fontWeight: '900' },
  recordingButton: { backgroundColor: colors.danger },
  stopVoiceCompactText: { color: '#FFFFFF', fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  input: { flex: 1, minWidth: 128, minHeight: 40, maxHeight: 124, color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '500', paddingHorizontal: 0, paddingVertical: 8, textAlignVertical: 'center' },
  sendButton: { width: 42, height: 44, borderRadius: 21, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
});
