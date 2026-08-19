import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard as RNKeyboard, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Image as ImageIcon, Keyboard as KeyboardIcon, Mic, Paperclip, Search, Send, Smile, Sparkles, Sticker, X } from 'lucide-react-native';
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
const RECENT_EMOJIS = ['❤️', '🥰', '😆', '🫣', '😔', '👍', '😘', '🤭', '😁', '😖', '😄', '🧐'];
const EMOJI_CATEGORY_TITLES = ['Emojis et personnes', 'Gestes', 'Favoris', 'Travail', 'Nourriture', 'Activités', 'Voyages'];
type EmojiMode = 'emoji' | 'gif' | 'sticker';
export type NativeVisualMessageAsset = {
  kind: 'gif' | 'sticker';
  label: string;
  name: string;
  url?: string;
  emoji?: string;
  mime?: string;
  width?: number;
  height?: number;
};
const GIF_LIBRARY: NativeVisualMessageAsset[] = [
  { kind: 'gif', label: 'Bravo', name: 'bravo.gif', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', mime: 'image/gif', width: 480, height: 360 },
  { kind: 'gif', label: 'Merci', name: 'merci.gif', url: 'https://media.giphy.com/media/3oEdva9BUHPIs2SkGk/giphy.gif', mime: 'image/gif', width: 480, height: 360 },
  { kind: 'gif', label: 'Oui', name: 'oui.gif', url: 'https://media.giphy.com/media/GCvktC0KFy9l6/giphy.gif', mime: 'image/gif', width: 480, height: 360 },
  { kind: 'gif', label: 'Salut', name: 'salut.gif', url: 'https://media.giphy.com/media/l0FF56cexcW2JAXCJj/giphy.gif', mime: 'image/gif', width: 480, height: 360 },
  { kind: 'gif', label: 'OK', name: 'ok.gif', url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', mime: 'image/gif', width: 480, height: 360 },
  { kind: 'gif', label: 'Top', name: 'top.gif', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', mime: 'image/gif', width: 480, height: 360 },
];
const STICKER_LIBRARY: NativeVisualMessageAsset[] = [
  { kind: 'sticker', label: 'J’aime', name: 'Sticker j’aime', emoji: '👍' },
  { kind: 'sticker', label: 'Amour', name: 'Sticker amour', emoji: '❤️' },
  { kind: 'sticker', label: 'Rire', name: 'Sticker rire', emoji: '😂' },
  { kind: 'sticker', label: 'Prière', name: 'Sticker prière', emoji: '🙏' },
  { kind: 'sticker', label: 'Feu', name: 'Sticker feu', emoji: '🔥' },
  { kind: 'sticker', label: 'Validé', name: 'Sticker validé', emoji: '✅' },
  { kind: 'sticker', label: 'Triste', name: 'Sticker triste', emoji: '😢' },
  { kind: 'sticker', label: 'Surpris', name: 'Sticker surpris', emoji: '😮' },
];

const MIC_RECORD_START_DELAY_MS = 180;

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
  onSendVisualAsset: (asset: NativeVisualMessageAsset) => void | Promise<void>;
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
  onSendVisualAsset,
  onAskAiDraft,
  onOpenAiTools,
  onSend,
}: NativeChatComposerProps) {
  const contextMessage = editingMessage || replyTo;
  const insets = useSafeAreaInsets();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [emojiMode, setEmojiMode] = useState<EmojiMode>('emoji');
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [, setRecordingTick] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micGestureActiveRef = useRef(false);
  const gestureRecordingStartedRef = useRef(false);
  const gestureLockedRef = useRef(false);
  const gestureLockPendingRef = useRef(false);
  const gestureCancelledRef = useRef(false);
  const gestureReleasePendingRef = useRef(false);
  const gestureStartPromiseRef = useRef<Promise<void> | null>(null);
  const voiceLockedRef = useRef(false);
  const bottomPadding = keyboardVisible ? 8 : Math.max(8, insets.bottom + 6);
  const recordingSeconds = voiceStartedAt ? Math.max(0, Math.floor((Date.now() - voiceStartedAt) / 1000)) : 0;
  const activeEmojiCategory = EMOJI_CATEGORIES[emojiCategory] || EMOJI_CATEGORIES[0];

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
    gestureLockPendingRef.current = false;
    gestureCancelledRef.current = false;
    gestureReleasePendingRef.current = false;
  }, [voiceRecording]);

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  function insertEmoji(emoji: string) {
    selectionHaptic();
    onDraftChange(`${draft}${emoji}`);
  }

  function sendVisualAsset(asset: NativeVisualMessageAsset) {
    selectionHaptic();
    setEmojiOpen(false);
    void onSendVisualAsset(asset);
  }

  function runAttachment(action: () => void | Promise<void>) {
    lightImpactHaptic();
    setAttachmentOpen(false);
    void action();
  }

  const startMicRecordingGesture = useCallback(() => {
    if (!micGestureActiveRef.current || gestureRecordingStartedRef.current || gestureStartPromiseRef.current) return;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    gestureRecordingStartedRef.current = true;
    lightImpactHaptic();
    const startPromise = Promise.resolve(onStartVoiceRecording())
      .then(() => {
        if (gestureCancelledRef.current) {
          gestureRecordingStartedRef.current = false;
          gestureLockPendingRef.current = false;
          void onCancelVoiceRecording();
          return;
        }
        if (gestureLockPendingRef.current && !gestureLockedRef.current && !voiceLockedRef.current) {
          gestureLockPendingRef.current = false;
          gestureLockedRef.current = true;
          lightImpactHaptic();
          onLockVoiceRecording();
          return;
        }
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
  }, [onCancelVoiceRecording, onLockVoiceRecording, onStartVoiceRecording, onStopVoiceRecording]);

  const beginMicGesture = useCallback(() => {
    if (busy || draft.trim() || voicePreview) return;
    if (micGestureActiveRef.current || holdTimerRef.current || gestureRecordingStartedRef.current || gestureStartPromiseRef.current) return;
    micGestureActiveRef.current = true;
    gestureRecordingStartedRef.current = false;
    gestureLockedRef.current = false;
    gestureLockPendingRef.current = false;
    gestureCancelledRef.current = false;
    gestureReleasePendingRef.current = false;
    gestureStartPromiseRef.current = null;
    holdTimerRef.current = setTimeout(startMicRecordingGesture, MIC_RECORD_START_DELAY_MS);
  }, [busy, draft, startMicRecordingGesture, voicePreview]);

  const releaseMicGesture = useCallback(() => {
    micGestureActiveRef.current = false;
    if (gestureCancelledRef.current) return;
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
    if (gestureLockPendingRef.current) {
      gestureLockPendingRef.current = false;
      gestureLockedRef.current = true;
      lightImpactHaptic();
      onLockVoiceRecording();
      return;
    }
    gestureRecordingStartedRef.current = false;
    void onStopVoiceRecording();
  }, [onLockVoiceRecording, onStopVoiceRecording]);

  const terminateMicGesture = useCallback(() => {
    micGestureActiveRef.current = false;
    if (gestureCancelledRef.current) return;
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
      if (gestureLockedRef.current || voiceLockedRef.current || gestureCancelledRef.current) return;
      if (!gestureRecordingStartedRef.current) {
        if (gesture.dy < -34 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 0.9) {
          gestureLockPendingRef.current = true;
          startMicRecordingGesture();
        }
        return;
      }
      if (gesture.dx < -56 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.1) {
        gestureCancelledRef.current = true;
        gestureRecordingStartedRef.current = false;
        gestureLockPendingRef.current = false;
        selectionHaptic();
        void onCancelVoiceRecording();
        return;
      }
      if (gesture.dy < -46 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 0.9) {
        gestureLockPendingRef.current = true;
      }
    },
    onPanResponderRelease: releaseMicGesture,
    onPanResponderTerminate: terminateMicGesture,
  }), [beginMicGesture, busy, draft, onCancelVoiceRecording, releaseMicGesture, startMicRecordingGesture, terminateMicGesture, voicePreview]);

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
            {voiceLocked ? ' - Stop pour écouter' : ' - glissez vers le haut puis relâchez pour verrouiller'}
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
          <View style={styles.emojiGrip} />
          <View style={styles.emojiToolRow}>
            <Pressable style={styles.emojiToolIcon} onPress={() => {
              selectionHaptic();
              setEmojiMode(current => current === 'emoji' ? 'gif' : 'emoji');
            }}>
              <Search size={24} color={colors.text} strokeWidth={2.3} />
            </Pressable>
            <View style={styles.emojiModeSegment}>
              <Pressable onPress={() => setEmojiMode('emoji')} style={[styles.emojiModeButton, emojiMode === 'emoji' && styles.emojiModeButtonActive]}>
                <Smile size={22} color={emojiMode === 'emoji' ? colors.header : colors.muted} strokeWidth={2.4} />
              </Pressable>
              <Pressable onPress={() => setEmojiMode('gif')} style={[styles.emojiModeButton, emojiMode === 'gif' && styles.emojiModeButtonActive]}>
                <Text style={[styles.emojiGifText, emojiMode === 'gif' && styles.emojiGifTextActive]}>GIF</Text>
              </Pressable>
              <Pressable onPress={() => setEmojiMode('sticker')} style={[styles.emojiModeButton, emojiMode === 'sticker' && styles.emojiModeButtonActive]}>
                <Sticker size={22} color={emojiMode === 'sticker' ? colors.header : colors.muted} strokeWidth={2.2} />
              </Pressable>
            </View>
            <Pressable style={styles.emojiToolIcon} onPress={() => {
              selectionHaptic();
              setEmojiOpen(false);
            }}>
              <X size={23} color={colors.text} strokeWidth={2.5} />
            </Pressable>
          </View>
          {emojiMode === 'emoji' ? (
            <>
              <ScrollView style={styles.emojiGridScroll} contentContainerStyle={styles.emojiGrid}>
                <Text style={styles.emojiSectionTitle}>Récents</Text>
                <View style={styles.emojiGridBlock}>
                  {RECENT_EMOJIS.map((emoji, index) => (
                    <Pressable key={`recent-${emoji}-${index}`} onPress={() => insertEmoji(emoji)} style={styles.emojiButton}>
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.emojiSectionTitle}>{EMOJI_CATEGORY_TITLES[emojiCategory] || 'Emojis'}</Text>
                <View style={styles.emojiGridBlock}>
                  {activeEmojiCategory.emojis.map((emoji, index) => (
                    <Pressable key={`${activeEmojiCategory.label}-${emoji}-${index}`} onPress={() => insertEmoji(emoji)} style={styles.emojiButton}>
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.emojiCategoryBar}>
                <Pressable style={[styles.emojiCategoryButton, styles.emojiCategoryButtonActive]}>
                  <KeyboardIcon size={20} color={colors.header} strokeWidth={2.2} />
                </Pressable>
                {EMOJI_CATEGORIES.map((category, index) => (
                  <Pressable key={category.label} onPress={() => {
                    selectionHaptic();
                    setEmojiCategory(index);
                  }} style={[styles.emojiCategoryButton, emojiCategory === index && styles.emojiCategoryButtonActive]}>
                    <Text style={[styles.emojiCategoryText, emojiCategory === index && styles.emojiCategoryTextActive]}>{category.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <ScrollView style={styles.emojiGridScroll} contentContainerStyle={styles.visualAssetGrid}>
              {(emojiMode === 'gif' ? GIF_LIBRARY : STICKER_LIBRARY).map(asset => (
                <Pressable
                  key={`${asset.kind}-${asset.name}`}
                  onPress={() => sendVisualAsset(asset)}
                  style={({ pressed }) => [styles.visualAssetButton, pressed && styles.visualAssetPressed]}
                >
                  {asset.kind === 'gif' && asset.url ? (
                    <Image source={{ uri: asset.url }} style={styles.gifPreview} resizeMode="cover" />
                  ) : (
                    <Text style={styles.stickerPreview}>{asset.emoji}</Text>
                  )}
                  <Text numberOfLines={1} style={styles.visualAssetLabel}>{asset.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
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
              <Text style={styles.aiPanelTitle}>Agent virtuel Oracle</Text>
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
        <Pressable accessibilityLabel={emojiOpen ? 'Fermer les emojis' : 'Emoji'} style={[styles.roundButton, emojiOpen && styles.roundButtonActive]} onPress={() => {
          selectionHaptic();
          setAiMenuOpen(false);
          setAttachmentOpen(false);
          setEmojiOpen(current => {
            if (!current) RNKeyboard.dismiss();
            return !current;
          });
        }} disabled={busy || voiceRecording}>
          {emojiOpen ? <KeyboardIcon size={21} color={colors.brand} /> : <Smile size={21} color={colors.secondary} />}
        </Pressable>
        <View style={styles.inputShell}>
          <TextInput value={draft} onChangeText={onDraftChange} placeholder="Message" placeholderTextColor={colors.muted} multiline style={styles.input} />
          <Pressable accessibilityLabel="Pièce jointe" style={[styles.composerIconButton, attachmentOpen && styles.composerIconButtonActive]} onPress={() => {
            selectionHaptic();
            setAiMenuOpen(false);
            setEmojiOpen(false);
            RNKeyboard.dismiss();
            setAttachmentOpen(current => !current);
          }} disabled={busy}>
            <Paperclip size={20} color={attachmentOpen ? colors.brand : colors.muted} />
          </Pressable>
          <Pressable accessibilityLabel="Caméra" style={styles.composerIconButton} onPress={() => runAttachment(onAttachCamera)} disabled={busy}>
            <Camera size={20} color={colors.muted} />
          </Pressable>
          <Pressable accessibilityLabel="Agent virtuel Oracle" style={[styles.aiButton, aiMenuOpen && styles.aiButtonActive]} onPress={() => {
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
  composerShell: { paddingHorizontal: 8, paddingTop: 7, backgroundColor: '#F0F2F5', borderTopWidth: 1, borderTopColor: 'rgba(16,42,42,0.16)', shadowColor: '#102A2A', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  emojiPanel: { height: 312, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 6, overflow: 'hidden', shadowColor: '#071C1A', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -5 }, elevation: 10 },
  emojiGrip: { alignSelf: 'center', width: 48, height: 5, borderRadius: 3, backgroundColor: 'rgba(7,28,26,0.20)', marginTop: 8, marginBottom: 8 },
  emojiToolRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 10 },
  emojiToolIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  emojiModeSegment: { flex: 1, maxWidth: 252, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  emojiModeButton: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.border },
  emojiModeButtonActive: { backgroundColor: colors.surface, borderLeftWidth: 0 },
  emojiGifText: { color: colors.muted, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  emojiGifTextActive: { color: colors.header },
  emojiGridScroll: { flex: 1 },
  emojiGrid: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 12 },
  emojiSectionTitle: { width: '100%', color: colors.muted, fontSize: 13, lineHeight: 17, fontWeight: '900', marginTop: 8, marginBottom: 7 },
  emojiGridBlock: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  emojiButton: { width: '11.8%', aspectRatio: 1, minWidth: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 25, lineHeight: 30 },
  emojiCategoryBar: { height: 54, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.input, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6 },
  emojiCategoryButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  emojiCategoryButtonActive: { backgroundColor: colors.surface },
  emojiCategoryText: { color: colors.muted, fontSize: 20, lineHeight: 24 },
  emojiCategoryTextActive: { color: colors.header },
  visualAssetGrid: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  visualAssetButton: { width: '30.8%', minHeight: 92, borderRadius: 14, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  visualAssetPressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  gifPreview: { width: '100%', height: 68, backgroundColor: '#0F172A' },
  stickerPreview: { fontSize: 42, lineHeight: 50 },
  visualAssetLabel: { width: '100%', color: colors.text, fontSize: 11.5, lineHeight: 15, fontWeight: '900', textAlign: 'center', paddingHorizontal: 6, paddingVertical: 6 },
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
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
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
  voicePreviewSend: { flex: 1, minHeight: 40, borderRadius: 20, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  voicePreviewSendText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  roundButton: { width: 40, height: 44, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(16,42,42,0.10)', alignItems: 'center', justifyContent: 'center' },
  roundButtonActive: { backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: colors.borderStrong },
  inputShell: { flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: '#FFFFFF', borderWidth: 1.2, borderColor: 'rgba(0,168,132,0.34)', paddingLeft: 13, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 3, shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  composerIconButton: { width: 32, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  composerIconButtonActive: { backgroundColor: colors.accentSoft },
  aiButton: { width: 36, height: 42, borderRadius: 14, backgroundColor: 'rgba(29,155,240,0.08)', alignItems: 'center', justifyContent: 'center' },
  aiButtonActive: { backgroundColor: 'rgba(29,155,240,0.18)', borderWidth: 1, borderColor: 'rgba(29,155,240,0.22)' },
  aiLabel: { color: colors.text, fontSize: 10, lineHeight: 11, fontWeight: '900' },
  recordingButton: { backgroundColor: colors.danger },
  stopVoiceCompactText: { color: '#FFFFFF', fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  input: { flex: 1, minWidth: 128, minHeight: 40, maxHeight: 124, color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '500', paddingHorizontal: 0, paddingVertical: 8, textAlignVertical: 'center' },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOpacity: 0.20, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
});
