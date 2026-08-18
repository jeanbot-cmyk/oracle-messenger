import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AlertCircle, ExternalLink, Image as ImageIcon, Maximize2, Mic2, Paperclip, Pause, Play, Plus, UploadCloud, X } from 'lucide-react-native';
import { OracleAudioPlayer, OracleVideoPlayer } from '@/screens/features/NativeMediaPlayers';
import type { LocalGalleryItem } from '@/services/localMedia';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import { formatBytes, isTechnicalMediaName, normalizeTextLinkUrl, normalizedMediaUri, parseMediaPayload, splitTextLinks, type MediaPayload } from './homeUtils';
import { NativePhotoViewer } from './NativePhotoViewer';

type NativeChatMediaMessageProps = {
  message: Message;
  localItem?: LocalGalleryItem;
  mine?: boolean;
  avatar?: string | null;
  avatarLabel?: string;
  onAddImageToStory?: (message: Message, sourceUrl: string) => void | Promise<void>;
};

type NativeChatMediaAlbumMessageProps = {
  items: { message: Message; localItem?: LocalGalleryItem }[];
  mine?: boolean;
};

type ResolvedMedia = {
  message: Message;
  payload: MediaPayload | null;
  sourceUrl?: string;
  displayName: string;
  visualLabel: string;
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

function openMediaUrl(sourceUrl: string) {
  Linking.openURL(sourceUrl).catch(() => undefined);
}

function isLocalMediaUri(value?: string | null) {
  return Boolean(value && /^(file|content):\/\//i.test(value));
}

function resolveMessageMedia(message: Message, localItem?: LocalGalleryItem, mine = false): ResolvedMedia {
  const payload = parseMediaPayload(message.content);
  const localPayloadUri = mine && isLocalMediaUri(payload?.localUri) ? payload?.localUri : undefined;
  const sourceUrl = normalizedMediaUri(localItem?.uri || localPayloadUri || payload?.url);
  const visualLabel = visualLabelForMessage(message);
  return {
    message,
    payload,
    sourceUrl,
    visualLabel,
    displayName: safeDisplayName(localItem?.name || payload?.name, visualLabel),
  };
}

function openTextUrl(rawUrl: string) {
  Linking.openURL(normalizeTextLinkUrl(rawUrl)).catch(() => undefined);
}

function LinkedCaption({ text, light = false }: { text?: string; light?: boolean }) {
  if (!text) return null;
  const parts = splitTextLinks(text);
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

function visualLabelForMessage(message: Message) {
  if (message.type === 'gif') return 'GIF';
  if (message.type === 'sticker') return 'Sticker';
  if (message.type === 'video') return 'Vidéo';
  if (message.type === 'audio' || message.type === 'voice') return 'Message vocal';
  if (message.type === 'image') return 'Image';
  return 'Fichier';
}

function safeDisplayName(name?: string | null, fallback = 'Fichier') {
  const clean = String(name || '').trim();
  if (!clean || isTechnicalMediaName(clean)) return fallback;
  return clean;
}

function mediaAspectRatio(width?: number, height?: number) {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return Math.max(0.42, Math.min(2.1, width / height));
}

function chatMediaFrame(screenWidth: number, screenHeight: number, width?: number, height?: number) {
  const ratio = mediaAspectRatio(width, height);
  const maxWidth = Math.max(220, Math.min(screenWidth * 0.76, 304));
  const minWidth = Math.min(maxWidth, 214);
  let frameWidth = ratio > 1.24 ? maxWidth : Math.min(maxWidth, 268);
  if (ratio < 0.72) frameWidth = Math.min(maxWidth, 252);
  let frameHeight = frameWidth / ratio;
  const maxHeight = ratio < 0.72 ? screenHeight * 0.54 : screenHeight * 0.4;
  if (frameHeight > maxHeight) {
    frameHeight = maxHeight;
    frameWidth = Math.max(minWidth, frameHeight * ratio);
  }
  const minHeight = ratio > 1.42 ? 132 : 176;
  return {
    width: Math.round(Math.max(minWidth, Math.min(maxWidth, frameWidth))),
    height: Math.round(Math.max(minHeight, frameHeight)),
  };
}

function MediaPlaceholder({ message, payload, mine = false }: { message: Message; payload?: ReturnType<typeof parseMediaPayload>; mine?: boolean }) {
  const label = visualLabelForMessage(message);
  const uploading = payload?.uploadState === 'uploading';
  const failed = payload?.uploadState === 'failed';
  const Icon = failed ? AlertCircle : uploading ? UploadCloud : message.type === 'image' || message.type === 'gif' || message.type === 'sticker' ? ImageIcon : Paperclip;
  const meta = failed
    ? payload?.uploadError || 'Transfert échoué'
    : uploading
      ? uploadLabel(payload.uploadState, payload.uploadProgress) || 'Transfert en cours'
      : 'Pièce jointe indisponible';
  return (
    <View style={[styles.mediaPlaceholder, mine ? styles.mediaPlaceholderMine : styles.mediaPlaceholderOther]}>
      <View style={styles.mediaPlaceholderIcon}>
        <Icon size={21} color={failed ? colors.danger : colors.header} strokeWidth={2.6} />
      </View>
      <View style={styles.mediaPlaceholderText}>
        <Text numberOfLines={1} style={styles.mediaPlaceholderTitle}>{label}</Text>
        <Text numberOfLines={2} style={[styles.mediaPlaceholderMeta, failed ? styles.mediaPlaceholderMetaFailed : null]}>{meta}</Text>
      </View>
    </View>
  );
}

export function NativeChatMediaMessage({ message, localItem, mine = false, avatar, avatarLabel, onAddImageToStory }: NativeChatMediaMessageProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [imageOpen, setImageOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [inlineVideoPaused, setInlineVideoPaused] = useState(true);
  const [viewerVideoPaused, setViewerVideoPaused] = useState(false);
  const { payload, sourceUrl, visualLabel, displayName } = resolveMessageMedia(message, localItem, mine);
  useEffect(() => {
    setInlineVideoPaused(true);
    setViewerVideoPaused(false);
  }, [sourceUrl]);
  if (message.type === 'sticker' && payload?.emoji && !sourceUrl) {
    return (
      <View style={[styles.stickerBox, mine ? styles.stickerMine : styles.stickerOther]}>
        <Text style={styles.stickerEmoji}>{payload.emoji}</Text>
        <Text numberOfLines={1} style={styles.stickerLabel}>{payload.name || 'Sticker'}</Text>
      </View>
    );
  }
  if (!sourceUrl) {
    return <MediaPlaceholder message={message} payload={payload} mine={mine} />;
  }
  const displaySize = localItem?.size || payload?.size;
  const displayMime = localItem?.mime || payload?.mime;
  const caption = payload?.caption;
  const durationLabel = normalizeDuration(payload?.duration);
  const mediaMeta = [displayName, durationLabel, formatBytes(displaySize)].filter(Boolean).join(' - ');
  const uploadOverlay = <MediaUploadOverlay state={payload?.uploadState} progress={payload?.uploadProgress} error={payload?.uploadError} />;
  const imageFrame = chatMediaFrame(screenWidth, screenHeight, payload?.width, payload?.height);
  const videoFrame = chatMediaFrame(screenWidth, screenHeight, payload?.width, payload?.height);

  if (message.type === 'image' || message.type === 'gif' || message.type === 'sticker') {
    const canAddToStory = Boolean(
      mine &&
      onAddImageToStory &&
      message.type !== 'sticker' &&
      !payload?.uploadState,
    );
    return (
      <>
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`Agrandir ${visualLabel.toLowerCase()}`}
          onPress={() => setImageOpen(true)}
          android_ripple={{ color: 'rgba(16,42,42,0.10)' }}
          style={({ pressed }) => [styles.chatMediaBox, { width: imageFrame.width }, pressed ? styles.mediaPressed : null]}
        >
          <Image source={{ uri: normalizedMediaUri(payload?.thumbnail) || sourceUrl }} style={[styles.chatImage, { height: imageFrame.height }]} resizeMode="cover" />
          {uploadOverlay}
          <View style={styles.mediaOpenBadge}>
            <Maximize2 size={14} color="#FFFFFF" strokeWidth={2.8} />
          </View>
          <Text numberOfLines={1} style={styles.chatMediaCaption}>{mediaMeta || visualLabel}</Text>
          <LinkedCaption text={caption} />
        </Pressable>
        <NativePhotoViewer
          visible={imageOpen}
          uri={sourceUrl}
          title={displayName || visualLabel}
          fallbackText={visualLabel.slice(0, 3).toUpperCase()}
          imageResizeMode="contain"
          imageWidth={payload?.width}
          imageHeight={payload?.height}
          onClose={() => setImageOpen(false)}
        >
          {canAddToStory ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ajouter cette image à ma story"
              style={styles.addStoryButton}
              onPress={() => {
                setImageOpen(false);
                void onAddImageToStory?.(message, sourceUrl);
              }}
            >
              <Plus size={18} color="#FFFFFF" strokeWidth={2.8} />
              <Text style={styles.addStoryButtonText}>Ajouter à ma story</Text>
            </Pressable>
          ) : null}
        </NativePhotoViewer>
      </>
    );
  }

  if (message.type === 'video') {
    return (
      <>
        <View style={[styles.chatMediaBox, { width: videoFrame.width }]}>
          <View style={[styles.videoFrame, { height: videoFrame.height }]}>
            <OracleVideoPlayer sourceUrl={sourceUrl} muted paused={inlineVideoPaused} style={styles.chatVideoPlayer} />
            {uploadOverlay}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={inlineVideoPaused ? 'Lire la vidéo' : 'Mettre la vidéo en pause'}
              onPress={() => setInlineVideoPaused(current => !current)}
              style={styles.videoPlayLayer}
            >
              <View style={styles.videoPlayButton}>
                {inlineVideoPaused ? <Play size={30} color="#FFFFFF" fill="#FFFFFF" /> : <Pause size={30} color="#FFFFFF" fill="#FFFFFF" />}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ouvrir la vidéo en plein écran"
              onPress={() => {
                setViewerVideoPaused(false);
                setVideoOpen(true);
              }}
              style={styles.mediaOpenBadge}
            >
              <Maximize2 size={14} color="#FFFFFF" strokeWidth={2.8} />
            </Pressable>
            {durationLabel ? <Text style={styles.durationBadge}>{durationLabel}</Text> : null}
          </View>
          <Text numberOfLines={1} style={styles.chatMediaCaption}>{mediaMeta || 'Vidéo'}</Text>
          <LinkedCaption text={caption} />
        </View>
        <Modal
          visible={videoOpen}
          transparent={false}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => {
            setViewerVideoPaused(true);
            setVideoOpen(false);
          }}
        >
          <View style={styles.videoViewerBackdrop}>
            <SafeAreaView style={styles.videoViewerSafe}>
              <View style={styles.videoViewerHeader}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.05} style={styles.videoViewerTitle}>{displayName || 'Vidéo'}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fermer la vidéo"
                  onPress={() => {
                    setViewerVideoPaused(true);
                    setVideoOpen(false);
                  }}
                  style={styles.videoViewerClose}
                >
                  <X size={22} color="#FFFFFF" strokeWidth={2.4} />
                </Pressable>
              </View>
              <View style={styles.videoViewerStage}>
                <OracleVideoPlayer sourceUrl={sourceUrl} paused={viewerVideoPaused} style={styles.videoViewerPlayer} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={viewerVideoPaused ? 'Lire la vidéo' : 'Mettre la vidéo en pause'}
                  onPress={() => setViewerVideoPaused(current => !current)}
                  style={styles.videoViewerPlayLayer}
                >
                  <View style={styles.videoViewerPlayButton}>
                    {viewerVideoPaused ? <Play size={34} color="#FFFFFF" fill="#FFFFFF" /> : <Pause size={34} color="#FFFFFF" fill="#FFFFFF" />}
                  </View>
                </Pressable>
              </View>
              {caption ? <View style={styles.videoViewerCaption}><LinkedCaption text={caption} light /></View> : null}
            </SafeAreaView>
          </View>
        </Modal>
      </>
    );
  }

  if (message.type === 'audio' || message.type === 'voice') {
    const bars = normalizeWaveform(payload?.waveform, `${message.id}-${displaySize || 0}-${displayName || ''}`);
    const audioMeta = [durationLabel, formatBytes(displaySize)].filter(Boolean).join(' - ');
    return (
      <View style={[styles.chatAudioBox, mine ? styles.chatAudioMine : styles.chatAudioOther]}>
        <View style={styles.audioHeader}>
          <View style={styles.audioAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.audioAvatarImage} resizeMode="cover" /> : <Text style={styles.audioAvatarText}>{avatarLabel || '?'}</Text>}
          </View>
          <View style={styles.audioTitleWrap}>
            <Text numberOfLines={1} style={styles.voiceText}>{message.type === 'voice' ? 'Message vocal' : displayName || 'Audio'}</Text>
            {audioMeta ? <Text numberOfLines={1} style={styles.audioStorageText}>{audioMeta}</Text> : null}
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
        <Text style={styles.chatFileMeta}>{[displayMime || message.type, formatBytes(displaySize)].filter(Boolean).join(' - ')}</Text>
        {payload?.uploadState ? <InlineUploadState state={payload.uploadState} progress={payload.uploadProgress} error={payload.uploadError} /> : null}
        <LinkedCaption text={caption} />
      </View>
      <ExternalLink size={15} color={colors.header} strokeWidth={2.7} />
    </Pressable>
  );
}

export function NativeChatMediaAlbumMessage({ items, mine = false }: NativeChatMediaAlbumMessageProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [albumOpen, setAlbumOpen] = useState(false);
  const albumItems = items
    .map(({ message, localItem }) => resolveMessageMedia(message, localItem, mine))
    .filter((item): item is ResolvedMedia & { sourceUrl: string } => Boolean(item.sourceUrl))
    .sort((left, right) => (left.payload?.albumIndex ?? 0) - (right.payload?.albumIndex ?? 0));
  if (albumItems.length <= 1) {
    const fallback = items[0];
    return fallback ? <NativeChatMediaMessage message={fallback.message} localItem={fallback.localItem} mine={mine} /> : null;
  }

  const albumWidth = Math.round(Math.max(220, Math.min(screenWidth * 0.76, 304)));
  const previewHeight = albumItems.length === 2 ? Math.round(albumWidth * 0.68) : albumWidth;
  const previewItems = albumItems.slice(0, 4);
  const tileGap = 3;
  const tileColumns = previewItems.length === 2 ? 2 : 2;
  const tileRows = previewItems.length <= 2 ? 1 : 2;
  const tileWidth = Math.floor((albumWidth - 6 - tileGap * (tileColumns - 1)) / tileColumns);
  const tileHeight = Math.floor((previewHeight - 6 - tileGap * (tileRows - 1)) / tileRows);
  const remaining = Math.max(0, albumItems.length - previewItems.length);

  return (
    <>
      <View style={[styles.chatMediaBox, { width: albumWidth }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir l'album de ${albumItems.length} médias`}
          onPress={() => setAlbumOpen(true)}
          android_ripple={{ color: 'rgba(255,255,255,0.16)' }}
          style={[styles.albumGrid, { height: previewHeight }]}
        >
          {previewItems.map((item, index) => {
            const isVideo = item.message.type === 'video';
            const thumbnail = normalizedMediaUri(item.payload?.thumbnail) || item.sourceUrl;
            return (
              <View key={item.message.id} style={[styles.albumTile, { width: tileWidth, height: tileHeight }]}>
                {isVideo && !item.payload?.thumbnail ? (
                  <OracleVideoPlayer sourceUrl={item.sourceUrl} muted paused style={styles.albumTileMedia} />
                ) : (
                  <Image source={{ uri: thumbnail }} style={styles.albumTileMedia} resizeMode="cover" />
                )}
                {isVideo ? (
                  <View style={styles.albumVideoBadge}>
                    <Play size={17} color="#FFFFFF" fill="#FFFFFF" />
                  </View>
                ) : null}
                {index === 3 && remaining > 0 ? (
                  <View style={styles.albumMoreOverlay}>
                    <Text style={styles.albumMoreText}>+{remaining}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </Pressable>
        <Text numberOfLines={1} style={styles.chatMediaCaption}>Album - {albumItems.length} médias</Text>
      </View>
      <Modal visible={albumOpen} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => setAlbumOpen(false)}>
        <View style={styles.albumViewerBackdrop}>
          <SafeAreaView style={styles.videoViewerSafe}>
            <View style={styles.videoViewerHeader}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.05} style={styles.videoViewerTitle}>Album - {albumItems.length} médias</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Fermer l'album" onPress={() => setAlbumOpen(false)} style={styles.videoViewerClose}>
                <X size={22} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.albumViewerContent}
              showsVerticalScrollIndicator={false}
              maximumZoomScale={3}
              minimumZoomScale={1}
              bouncesZoom
            >
              {albumItems.map((item, index) => {
                const frame = albumViewerFrame(screenWidth, screenHeight, item.payload?.width, item.payload?.height);
                return (
                  <View key={item.message.id} style={[styles.albumViewerItem, { width: frame.width, height: frame.height }]}>
                    {item.message.type === 'video' ? (
                      <AlbumVideoViewerItem sourceUrl={item.sourceUrl} />
                    ) : (
                      <Image source={{ uri: item.sourceUrl }} style={styles.albumViewerMedia} resizeMode="contain" />
                    )}
                    <Text style={styles.albumViewerCounter}>{index + 1}/{albumItems.length}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function AlbumVideoViewerItem({ sourceUrl }: { sourceUrl: string }) {
  const [paused, setPaused] = useState(true);
  return (
    <View style={styles.albumViewerMedia}>
      <OracleVideoPlayer sourceUrl={sourceUrl} paused={paused} style={styles.albumViewerMedia} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Lire la vidéo' : 'Mettre la vidéo en pause'}
        onPress={() => setPaused(current => !current)}
        style={styles.videoViewerPlayLayer}
      >
        <View style={styles.videoViewerPlayButton}>
          {paused ? <Play size={34} color="#FFFFFF" fill="#FFFFFF" /> : <Pause size={34} color="#FFFFFF" fill="#FFFFFF" />}
        </View>
      </Pressable>
    </View>
  );
}

function albumViewerFrame(screenWidth: number, screenHeight: number, width?: number, height?: number) {
  const ratio = mediaAspectRatio(width, height);
  const maxWidth = Math.max(220, screenWidth - 16);
  const maxHeight = Math.max(260, screenHeight * 0.72);
  let frameWidth = maxWidth;
  let frameHeight = frameWidth / ratio;
  if (ratio < 0.72) {
    frameHeight = maxHeight;
    frameWidth = Math.min(maxWidth, frameHeight * ratio);
  } else if (frameHeight > maxHeight) {
    frameHeight = maxHeight;
    frameWidth = frameHeight * ratio;
  }
  return {
    width: Math.round(Math.max(220, Math.min(maxWidth, frameWidth))),
    height: Math.round(Math.max(240, Math.min(maxHeight, frameHeight))),
  };
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
  mediaPlaceholder: { width: 238, maxWidth: '100%', minHeight: 72, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1 },
  mediaPlaceholderMine: { backgroundColor: 'rgba(255,255,255,0.64)', borderColor: 'rgba(16,42,42,0.08)' },
  mediaPlaceholderOther: { backgroundColor: 'rgba(16,42,42,0.045)', borderColor: 'rgba(16,42,42,0.08)' },
  mediaPlaceholderIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center' },
  mediaPlaceholderText: { flex: 1, minWidth: 0 },
  mediaPlaceholderTitle: { color: colors.header, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
  mediaPlaceholderMeta: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '800', marginTop: 2 },
  mediaPlaceholderMetaFailed: { color: colors.danger },
  stickerBox: { minWidth: 118, maxWidth: 180, minHeight: 106, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  stickerMine: { backgroundColor: 'rgba(255,255,255,0.68)', borderColor: 'rgba(16,42,42,0.08)' },
  stickerOther: { backgroundColor: 'rgba(16,42,42,0.035)', borderColor: 'rgba(16,42,42,0.07)' },
  stickerEmoji: { fontSize: 58, lineHeight: 66 },
  stickerLabel: { color: colors.muted, fontSize: 11.5, lineHeight: 15, fontWeight: '800', marginTop: 4 },
  chatMediaBox: { position: 'relative', width: 238, maxWidth: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(16,42,42,0.06)' },
  mediaPressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
  chatImage: { width: '100%', backgroundColor: '#050505' },
  albumGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 3, padding: 3, backgroundColor: '#050505' },
  albumTile: { position: 'relative', overflow: 'hidden', backgroundColor: '#050505' },
  albumTileMedia: { width: '100%', height: '100%', backgroundColor: '#050505' },
  albumVideoBadge: { position: 'absolute', left: 8, bottom: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(2,6,23,0.62)', alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  albumMoreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.62)', alignItems: 'center', justifyContent: 'center' },
  albumMoreText: { color: '#FFFFFF', fontSize: 30, lineHeight: 36, fontWeight: '900' },
  albumViewerBackdrop: { flex: 1, backgroundColor: '#000000' },
  albumViewerContent: { flexGrow: 1, alignItems: 'center', gap: 14, paddingHorizontal: 8, paddingVertical: 14, paddingBottom: 28 },
  albumViewerItem: { position: 'relative', overflow: 'hidden', borderRadius: 8, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  albumViewerMedia: { width: '100%', height: '100%', backgroundColor: '#000000' },
  albumViewerCounter: { position: 'absolute', left: 10, bottom: 10, overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(2,6,23,0.64)', color: '#FFFFFF', fontSize: 11.5, lineHeight: 15, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4 },
  videoFrame: { position: 'relative', width: '100%', backgroundColor: '#050505', overflow: 'hidden' },
  chatVideoPlayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#050505' },
  videoPlayLayer: { ...StyleSheet.absoluteFillObject, zIndex: 3, alignItems: 'center', justifyContent: 'center' },
  videoPlayButton: { width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(2,6,23,0.62)', alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  mediaOpenBadge: { position: 'absolute', zIndex: 4, top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(2,6,23,0.58)', alignItems: 'center', justifyContent: 'center' },
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
  durationBadge: { position: 'absolute', zIndex: 4, left: 10, bottom: 10, overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(2,6,23,0.64)', color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4 },
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
  videoViewerStage: { position: 'relative', flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  videoViewerPlayer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  videoViewerPlayLayer: { ...StyleSheet.absoluteFillObject, zIndex: 3, alignItems: 'center', justifyContent: 'center' },
  videoViewerPlayButton: { width: 74, height: 74, borderRadius: 37, backgroundColor: 'rgba(2,6,23,0.52)', alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  videoViewerCaption: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.88)' },
  chatAudioBox: { position: 'relative', overflow: 'hidden', width: 270, maxWidth: '100%', borderRadius: 18, gap: 8, padding: 10, borderWidth: 1 },
  chatAudioMine: { backgroundColor: 'rgba(255,255,255,0.64)', borderColor: 'rgba(16,42,42,0.08)' },
  chatAudioOther: { backgroundColor: 'rgba(16,42,42,0.035)', borderColor: 'rgba(16,42,42,0.07)' },
  audioHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  audioAvatar: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  audioAvatarImage: { width: '100%', height: '100%' },
  audioAvatarText: { color: colors.header, fontSize: 12, fontWeight: '900' },
  audioTitleWrap: { flex: 1, minWidth: 0 },
  audioStorageRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  audioStorageText: { color: colors.muted, fontSize: 10.8, fontWeight: '800', marginTop: 2 },
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
  addStoryButton: { minHeight: 46, borderRadius: 23, backgroundColor: 'rgba(37,211,102,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  addStoryButtonText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
});
