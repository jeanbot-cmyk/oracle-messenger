import { useState } from 'react';
import { Image, Linking, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, CheckCircle2, Cloud, ExternalLink, Maximize2, Mic2, Paperclip, UploadCloud, X } from 'lucide-react-native';
import { OracleAudioPlayer, OracleVideoPlayer } from '@/screens/features/NativeMediaPlayers';
import type { LocalGalleryItem } from '@/services/localMedia';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import { formatBytes, messagePreview, parseMediaPayload } from './homeUtils';
import { NativePhotoViewer } from './NativePhotoViewer';

type NativeChatMediaMessageProps = {
  message: Message;
  localItem?: LocalGalleryItem;
  mine?: boolean;
  avatar?: string | null;
  avatarLabel?: string;
};

function waveformBars(seedSource: string, count = 30) {
  let seed = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    seed = (seed * 31 + seedSource.charCodeAt(index)) % 9973;
  }
  return Array.from({ length: count }, (_, index) => 8 + ((seed + index * 19 + (index % 6) * 7) % 22));
}

function normalizeDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const total = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function normalizeWaveform(values?: number[], seedSource = '') {
  const source = values?.length ? values.slice(0, 36) : waveformBars(seedSource, 36);
  return source.map(value => Math.max(8, Math.min(30, Math.round((Number(value) / 100) * 30))));
}

function mediaAspectRatio(width?: number, height?: number) {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  return Math.max(0.62, Math.min(1.78, width / height));
}

function openMediaUrl(sourceUrl: string) {
  Linking.openURL(sourceUrl).catch(() => undefined);
}

function isLocalMediaUri(value?: string | null) {
  return Boolean(value && /^(file|content):\/\//i.test(value));
}

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function openTextUrl(rawUrl: string) {
  const cleanUrl = rawUrl.replace(/[.,!?;:)]+$/u, '');
  const normalized = cleanUrl.startsWith('www.') ? `https://${cleanUrl}` : cleanUrl;
  Linking.openURL(normalized).catch(() => undefined);
}

function LinkedCaption({ text, light = false }: { text?: string; light?: boolean }) {
  if (!text) return null;
  const parts: { text: string; link: boolean }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const value = match[0];
    const index = match.index || 0;
    if (index > cursor) parts.push({ text: text.slice(cursor, index), link: false });
    parts.push({ text: value, link: true });
    cursor = index + value.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), link: false });
  return (
    <Text style={[styles.mediaCaptionText, light ? styles.mediaCaptionTextLight : null]}>
      {parts.map((part, index) => part.link ? (
        <Text key={`${part.text}-${index}`} accessibilityRole="link" onPress={() => openTextUrl(part.text)} style={styles.mediaCaptionLink}>
          {part.text}
        </Text>
      ) : (
        <Text key={`${part.text}-${index}`}>{part.text}</Text>
      ))}
    </Text>
  );
}

export function NativeChatMediaMessage({ message, localItem, mine = false, avatar, avatarLabel }: NativeChatMediaMessageProps) {
  const [imageOpen, setImageOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const payload = parseMediaPayload(message.content);
  const localPayloadUri = mine && isLocalMediaUri(payload?.localUri) ? payload?.localUri : undefined;
  const sourceUrl = localItem?.uri || localPayloadUri || payload?.url;
  if (message.type === 'sticker' && payload?.emoji && !sourceUrl) {
    return (
      <View style={[styles.stickerBox, mine ? styles.stickerMine : styles.stickerOther]}>
        <Text style={styles.stickerEmoji}>{payload.emoji}</Text>
        <Text numberOfLines={1} style={styles.stickerLabel}>{payload.name || 'Sticker'}</Text>
      </View>
    );
  }
  if (!sourceUrl) {
    return <Text style={styles.bubbleText}>{messagePreview(message)}</Text>;
  }
  const displayName = localItem?.name || payload?.name;
  const displaySize = localItem?.size || payload?.size;
  const displayMime = localItem?.mime || payload?.mime;
  const localBadge = localItem ? 'Local' : 'Serveur';
  const caption = payload?.caption;
  const durationLabel = normalizeDuration(payload?.duration);
  const aspectRatio = mediaAspectRatio(payload?.width, payload?.height);
  const mediaSizingStyle = aspectRatio ? { aspectRatio } : { height: 260 };
  const mediaMeta = [displayName, durationLabel, formatBytes(displaySize), localBadge].filter(Boolean).join(' - ');
  const uploadOverlay = <MediaUploadOverlay state={payload?.uploadState} progress={payload?.uploadProgress} error={payload?.uploadError} />;

  if (message.type === 'image' || message.type === 'gif' || message.type === 'sticker') {
    const visualLabel = message.type === 'gif' ? 'GIF' : message.type === 'sticker' ? 'Sticker' : 'Image';
    return (
      <>
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`Agrandir ${visualLabel.toLowerCase()}`}
          onPress={() => setImageOpen(true)}
          android_ripple={{ color: 'rgba(16,42,42,0.10)' }}
          style={({ pressed }) => [styles.chatMediaBox, pressed ? styles.mediaPressed : null]}
        >
          <Image source={{ uri: payload?.thumbnail || sourceUrl }} style={[styles.chatImage, mediaSizingStyle]} resizeMode={aspectRatio && aspectRatio > 1.15 ? 'contain' : 'cover'} />
          {uploadOverlay}
          <View style={styles.mediaOpenBadge}>
            <Maximize2 size={14} color="#FFFFFF" strokeWidth={2.8} />
          </View>
          <Text numberOfLines={1} style={styles.chatMediaCaption}>{mediaMeta || `${visualLabel} - ${localBadge}`}</Text>
          <LinkedCaption text={caption} />
        </Pressable>
        <NativePhotoViewer
          visible={imageOpen}
          uri={sourceUrl}
          title={displayName || visualLabel}
          fallbackText={visualLabel.slice(0, 3).toUpperCase()}
          imageResizeMode="contain"
          onClose={() => setImageOpen(false)}
        />
      </>
    );
  }

  if (message.type === 'video') {
    return (
      <>
        <View style={styles.chatMediaBox}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ouvrir la vidéo en plein écran"
            onPress={() => setVideoOpen(true)}
            android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
            style={[styles.videoFrame, mediaSizingStyle]}
          >
            <OracleVideoPlayer sourceUrl={sourceUrl} muted style={[styles.chatVideoPlayer, mediaSizingStyle]} />
            {uploadOverlay}
            <View style={styles.mediaOpenBadge}>
              <Maximize2 size={14} color="#FFFFFF" strokeWidth={2.8} />
            </View>
            {durationLabel ? <Text style={styles.durationBadge}>{durationLabel}</Text> : null}
          </Pressable>
          <Text numberOfLines={1} style={styles.chatMediaCaption}>{mediaMeta || `Vidéo - ${localBadge}`}</Text>
          <LinkedCaption text={caption} />
        </View>
        <Modal visible={videoOpen} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => setVideoOpen(false)}>
          <View style={styles.videoViewerBackdrop}>
            <SafeAreaView style={styles.videoViewerSafe}>
              <View style={styles.videoViewerHeader}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.05} style={styles.videoViewerTitle}>{displayName || 'Vidéo'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Fermer la vidéo" onPress={() => setVideoOpen(false)} style={styles.videoViewerClose}>
                  <X size={22} color="#FFFFFF" strokeWidth={2.4} />
                </Pressable>
              </View>
              <View style={styles.videoViewerStage}>
                <OracleVideoPlayer sourceUrl={sourceUrl} style={styles.videoViewerPlayer} />
              </View>
              {caption ? <View style={styles.videoViewerCaption}><LinkedCaption text={caption} light /></View> : null}
            </SafeAreaView>
          </View>
        </Modal>
      </>
    );
  }

  if (message.type === 'audio' || message.type === 'voice') {
    const StorageIcon = localItem ? CheckCircle2 : Cloud;
    const bars = normalizeWaveform(payload?.waveform, `${message.id}-${displaySize || 0}-${displayName || ''}`);
    const storageLabel = localItem ? 'Téléphone' : 'Serveur';
    return (
      <View style={[styles.chatAudioBox, mine ? styles.chatAudioMine : styles.chatAudioOther]}>
        <View style={styles.audioHeader}>
          <View style={styles.audioAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.audioAvatarImage} /> : <Text style={styles.audioAvatarText}>{avatarLabel || '?'}</Text>}
          </View>
          <View style={styles.audioTitleWrap}>
            <Text numberOfLines={1} style={styles.voiceText}>{message.type === 'voice' ? 'Message vocal' : displayName || 'Audio'}</Text>
            <View style={styles.audioStorageRow}>
              <StorageIcon size={12} color={localItem ? colors.success : colors.muted} strokeWidth={2.6} />
              <Text numberOfLines={1} style={styles.audioStorageText}>{[durationLabel, formatBytes(displaySize), storageLabel].filter(Boolean).join(' - ')}</Text>
            </View>
          </View>
          <View style={styles.audioBadge}>
            <Mic2 size={16} color={colors.header} strokeWidth={2.6} />
          </View>
        </View>
        <View style={styles.waveformRow}>
          {bars.map((height, index) => (
            <View
              key={`${message.id}-wave-${index}`}
              style={[
                styles.waveformBar,
                { height },
                index < 9 ? styles.waveformBarActive : null,
              ]}
            />
          ))}
        </View>
        {uploadOverlay}
        <OracleAudioPlayer sourceUrl={sourceUrl} style={styles.chatAudioPlayer} />
        <LinkedCaption text={caption} />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ouvrir le fichier"
      onPress={() => openMediaUrl(sourceUrl)}
      android_ripple={{ color: 'rgba(16,42,42,0.10)' }}
      style={({ pressed }) => [styles.chatFileBox, pressed ? styles.mediaPressed : null]}
    >
      <Paperclip size={18} color={colors.header} />
      <View style={styles.chatFileText}>
        <Text numberOfLines={1} style={styles.chatFileName}>{displayName || 'Fichier'}</Text>
        <Text style={styles.chatFileMeta}>{displayMime || message.type} - {formatBytes(displaySize)} - {localBadge}</Text>
        {payload?.uploadState ? <InlineUploadState state={payload.uploadState} progress={payload.uploadProgress} error={payload.uploadError} /> : null}
        <LinkedCaption text={caption} />
      </View>
      <ExternalLink size={15} color={colors.header} strokeWidth={2.7} />
    </Pressable>
  );
}

function uploadLabel(state?: string, progress?: number) {
  if (state === 'failed') return 'Échec du transfert';
  if (state === 'uploading') return `Transfert ${Math.max(0, Math.min(100, Math.round(progress || 0)))}%`;
  return '';
}

function MediaUploadOverlay({ state, progress, error }: { state?: string; progress?: number; error?: string }) {
  if (!state || state === 'complete') return null;
  const failed = state === 'failed';
  const clamped = Math.max(0, Math.min(100, Math.round(progress || 0)));
  const Icon = failed ? AlertCircle : UploadCloud;
  return (
    <View pointerEvents="none" style={[styles.uploadOverlay, failed ? styles.uploadOverlayFailed : null]}>
      <Icon size={20} color="#FFFFFF" strokeWidth={2.8} />
      <Text style={styles.uploadOverlayText}>{uploadLabel(state, clamped)}</Text>
      {!failed ? (
        <View style={styles.uploadProgressTrack}>
          <View style={[styles.uploadProgressFill, { width: `${clamped}%` }]} />
        </View>
      ) : (
        <Text numberOfLines={2} style={styles.uploadOverlayHint}>{error || 'Touchez le média et réessayez plus tard.'}</Text>
      )}
    </View>
  );
}

function InlineUploadState({ state, progress, error }: { state?: string; progress?: number; error?: string }) {
  if (!state || state === 'complete') return null;
  const failed = state === 'failed';
  return (
    <View style={styles.inlineUploadState}>
      {failed ? <AlertCircle size={12} color={colors.danger} strokeWidth={2.7} /> : <UploadCloud size={12} color={colors.header} strokeWidth={2.7} />}
      <Text numberOfLines={2} style={[styles.inlineUploadText, failed ? styles.inlineUploadTextFailed : null]}>
        {failed ? (error || 'Transfert échoué') : uploadLabel(state, progress)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  stickerBox: { minWidth: 118, maxWidth: 180, minHeight: 106, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  stickerMine: { backgroundColor: 'rgba(255,255,255,0.68)', borderColor: 'rgba(16,42,42,0.08)' },
  stickerOther: { backgroundColor: 'rgba(16,42,42,0.035)', borderColor: 'rgba(16,42,42,0.07)' },
  stickerEmoji: { fontSize: 58, lineHeight: 66 },
  stickerLabel: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '800', marginTop: 4 },
  chatMediaBox: { position: 'relative', width: 238, maxWidth: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(16,42,42,0.06)' },
  mediaPressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
  chatImage: { width: '100%', backgroundColor: '#050505' },
  videoFrame: { position: 'relative', width: '100%', backgroundColor: '#050505' },
  chatVideoPlayer: { width: '100%', backgroundColor: '#050505' },
  mediaOpenBadge: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(2,6,23,0.58)', alignItems: 'center', justifyContent: 'center' },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 5, backgroundColor: 'rgba(2,6,23,0.56)', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  uploadOverlayFailed: { backgroundColor: 'rgba(127,29,29,0.72)' },
  uploadOverlayText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900', textAlign: 'center' },
  uploadOverlayHint: { color: '#FFE4E6', fontSize: 11.5, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  uploadProgressTrack: { width: '78%', height: 5, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.28)' },
  uploadProgressFill: { height: '100%', borderRadius: 999, backgroundColor: '#FFFFFF' },
  chatMediaCaption: { color: colors.muted, fontSize: 11.5, lineHeight: 16, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 8 },
  mediaCaptionText: { color: colors.text, fontSize: 13.5, lineHeight: 18, fontWeight: '600', paddingHorizontal: 10, paddingBottom: 8 },
  mediaCaptionTextLight: { color: '#FFFFFF', paddingBottom: 0 },
  mediaCaptionLink: { color: '#0F766E', fontWeight: '900', textDecorationLine: 'underline' },
  durationBadge: { position: 'absolute', left: 10, bottom: 10, overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(2,6,23,0.64)', color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4 },
  videoViewerBackdrop: { flex: 1, backgroundColor: '#000000' },
  videoViewerSafe: { flex: 1 },
  videoViewerHeader: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.88)',
  },
  videoViewerTitle: { flex: 1, color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  videoViewerClose: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  videoViewerStage: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  videoViewerPlayer: { width: '100%', height: '100%', backgroundColor: '#000000' },
  videoViewerCaption: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.88)' },
  chatAudioBox: { position: 'relative', overflow: 'hidden', width: 270, maxWidth: '100%', borderRadius: 18, gap: 8, padding: 10, borderWidth: 1 },
  chatAudioMine: { backgroundColor: 'rgba(255,255,255,0.64)', borderColor: 'rgba(16,42,42,0.08)' },
  chatAudioOther: { backgroundColor: 'rgba(16,42,42,0.035)', borderColor: 'rgba(16,42,42,0.07)' },
  audioHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  audioAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  audioAvatarImage: { width: '100%', height: '100%' },
  audioAvatarText: { color: colors.header, fontSize: 12, fontWeight: '900' },
  audioTitleWrap: { flex: 1, minWidth: 0 },
  audioStorageRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  audioStorageText: { color: colors.muted, fontSize: 10.8, fontWeight: '800' },
  audioBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(16,42,42,0.08)', alignItems: 'center', justifyContent: 'center' },
  waveformRow: { minHeight: 34, borderRadius: 17, backgroundColor: 'rgba(16,42,42,0.055)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, overflow: 'hidden' },
  waveformBar: { width: 3, borderRadius: 2, backgroundColor: 'rgba(16,42,42,0.24)' },
  waveformBarActive: { backgroundColor: colors.header },
  chatAudioPlayer: { width: '100%', height: 58 },
  chatFileBox: { width: 238, maxWidth: '100%', minHeight: 72, borderRadius: 16, backgroundColor: 'rgba(16,42,42,0.06)', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  chatFileText: { flex: 1, minWidth: 0 },
  chatFileName: { color: colors.text, fontSize: 13, fontWeight: '900' },
  chatFileMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  inlineUploadState: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  inlineUploadText: { flex: 1, color: colors.header, fontSize: 11.5, lineHeight: 15, fontWeight: '900' },
  inlineUploadTextFailed: { color: colors.danger },
  voiceText: { color: colors.header, fontWeight: '900', fontSize: 13 },
});
