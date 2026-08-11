import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { api } from '@/services/api';
import { readLocalGalleryItems, removeLocalGalleryItem, type LocalGalleryItem } from '@/services/localMedia';
import { syncPendingMedia } from '@/services/mediaSync';
import { colors } from '@/theme/colors';
import { AlertText, Loading, SecondaryButton, Section } from './FeatureUi';
import { OracleAudioPlayer, OracleVideoPlayer } from './NativeMediaPlayers';

function statValueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{statValueText(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function GalleryPage({ token, userId }: { token: string; userId: string }) {
  const [items, setItems] = useState<LocalGalleryItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<'all' | LocalGalleryItem['type']>('all');
  const [opened, setOpened] = useState<LocalGalleryItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setNotice('');
    try {
      const pending = await api.pendingMedia(token);
      setPendingCount(pending.length);
      await syncPendingMedia(token, userId, pending);
      setItems(await readLocalGalleryItems());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Galerie média indisponible.');
      setItems(await readLocalGalleryItems().catch(() => []));
    } finally {
      setBusy(false);
    }
  }, [token, userId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = filter === 'all' ? items : items.filter(item => item.type === filter);

  const remove = useCallback(async (item: LocalGalleryItem) => {
    setBusy(true);
    try {
      await removeLocalGalleryItem(item.messageId);
      if (opened?.messageId === item.messageId) setOpened(null);
      setItems(await readLocalGalleryItems());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Suppression locale impossible.');
    } finally {
      setBusy(false);
    }
  }, [opened?.messageId]);

  const share = useCallback(async (item: LocalGalleryItem) => {
    try {
      await Share.share({ title: item.name || 'Oracle Messenger', message: item.uri, url: item.uri });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage média impossible.');
    }
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Galerie médias" right={<SecondaryButton label="Sync" onPress={load} disabled={busy} />}>
        <Text style={styles.pageCopy}>Médias réellement présents dans le stockage local autorisé par Android après téléchargement, vérification et ACK serveur.</Text>
        <Loading active={busy} />
        <AlertText text={notice} />
        <View style={styles.statsGrid}>
          <Stat label="Locaux" value={items.length} />
          <Stat label="En attente" value={pendingCount} />
          <Stat label="Images" value={items.filter(item => item.type === 'image').length} />
          <Stat label="Vidéos" value={items.filter(item => item.type === 'video').length} />
        </View>
        <View style={styles.segment}>
          {(['all', 'image', 'video', 'audio', 'file'] as const).map(item => (
            <Pressable key={item} onPress={() => setFilter(item)} style={[styles.segmentItem, filter === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, filter === item && styles.segmentTextActive]}>{item === 'all' ? 'Tout' : item === 'image' ? 'Photos' : item === 'video' ? 'Vidéos' : item === 'audio' ? 'Audios' : 'Fichiers'}</Text>
            </Pressable>
          ))}
        </View>
        {!filtered.length && !busy ? <Text style={styles.empty}>Aucun média local pour ce filtre.</Text> : null}
      </Section>

      {opened ? (
        <Section title={opened.name || opened.type.toUpperCase()} right={<SecondaryButton label="Fermer" onPress={() => setOpened(null)} />}>
          <GalleryPreview item={opened} />
          <Text style={styles.cardMeta}>{opened.mime || opened.type} • {opened.size ? `${opened.size.toLocaleString('fr-FR')} octets` : 'taille inconnue'} • {new Date(opened.savedAt).toLocaleString('fr-FR')}</Text>
          <View style={styles.actionRow}>
            <SecondaryButton label="Partager" onPress={() => share(opened)} />
            <SecondaryButton label="Supprimer localement" onPress={() => remove(opened)} disabled={busy} />
          </View>
        </Section>
      ) : null}

      <Section title="Bibliothèque locale">
        <View style={styles.galleryGrid}>
          {filtered.map(item => (
            <Pressable key={item.messageId} onPress={() => setOpened(item)} style={styles.galleryTile}>
              <GalleryThumb item={item} />
              <Text numberOfLines={1} style={styles.galleryName}>{item.name || item.type}</Text>
              <Text style={styles.galleryMeta}>{new Date(item.savedAt).toLocaleDateString('fr-FR')}</Text>
            </Pressable>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

function GalleryThumb({ item }: { item: LocalGalleryItem }) {
  if (item.type === 'image') return <Image source={{ uri: item.uri }} style={styles.galleryImage} />;
  return (
    <View style={[styles.galleryIconTile, item.type === 'video' ? styles.galleryVideo : item.type === 'audio' ? styles.galleryAudio : styles.galleryFile]}>
      <Text style={styles.galleryIcon}>{item.type === 'video' ? 'VID' : item.type === 'audio' ? 'AUD' : 'DOC'}</Text>
    </View>
  );
}

function GalleryPreview({ item }: { item: LocalGalleryItem }) {
  if (item.type === 'image') return <Image source={{ uri: item.uri }} style={styles.galleryPreviewImage} resizeMode="contain" />;
  if (item.type === 'video') {
    return (
      <View style={styles.galleryPreviewVideo}>
        <OracleVideoPlayer sourceUrl={item.uri} style={styles.galleryVideoPlayer} />
      </View>
    );
  }
  if (item.type === 'audio') {
    return (
      <View style={styles.galleryPreviewAudio}>
        <Text style={styles.galleryPreviewType}>Audio local</Text>
        <OracleAudioPlayer sourceUrl={item.uri} style={styles.galleryAudioPlayer} />
      </View>
    );
  }
  return (
    <View style={styles.galleryPreviewFile}>
      <Text style={styles.galleryPreviewType}>Fichier local</Text>
      <Text selectable style={styles.linkText}>{item.uri}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, paddingBottom: 96, gap: 12 },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  empty: { color: colors.muted, fontSize: 13, fontWeight: '800', paddingVertical: 10 },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  linkText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', minHeight: 74, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 10, justifyContent: 'center' },
  statValue: { color: colors.header, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 3 },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galleryTile: { width: '31.7%', minWidth: 96, flexGrow: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border },
  galleryImage: { width: '100%', aspectRatio: 1, backgroundColor: '#050505' },
  galleryIconTile: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  galleryVideo: { backgroundColor: '#111827' },
  galleryAudio: { backgroundColor: '#1F2937' },
  galleryFile: { backgroundColor: '#374151' },
  galleryIcon: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  galleryName: { color: colors.text, fontSize: 11.5, fontWeight: '900', paddingHorizontal: 7, paddingTop: 7 },
  galleryMeta: { color: colors.muted, fontSize: 10.5, fontWeight: '800', paddingHorizontal: 7, paddingBottom: 8, paddingTop: 2 },
  galleryPreviewImage: { width: '100%', height: 420, borderRadius: 18, backgroundColor: '#050505' },
  galleryPreviewVideo: { width: '100%', height: 420, borderRadius: 18, overflow: 'hidden', backgroundColor: '#050505' },
  galleryVideoPlayer: { width: '100%', height: 420, backgroundColor: '#050505' },
  galleryPreviewAudio: { minHeight: 180, borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, justifyContent: 'center', padding: 14, gap: 8 },
  galleryAudioPlayer: { width: '100%', height: 132 },
  galleryPreviewFile: { minHeight: 180, borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10 },
  galleryPreviewType: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
});
