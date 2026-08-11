import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { User } from '@/types/messenger';
import { AlertText, Loading, PrimaryButton, SecondaryButton, Section } from './FeatureUi';
import { OracleVideoPlayer } from './NativeMediaPlayers';

type Story = {
  id: string;
  authorId: string;
  content: string;
  caption?: string;
  type: 'text' | 'image' | 'video' | string;
  bg?: string;
  createdAt?: string;
  views?: string[];
  viewCount?: number;
  seen?: boolean;
  author?: User;
  user?: User;
  viewers?: (User & { viewedAt?: string })[];
};

const STORY_BACKGROUNDS = ['#102A2A', '#25D366', '#008069', '#34B7F1', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

async function fileToDataUrl(uri: string, mime = 'image/jpeg') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

export function StoriesPage({ token, userId }: { token: string; userId: string }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [storyType, setStoryType] = useState<'text' | 'image' | 'video'>('text');
  const [imageData, setImageData] = useState('');
  const [bg, setBg] = useState(STORY_BACKGROUNDS[0]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setStories(await api.stories(token));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Stories indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async () => {
    if (storyType === 'text' && !content.trim()) return;
    if ((storyType === 'image' || storyType === 'video') && !imageData) return;
    setBusy(true);
    try {
      await api.createStory(token, {
        content: storyType === 'text' ? content.trim() : imageData,
        caption: storyType === 'image' || storyType === 'video' ? caption.trim() || undefined : undefined,
        type: storyType,
        bg,
      });
      setContent('');
      setCaption('');
      setImageData('');
      setStoryType('text');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Publication story impossible.');
    } finally {
      setBusy(false);
    }
  }, [bg, caption, content, imageData, load, storyType, token]);

  const pickImageStory = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour publier une story image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      base64: true,
      allowsEditing: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    if (!asset.base64) {
      setNotice('Image sélectionnée sans données lisibles.');
      return;
    }
    setImageData(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    setStoryType('image');
    setNotice('');
  }, []);

  const pickVideoStory = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour publier une story video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.78,
      allowsEditing: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setBusy(true);
    setNotice('');
    try {
      const mime = asset.mimeType || 'video/mp4';
      const uploaded = await api.mediaUpload(token, {
        dataUrl: await fileToDataUrl(asset.uri, mime),
        name: asset.fileName || `story-video-${Date.now()}.mp4`,
        mime,
        kind: 'video',
      });
      setImageData(uploaded.url);
      setStoryType('video');
      setNotice('Video prete pour publication.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Preparation video impossible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const openStory = useCallback(async (story: Story) => {
    setSelectedStory(story);
    if (story.authorId === userId || story.seen) return;
    try {
      await api.viewStory(token, story.id);
      setStories(current => current.map(item => item.id === story.id
        ? {
          ...item,
          seen: true,
          views: [...new Set([...(item.views || []), userId])],
          viewCount: Math.max(item.viewCount || 0, (item.views || []).length + 1),
        }
        : item));
    } catch {
      setNotice('La story est ouverte, mais la vue n’a pas pu être confirmée.');
    }
  }, [token, userId]);

  const deleteStory = useCallback(async (story: Story) => {
    if (story.authorId !== userId) return;
    setBusy(true);
    try {
      await api.deleteStory(token, story.id);
      setSelectedStory(current => current?.id === story.id ? null : current);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Suppression story impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, token, userId]);

  const myStories = stories.filter(story => story.authorId === userId);
  const otherStories = stories.filter(story => story.authorId !== userId);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Stories">
        <Text style={styles.pageCopy}>Publiez du texte, une image ou une vidéo. Les vues sont confirmées au serveur, et le propriétaire peut supprimer sa story.</Text>
        <View style={styles.segment}>
          {(['text', 'image', 'video'] as const).map(item => (
            <Pressable key={item} onPress={() => setStoryType(item)} style={[styles.segmentItem, storyType === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, storyType === item && styles.segmentTextActive]}>{item === 'text' ? 'Texte' : item === 'image' ? 'Image' : 'Vidéo'}</Text>
            </Pressable>
          ))}
        </View>
        {storyType === 'text' ? (
          <>
            <View style={styles.colorRow}>
              {STORY_BACKGROUNDS.map(item => (
                <Pressable key={item} onPress={() => setBg(item)} style={[styles.colorDot, { backgroundColor: item }, bg === item && styles.colorDotActive]} />
              ))}
            </View>
            <TextInput value={content} onChangeText={setContent} placeholder="Créer une story texte" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
          </>
        ) : storyType === 'image' ? (
          <>
            <PrimaryButton label={imageData ? 'Changer l’image' : 'Choisir une image'} onPress={pickImageStory} disabled={busy} />
            {imageData ? <Image source={{ uri: imageData }} style={styles.storyPreview} /> : null}
            <TextInput value={caption} onChangeText={setCaption} placeholder="Légende" placeholderTextColor={colors.muted} style={styles.input} />
          </>
        ) : (
          <>
            <PrimaryButton label={imageData ? 'Changer la vidéo' : 'Choisir une vidéo'} onPress={pickVideoStory} disabled={busy} />
            {imageData ? (
              <View style={styles.storyVideoPreview}>
                <OracleVideoPlayer sourceUrl={imageData} muted repeat style={styles.storyVideoPlayer} />
                <Text style={styles.storyVideoPreviewText}>Vidéo prête</Text>
              </View>
            ) : null}
            <TextInput value={caption} onChangeText={setCaption} placeholder="Légende" placeholderTextColor={colors.muted} style={styles.input} />
          </>
        )}
        <PrimaryButton label="Publier" onPress={create} disabled={busy || (storyType === 'text' ? !content.trim() : !imageData)} />
        <Loading active={busy} />
        <AlertText text={notice} />
      </Section>

      {selectedStory ? (
        <Section
          title={selectedStory.authorId === userId ? 'Ma story ouverte' : 'Story ouverte'}
          right={<SecondaryButton label="Fermer" onPress={() => setSelectedStory(null)} />}
        >
          <View style={[styles.storyViewer, { backgroundColor: selectedStory.type === 'text' ? selectedStory.bg || '#102A2A' : '#050505' }]}>
            {selectedStory.type === 'image'
              ? <Image source={{ uri: selectedStory.content }} style={styles.storyViewerImage} resizeMode="contain" />
              : selectedStory.type === 'video'
                ? (
                  <View style={styles.storyVideoViewer}>
                    <OracleVideoPlayer sourceUrl={selectedStory.content} style={styles.storyVideoPlayer} />
                  </View>
                )
              : <Text style={styles.storyViewerText}>{selectedStory.content}</Text>}
          </View>
          {selectedStory.caption ? <Text style={styles.cardText}>{selectedStory.caption}</Text> : null}
          <Text style={styles.cardMeta}>
            {(selectedStory.author?.name || selectedStory.user?.name || 'Story')} • {selectedStory.createdAt ? new Date(selectedStory.createdAt).toLocaleString('fr-FR') : ''} • {selectedStory.viewCount ?? selectedStory.views?.length ?? 0} vue(s)
          </Text>
          {selectedStory.authorId === userId && selectedStory.viewers?.length ? (
            <Text style={styles.cardMeta}>Vu par: {selectedStory.viewers.slice(0, 8).map(viewer => viewer.name || viewer.username || 'Contact').join(', ')}</Text>
          ) : null}
          {selectedStory.authorId === userId ? <SecondaryButton label="Supprimer cette story" onPress={() => deleteStory(selectedStory)} disabled={busy} /> : null}
        </Section>
      ) : null}

      <Section title="Ma story">
        {!myStories.length ? <Text style={styles.empty}>Aucune story active.</Text> : null}
        {myStories.map(story => <StoryRow key={story.id} story={story} userId={userId} onOpen={() => openStory(story)} />)}
      </Section>

      <Section title="Stories récentes">
        {!otherStories.length ? <Text style={styles.empty}>Aucune story de contact.</Text> : null}
        {otherStories.map(story => <StoryRow key={story.id} story={story} userId={userId} onOpen={() => openStory(story)} />)}
      </Section>
    </ScrollView>
  );
}

function StoryRow({ story, userId, onOpen }: { story: Story; userId: string; onOpen: () => void }) {
  const authorName = story.author?.name || story.user?.name || (story.authorId === userId ? 'Moi' : 'Contact');
  const isUnread = story.authorId !== userId && !story.seen && !(story.views || []).includes(userId);
  return (
    <Pressable onPress={onOpen} style={styles.storyRow}>
      <View style={[styles.storyThumb, isUnread && styles.storyThumbUnread, { backgroundColor: story.type === 'text' ? story.bg || '#102A2A' : '#050505' }]}>
        {story.type === 'image'
          ? <Image source={{ uri: story.content }} style={styles.storyThumbImage} />
          : story.type === 'video'
            ? <Text style={styles.storyThumbText}>VIDEO</Text>
          : <Text numberOfLines={3} style={styles.storyThumbText}>{story.content}</Text>}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{authorName}</Text>
        <Text style={styles.rowSub}>{story.authorId === userId ? 'Ma story' : isUnread ? 'Non vue' : 'Vue'} • {story.createdAt ? new Date(story.createdAt).toLocaleString('fr-FR') : ''}</Text>
        {story.caption ? <Text numberOfLines={1} style={styles.cardMeta}>{story.caption}</Text> : null}
      </View>
      <Text style={styles.cardMeta}>{story.viewCount ?? story.views?.length ?? 0} vue(s)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, paddingBottom: 96, gap: 12 },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  empty: { color: colors.muted, fontSize: 13, fontWeight: '800', paddingVertical: 10 },
  cardText: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  colorDotActive: { borderColor: colors.text, transform: [{ scale: 1.08 }] },
  storyPreview: { width: '100%', aspectRatio: 4 / 5, borderRadius: 18, backgroundColor: '#050505' },
  storyVideoPreview: { minHeight: 240, borderRadius: 18, backgroundColor: '#050505', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 },
  storyVideoPlayer: { width: '100%', height: 360, backgroundColor: '#050505' },
  storyVideoPreviewText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  storyViewer: { minHeight: 420, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  storyViewerImage: { width: '100%', height: 420 },
  storyVideoViewer: { width: '100%', minHeight: 420, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  storyViewerText: { color: '#FFFFFF', fontSize: 26, lineHeight: 34, fontWeight: '900', textAlign: 'center', padding: 24 },
  storyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border },
  storyThumb: { width: 58, height: 58, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border },
  storyThumbUnread: { borderColor: colors.brand },
  storyThumbImage: { width: '100%', height: '100%' },
  storyThumbText: { color: '#FFFFFF', fontSize: 9.5, lineHeight: 12, fontWeight: '900', textAlign: 'center', padding: 6 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900' },
  rowSub: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
});
