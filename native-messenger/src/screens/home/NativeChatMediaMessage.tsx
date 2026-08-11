import { Image, StyleSheet, Text, View } from 'react-native';
import { Paperclip, Volume2 } from 'lucide-react-native';
import { OracleAudioPlayer, OracleVideoPlayer } from '@/screens/features/NativeMediaPlayers';
import type { LocalGalleryItem } from '@/services/localMedia';
import { colors } from '@/theme/colors';
import type { Message } from '@/types/messenger';
import { formatBytes, messagePreview, parseMediaPayload } from './homeUtils';

export function NativeChatMediaMessage({ message, localItem }: { message: Message; localItem?: LocalGalleryItem }) {
  const payload = parseMediaPayload(message.content);
  const sourceUrl = localItem?.uri || payload?.url;
  if (!sourceUrl) {
    return <Text style={styles.bubbleText}>{messagePreview(message)}</Text>;
  }
  const displayName = localItem?.name || payload?.name;
  const displaySize = localItem?.size || payload?.size;
  const displayMime = localItem?.mime || payload?.mime;
  const localBadge = localItem ? 'Local' : 'Serveur';

  if (message.type === 'image') {
    return (
      <View style={styles.chatMediaBox}>
        <Image source={{ uri: sourceUrl }} style={styles.chatImage} resizeMode="cover" />
        <Text numberOfLines={1} style={styles.chatMediaCaption}>{displayName || 'Image'} - {localBadge}</Text>
      </View>
    );
  }

  if (message.type === 'video') {
    return (
      <View style={styles.chatMediaBox}>
        <OracleVideoPlayer sourceUrl={sourceUrl} style={styles.chatVideoPlayer} />
        <Text numberOfLines={1} style={styles.chatMediaCaption}>{displayName || 'Vidéo'} - {formatBytes(displaySize)} - {localBadge}</Text>
      </View>
    );
  }

  if (message.type === 'audio' || message.type === 'voice') {
    return (
      <View style={styles.chatAudioBox}>
        <View style={styles.voiceWave}>
          <Volume2 size={18} color={colors.header} />
          <Text style={styles.voiceText}>{message.type === 'voice' ? 'Message vocal' : displayName || 'Audio'}</Text>
        </View>
        <OracleAudioPlayer sourceUrl={sourceUrl} style={styles.chatAudioPlayer} />
        <Text style={styles.chatMediaCaption}>{formatBytes(displaySize)} - {localBadge}</Text>
      </View>
    );
  }

  return (
    <View style={styles.chatFileBox}>
      <Paperclip size={18} color={colors.header} />
      <View style={styles.chatFileText}>
        <Text numberOfLines={1} style={styles.chatFileName}>{displayName || 'Fichier'}</Text>
        <Text style={styles.chatFileMeta}>{displayMime || message.type} - {formatBytes(displaySize)} - {localBadge}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  chatMediaBox: { width: 238, maxWidth: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(16,42,42,0.06)' },
  chatImage: { width: '100%', height: 260, backgroundColor: '#050505' },
  chatVideoPlayer: { width: '100%', height: 260, backgroundColor: '#050505' },
  chatMediaCaption: { color: colors.muted, fontSize: 11.5, lineHeight: 16, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 8 },
  chatAudioBox: { minWidth: 210, maxWidth: 260, gap: 7 },
  chatAudioPlayer: { width: '100%', height: 116 },
  chatFileBox: { width: 238, maxWidth: '100%', minHeight: 72, borderRadius: 16, backgroundColor: 'rgba(16,42,42,0.06)', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  chatFileText: { flex: 1, minWidth: 0 },
  chatFileName: { color: colors.text, fontSize: 13, fontWeight: '900' },
  chatFileMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  voiceWave: { flex: 1, minHeight: 38, borderRadius: 19, backgroundColor: 'rgba(16,42,42,0.08)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  voiceText: { color: colors.header, fontWeight: '900', fontSize: 13 },
});
