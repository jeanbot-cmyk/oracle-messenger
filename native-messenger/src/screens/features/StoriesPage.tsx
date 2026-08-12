import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, Image as ImageIcon, Pause, Plus, Trash2, Video, X } from 'lucide-react-native';
import { highQualityImageUri } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { User } from '@/types/messenger';
import { AlertText, Loading, PrimaryButton, SecondaryButton } from './FeatureUi';
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

type AuthorRow = {
  authorId: string;
  authorStories: Story[];
  latest: Story;
  firstUnread: Story;
  hasUnread: boolean;
};

const STORY_BACKGROUNDS = ['#102A2A', '#25D366', '#008069', '#34B7F1', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
const STORY_DURATION_MS = 5000;
const STORY_TICK_MS = 50;

function basenameFromUri(uri: string, fallback: string) {
  const clean = String(uri || '').split('?')[0]?.split('#')[0] || '';
  const last = clean.split('/').filter(Boolean).pop();
  return last || fallback;
}

function timeAgo(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatClock(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatViewedAt(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function initials(name?: string | null) {
  return String(name || '?').trim().slice(0, 1).toUpperCase();
}

function storyAuthorName(story?: Story | null, userId?: string) {
  if (!story) return '';
  if (story.authorId === userId) return 'Moi';
  return story.author?.name || story.user?.name || 'Contact';
}

function storyAuthorAvatar(story?: Story | null) {
  const avatar = story?.author?.avatar || story?.user?.avatar || null;
  return highQualityImageUri(avatar) || avatar;
}

function storySeen(story: Story, userId: string) {
  return story.authorId !== userId && Boolean(story.seen || (story.views || []).includes(userId));
}

function storyViewCount(story: Story) {
  return story.viewCount ?? story.views?.length ?? 0;
}

export function StoriesPage({ token, userId, initialMode, onBack }: { token: string; userId: string; initialMode?: 'camera'; onBack?: () => void }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [viewersStory, setViewersStory] = useState<Story | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [storyType, setStoryType] = useState<'text' | 'image' | 'video'>('text');
  const [imageData, setImageData] = useState('');
  const [bg, setBg] = useState(STORY_BACKGROUNDS[0]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewerProgress, setViewerProgress] = useState(0);
  const [viewerPaused, setViewerPaused] = useState(false);
  const initialCameraOpenedRef = useRef(false);
  const pausedRef = useRef(false);
  const holdStartedAtRef = useRef(0);
  const elapsedRef = useRef(0);

  const load = useCallback(async (background = false) => {
    if (!background) setBusy(true);
    try {
      setStories(await api.stories(token));
      setNotice('');
    } catch (error) {
      if (!background) setNotice(error instanceof Error ? error.message : 'Stories indisponibles.');
    } finally {
      if (!background) setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void load(true);
    }, 20_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load(true);
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [load]);

  const grouped = useMemo(() => {
    const byAuthor = stories.reduce<Record<string, Story[]>>((acc, story) => {
      if (!acc[story.authorId]) acc[story.authorId] = [];
      acc[story.authorId].push(story);
      return acc;
    }, {});
    Object.values(byAuthor).forEach(list => {
      list.sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime());
    });
    const myStories = byAuthor[userId] || [];
    const rows = Object.keys(byAuthor)
      .filter(authorId => authorId !== userId)
      .map<AuthorRow>(authorId => {
        const authorStories = byAuthor[authorId];
        const latest = authorStories[authorStories.length - 1];
        const firstUnread = authorStories.find(story => !storySeen(story, userId)) || latest;
        const hasUnread = authorStories.some(story => !storySeen(story, userId));
        return { authorId, authorStories, latest, firstUnread, hasUnread };
      })
      .sort((left, right) => new Date(right.latest.createdAt || 0).getTime() - new Date(left.latest.createdAt || 0).getTime());

    return {
      byAuthor,
      myStories,
      latestMyStory: myStories[myStories.length - 1] || null,
      authorRows: rows,
      recentRows: rows.filter(row => row.hasUnread),
      viewedRows: rows.filter(row => !row.hasUnread),
    };
  }, [stories, userId]);

  const selectedStoryId = selectedStory?.id || '';
  const activeStory = selectedStoryId ? stories.find(story => story.id === selectedStoryId) || selectedStory : null;
  const activeAuthorStories = activeStory ? grouped.byAuthor[activeStory.authorId] || [] : [];
  const activeStoryIndex = activeStory ? activeAuthorStories.findIndex(story => story.id === activeStory.id) : -1;

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
      setCreatorOpen(false);
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
      quality: 0.68,
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
    setCreatorOpen(true);
    setNotice('');
  }, []);

  const takePhotoStory = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission caméra requise pour publier une story photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.68,
      base64: true,
      allowsEditing: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    if (!asset.base64) {
      setNotice('Photo capturée sans données lisibles.');
      return;
    }
    setImageData(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    setStoryType('image');
    setCreatorOpen(true);
    setNotice('');
  }, []);

  useEffect(() => {
    if (initialMode !== 'camera' || initialCameraOpenedRef.current) return;
    initialCameraOpenedRef.current = true;
    setStoryType('image');
    setCreatorOpen(true);
    void takePhotoStory();
  }, [initialMode, takePhotoStory]);

  const pickVideoStory = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour publier une story vidéo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.66,
      allowsEditing: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setBusy(true);
    setNotice('');
    try {
      const mime = asset.mimeType || 'video/mp4';
      const uploaded = await api.mediaUploadFile(token, {
        uri: asset.uri,
        name: asset.fileName || basenameFromUri(asset.uri, `story-video-${Date.now()}.mp4`),
        mime,
        kind: 'video',
      });
      setImageData(uploaded.url);
      setStoryType('video');
      setCreatorOpen(true);
      setNotice('Vidéo prête pour publication.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Préparation vidéo impossible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const openStory = useCallback(async (story: Story) => {
    setSelectedStory(story);
    if (story.authorId === userId || storySeen(story, userId)) return;
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

  const nextStoryAfter = useCallback((story: Story | null) => {
    if (!story) return null;
    const authorStories = grouped.byAuthor[story.authorId] || [];
    const index = authorStories.findIndex(item => item.id === story.id);
    if (index >= 0 && index < authorStories.length - 1) return authorStories[index + 1];
    const rowIndex = grouped.authorRows.findIndex(row => row.authorId === story.authorId);
    if (rowIndex >= 0 && rowIndex < grouped.authorRows.length - 1) return grouped.authorRows[rowIndex + 1].firstUnread;
    if (story.authorId !== userId && grouped.myStories.length) return grouped.myStories[grouped.myStories.length - 1];
    return null;
  }, [grouped.authorRows, grouped.byAuthor, grouped.myStories, userId]);

  const previousStoryBefore = useCallback((story: Story | null) => {
    if (!story) return null;
    const authorStories = grouped.byAuthor[story.authorId] || [];
    const index = authorStories.findIndex(item => item.id === story.id);
    if (index > 0) return authorStories[index - 1];
    const rowIndex = grouped.authorRows.findIndex(row => row.authorId === story.authorId);
    if (rowIndex > 0) {
      const previousAuthorStories = grouped.authorRows[rowIndex - 1].authorStories;
      return previousAuthorStories[previousAuthorStories.length - 1] || null;
    }
    return null;
  }, [grouped.authorRows, grouped.byAuthor]);

  const openAdjacentStory = useCallback((direction: 'prev' | 'next') => {
    const target = direction === 'next' ? nextStoryAfter(activeStory) : previousStoryBefore(activeStory);
    if (target) {
      void openStory(target);
      return;
    }
    if (direction === 'next') setSelectedStory(null);
    else setViewerProgress(0);
  }, [activeStory, nextStoryAfter, openStory, previousStoryBefore]);

  useEffect(() => {
    if (!activeStory) {
      setViewerProgress(0);
      return;
    }
    setViewerProgress(0);
    elapsedRef.current = 0;
    pausedRef.current = false;
    setViewerPaused(false);
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      elapsedRef.current += STORY_TICK_MS;
      const progress = Math.min(100, (elapsedRef.current / STORY_DURATION_MS) * 100);
      setViewerProgress(progress);
      if (progress >= 100) {
        clearInterval(timer);
        const target = nextStoryAfter(activeStory);
        if (target) void openStory(target);
        else setSelectedStory(null);
      }
    }, STORY_TICK_MS);
    return () => clearInterval(timer);
  }, [activeStory, nextStoryAfter, openStory]);

  const pauseStory = useCallback(() => {
    holdStartedAtRef.current = Date.now();
    pausedRef.current = true;
    setViewerPaused(true);
  }, []);

  const resumeStory = useCallback(() => {
    pausedRef.current = false;
    setViewerPaused(false);
  }, []);

  const handleStoryTap = useCallback((side: 'left' | 'right') => {
    if (Date.now() - holdStartedAtRef.current > 220) return;
    openAdjacentStory(side === 'left' ? 'prev' : 'next');
  }, [openAdjacentStory]);

  const deleteStory = useCallback(async (story: Story) => {
    if (story.authorId !== userId) return;
    setBusy(true);
    try {
      await api.deleteStory(token, story.id);
      setSelectedStory(current => current?.id === story.id ? null : current);
      setViewersStory(current => current?.id === story.id ? null : current);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Suppression story impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, token, userId]);

  const activeStoriesCount = stories.length;
  const totalMyStoryViews = grouped.myStories.reduce((total, story) => total + storyViewCount(story), 0);

  return (
    <>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
        <View style={styles.storyHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour aux discussions"
            onPress={onBack}
            disabled={!onBack}
            style={[styles.storyBackButton, !onBack && styles.disabledBackButton]}
          >
            <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
          <View style={styles.storyHeaderCopy}>
            <Text maxFontSizeMultiplier={1.06} style={styles.storyHeaderTitle}>Stories</Text>
            <Text maxFontSizeMultiplier={1.06} style={styles.storyHeaderSubtitle}>
              {activeStoriesCount ? `${activeStoriesCount} mise${activeStoriesCount > 1 ? 's' : ''} à jour active${activeStoriesCount > 1 ? 's' : ''}` : 'Publiez une photo ou un texte pendant 24h'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Créer une story"
            onPress={() => setCreatorOpen(true)}
            disabled={busy}
            style={({ pressed }) => [styles.headerCreateButton, pressed && styles.headerCreatePressed, busy && styles.disabledBackButton]}
          >
            <Text style={styles.headerCreateText}>+ Créer</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>MA STORY</Text>
        <View style={styles.myStorySection}>
          <Pressable
            onPress={() => grouped.latestMyStory ? void openStory(grouped.latestMyStory) : setCreatorOpen(true)}
            style={({ pressed }) => [styles.myStoryCard, pressed && styles.myStoryCardPressed]}
          >
            <View style={styles.myStoryThumbWrap}>
              <StoryThumb story={grouped.latestMyStory} userId={userId} large />
              <Pressable onPress={() => setCreatorOpen(true)} style={styles.addBadge}>
                <Plus size={17} color="#FFFFFF" strokeWidth={3} />
              </Pressable>
            </View>
            <View style={styles.myStoryText}>
              <Text style={styles.myStoryTitle}>Ajouter à ma story</Text>
              <Text style={styles.myStorySub}>
                {grouped.latestMyStory ? `${grouped.myStories.length} story active · ${timeAgo(grouped.latestMyStory.createdAt)}` : 'Photo, texte ou annonce visible pendant 24h.'}
              </Text>
              {grouped.latestMyStory ? (
                <Pressable onPress={() => setViewersStory(grouped.latestMyStory)} style={styles.viewsPill}>
                  <Eye size={14} color={colors.header} strokeWidth={2.4} />
                  <Text style={styles.viewsPillText}>Qui a vu · {totalMyStoryViews}</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
          <AlertText text={notice} />
          <Loading active={busy} />
        </View>

        <StoryRowsSection title="Récentes" rows={grouped.recentRows} userId={userId} onOpen={openStory} />
        <StoryRowsSection title="Déjà vues" rows={grouped.viewedRows} userId={userId} onOpen={openStory} />

        {!stories.length ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <ImageIcon size={36} color={colors.header} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>Aucune story</Text>
            <Text style={styles.emptyCopy}>Créez votre première story. Elle reste visible 24h.</Text>
            <Pressable onPress={() => setCreatorOpen(true)} disabled={busy} style={({ pressed }) => [styles.emptyCreateButton, pressed && styles.emptyCreatePressed, busy && styles.disabledBackButton]}>
              <Text style={styles.emptyCreateText}>Créer une story</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <StoryViewer
        story={activeStory}
        authorStories={activeAuthorStories}
        storyIndex={activeStoryIndex}
        progress={viewerProgress}
        paused={viewerPaused}
        userId={userId}
        onClose={() => setSelectedStory(null)}
        onPause={pauseStory}
        onResume={resumeStory}
        onTap={handleStoryTap}
        onShowViewers={setViewersStory}
        onDelete={deleteStory}
      />

      <CreatorSheet
        visible={creatorOpen}
        busy={busy}
        storyType={storyType}
        content={content}
        caption={caption}
        bg={bg}
        imageData={imageData}
        onClose={() => setCreatorOpen(false)}
        onStoryTypeChange={setStoryType}
        onContentChange={setContent}
        onCaptionChange={setCaption}
        onBgChange={setBg}
        onPickImage={pickImageStory}
        onTakePhoto={takePhotoStory}
        onPickVideo={pickVideoStory}
        onPublish={create}
      />

      <ViewersSheet story={viewersStory} onClose={() => setViewersStory(null)} />
    </>
  );
}

function StoryRowsSection({ title, rows, userId, onOpen }: { title: string; rows: AuthorRow[]; userId: string; onOpen: (story: Story) => void }) {
  if (!rows.length) return null;
  return (
    <View style={styles.rowsSection}>
      <Text style={styles.sectionLabel}>{title.toUpperCase()}</Text>
      <View style={styles.rowsCard}>
      {rows.map(row => (
        <Pressable key={row.authorId} onPress={() => onOpen(row.firstUnread)} style={styles.authorRow}>
          <View style={[styles.authorRing, row.hasUnread ? styles.authorRingUnread : styles.authorRingSeen]}>
            <StoryThumb story={row.latest} userId={userId} />
          </View>
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={styles.rowTitle}>{storyAuthorName(row.latest, userId)}</Text>
            <Text style={styles.rowSub}>{row.authorStories.length} story{row.authorStories.length > 1 ? 's' : ''} · {row.hasUnread ? 'Non vue' : 'Vue'} · {timeAgo(row.latest.createdAt)}</Text>
          </View>
          <View style={[styles.statusDot, row.hasUnread ? styles.statusDotUnread : null]} />
        </Pressable>
      ))}
      </View>
    </View>
  );
}

function StoryThumb({ story, userId, large = false }: { story?: Story | null; userId: string; large?: boolean }) {
  if (!story) {
    return (
      <View style={[large ? styles.storyThumbLarge : styles.storyThumb, styles.storyThumbEmpty]}>
        <Plus size={large ? 30 : 22} color={colors.header} strokeWidth={2.4} />
      </View>
    );
  }
  return (
    <View style={[large ? styles.storyThumbLarge : styles.storyThumb, { backgroundColor: story.type === 'text' ? story.bg || colors.header : '#050505' }]}>
      {story.type === 'image'
        ? <Image source={{ uri: story.content }} style={styles.storyThumbImage} />
        : story.type === 'video'
          ? <Video size={large ? 30 : 22} color="#FFFFFF" strokeWidth={2.4} />
          : <Text numberOfLines={large ? 4 : 3} style={large ? styles.storyThumbTextLarge : styles.storyThumbText}>{story.content}</Text>}
      {storySeen(story, userId) ? <View style={styles.seenOverlay} /> : null}
    </View>
  );
}

function StoryViewer({
  story,
  authorStories,
  storyIndex,
  progress,
  paused,
  userId,
  onClose,
  onPause,
  onResume,
  onTap,
  onShowViewers,
  onDelete,
}: {
  story: Story | null;
  authorStories: Story[];
  storyIndex: number;
  progress: number;
  paused: boolean;
  userId: string;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
  onTap: (side: 'left' | 'right') => void;
  onShowViewers: (story: Story) => void;
  onDelete: (story: Story) => void | Promise<void>;
}) {
  if (!story) return null;
  const avatar = storyAuthorAvatar(story);
  const name = storyAuthorName(story, userId);
  const mine = story.authorId === userId;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.viewerModal, { backgroundColor: story.type === 'text' ? story.bg || colors.header : '#050505' }]}>
        <View style={styles.viewerProgressRow}>
          {authorStories.map((item, index) => (
            <View key={item.id} style={styles.viewerProgressTrack}>
              <View
                style={[
                  styles.viewerProgressFill,
                  { width: item.id === story.id ? `${progress}%` : index < storyIndex ? '100%' : '0%' },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={styles.viewerHeader}>
          <View style={styles.viewerAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.viewerAvatarImage} /> : <Text style={styles.viewerAvatarText}>{initials(name)}</Text>}
          </View>
          <View style={styles.viewerHeaderText}>
            <Text numberOfLines={1} style={styles.viewerName}>{name}</Text>
            <Text style={styles.viewerTime}>{formatClock(story.createdAt)}</Text>
          </View>
          {mine ? (
            <Pressable onPress={() => onDelete(story)} style={styles.viewerIconButton}>
              <Trash2 size={19} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
          ) : null}
          <Pressable onPress={onClose} style={styles.viewerIconButton}>
            <X size={22} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        </View>

        <View style={styles.viewerContent}>
          {story.type === 'image'
            ? <Image source={{ uri: story.content }} style={styles.viewerImage} resizeMode="contain" />
            : story.type === 'video'
              ? <OracleVideoPlayer sourceUrl={story.content} paused={paused} style={styles.viewerVideo} />
              : <Text style={styles.viewerText}>{story.content}</Text>}
          <Pressable
            onPressIn={onPause}
            onPressOut={onResume}
            onPress={() => onTap('left')}
            style={styles.viewerLeftTap}
          />
          <Pressable
            onPressIn={onPause}
            onPressOut={onResume}
            onPress={() => onTap('right')}
            style={styles.viewerRightTap}
          />
          {story.caption && !paused ? (
            <View style={styles.viewerCaptionWrap}>
              <Text style={styles.viewerCaption}>{story.caption}</Text>
            </View>
          ) : null}
          {paused ? (
            <View style={styles.pauseOverlay}>
              <View style={styles.pauseBadge}>
                <Pause size={22} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.viewerFooter}>
          <Pressable disabled={!mine} onPress={() => onShowViewers(story)} style={styles.viewerViewsButton}>
            <Eye size={16} color="#FFFFFF" strokeWidth={2.3} />
            <Text style={styles.viewerViewsText}>{storyViewCount(story)} vue{storyViewCount(story) !== 1 ? 's' : ''}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CreatorSheet({
  visible,
  busy,
  storyType,
  content,
  caption,
  bg,
  imageData,
  onClose,
  onStoryTypeChange,
  onContentChange,
  onCaptionChange,
  onBgChange,
  onPickImage,
  onTakePhoto,
  onPickVideo,
  onPublish,
}: {
  visible: boolean;
  busy: boolean;
  storyType: 'text' | 'image' | 'video';
  content: string;
  caption: string;
  bg: string;
  imageData: string;
  onClose: () => void;
  onStoryTypeChange: (value: 'text' | 'image' | 'video') => void;
  onContentChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onBgChange: (value: string) => void;
  onPickImage: () => void | Promise<void>;
  onTakePhoto: () => void | Promise<void>;
  onPickVideo: () => void | Promise<void>;
  onPublish: () => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.creatorSheet, { paddingBottom: Math.max(18, insets.bottom + 14) }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.creatorSheetScroll}>
          <View style={styles.sheetHandle} />
          <View style={styles.creatorHead}>
            <Text style={styles.creatorTitle}>Nouvelle story</Text>
            <Pressable onPress={onClose} style={styles.closePill}>
              <X size={20} color={colors.header} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View style={styles.segment}>
            {(['text', 'image', 'video'] as const).map(item => (
              <Pressable key={item} onPress={() => onStoryTypeChange(item)} style={[styles.segmentItem, storyType === item && styles.segmentActive]}>
                <Text style={[styles.segmentText, storyType === item && styles.segmentTextActive]}>{item === 'text' ? 'Texte' : item === 'image' ? 'Image' : 'Vidéo'}</Text>
              </Pressable>
            ))}
          </View>

          {storyType === 'text' ? (
            <>
              <View style={[styles.textStoryPreview, { backgroundColor: bg }]}>
                <Text style={styles.textStoryPreviewText}>{content.trim() || 'Votre texte ici'}</Text>
              </View>
              <TextInput
                value={content}
                onChangeText={onContentChange}
                placeholder="Créer une story texte"
                placeholderTextColor={colors.muted}
                maxLength={200}
                multiline
                style={[styles.input, styles.textarea]}
              />
              <View style={styles.colorRow}>
                {STORY_BACKGROUNDS.map(item => (
                  <Pressable key={item} onPress={() => onBgChange(item)} style={[styles.colorDot, { backgroundColor: item }, bg === item && styles.colorDotActive]} />
                ))}
              </View>
            </>
          ) : storyType === 'image' ? (
            <>
              <View style={styles.actionRow}>
                <PrimaryButton label="Prendre une photo" onPress={onTakePhoto} disabled={busy} />
                <SecondaryButton label={imageData ? 'Changer l’image' : 'Choisir une image'} onPress={onPickImage} disabled={busy} />
              </View>
              {imageData ? <Image source={{ uri: imageData }} style={styles.storyPreview} /> : <EmptyMediaPreview icon="image" />}
              <TextInput value={caption} onChangeText={onCaptionChange} placeholder="Légende" placeholderTextColor={colors.muted} maxLength={120} style={styles.input} />
            </>
          ) : (
            <>
              <PrimaryButton label={imageData ? 'Changer la vidéo' : 'Choisir une vidéo'} onPress={onPickVideo} disabled={busy} />
              {imageData ? (
                <View style={styles.storyVideoPreview}>
                  <OracleVideoPlayer sourceUrl={imageData} muted repeat style={styles.storyVideoPlayer} />
                </View>
              ) : <EmptyMediaPreview icon="video" />}
              <TextInput value={caption} onChangeText={onCaptionChange} placeholder="Légende" placeholderTextColor={colors.muted} maxLength={120} style={styles.input} />
            </>
          )}

          <PrimaryButton label="Publier" onPress={onPublish} disabled={busy || (storyType === 'text' ? !content.trim() : !imageData)} />
          <Loading active={busy} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EmptyMediaPreview({ icon }: { icon: 'image' | 'video' }) {
  const Icon = icon === 'image' ? ImageIcon : Video;
  return (
    <View style={styles.emptyMediaPreview}>
      <Icon size={42} color={colors.header} strokeWidth={1.7} />
    </View>
  );
}

function ViewersSheet({ story, onClose }: { story: Story | null; onClose: () => void }) {
  return (
    <Modal visible={Boolean(story)} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.viewersSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.creatorHead}>
            <View>
              <Text style={styles.creatorTitle}>Qui a vu cette story</Text>
              <Text style={styles.viewerSheetSub}>{story ? `${storyViewCount(story)} vue${storyViewCount(story) !== 1 ? 's' : ''}` : ''}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closePill}>
              <X size={20} color={colors.header} strokeWidth={2.4} />
            </Pressable>
          </View>
          {story?.viewers?.length ? (
            story.viewers.map(viewer => (
              <View key={viewer.id} style={styles.viewerRow}>
                <View style={styles.viewerRowAvatar}>
                  {viewer.avatar ? <Image source={{ uri: viewer.avatar }} style={styles.viewerAvatarImage} /> : <Text style={styles.viewerRowInitial}>{initials(viewer.name || viewer.username)}</Text>}
                </View>
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{viewer.name || viewer.username || 'Contact'}</Text>
                  <Text style={styles.rowSub}>{viewer.username ? `@${viewer.username}` : 'Oracle Messenger'}</Text>
                </View>
                <Text style={styles.rowSub}>{formatViewedAt(viewer.viewedAt)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.noViewers}>
              <Eye size={34} color={colors.header} strokeWidth={1.7} />
              <Text style={styles.emptyTitle}>Aucune vue pour l’instant</Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 124, gap: 0, backgroundColor: colors.background },
  storyHeader: { minHeight: 52, backgroundColor: colors.header, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)' },
  storyBackButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  disabledBackButton: { opacity: 0.55 },
  storyHeaderCopy: { flex: 1, minWidth: 0 },
  storyHeaderTitle: { color: '#FFFFFF', fontSize: 15, lineHeight: 17, fontWeight: '900' },
  storyHeaderSubtitle: { color: 'rgba(248,250,252,0.72)', fontSize: 11.5, lineHeight: 14, fontWeight: '800', marginTop: 2 },
  headerCreateButton: { minHeight: 34, borderRadius: 17, backgroundColor: '#FFFFFF', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  headerCreatePressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  headerCreateText: { color: colors.header, fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  sectionLabel: { color: '#64748B', fontSize: 10.5, lineHeight: 13, fontWeight: '900', letterSpacing: 0.8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  myStorySection: { paddingHorizontal: 10, gap: 8 },
  myStoryCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: '#102A2A', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  myStoryCardPressed: { backgroundColor: '#EAF4F1' },
  myStoryThumbWrap: { width: 52, height: 52 },
  myStoryText: { flex: 1, minWidth: 0 },
  myStoryTitle: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  myStorySub: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 3 },
  addBadge: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  viewsPill: { alignSelf: 'flex-start', marginTop: 8, minHeight: 32, borderRadius: 16, paddingHorizontal: 11, backgroundColor: '#EAF4F1', flexDirection: 'row', alignItems: 'center', gap: 6 },
  viewsPillText: { color: colors.header, fontSize: 12, fontWeight: '900' },
  rowsSection: { marginTop: 0 },
  rowsCard: { marginHorizontal: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  authorRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  authorRing: { width: 54, height: 54, borderRadius: 27, padding: 3, alignItems: 'center', justifyContent: 'center' },
  authorRingUnread: { backgroundColor: colors.brand },
  authorRingSeen: { backgroundColor: 'rgba(100,116,139,0.28)' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900' },
  rowSub: { color: colors.muted, fontSize: 11.5, fontWeight: '700', marginTop: 3 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: 'transparent' },
  statusDotUnread: { backgroundColor: colors.brand },
  storyThumb: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  storyThumbLarge: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  storyThumbEmpty: { backgroundColor: '#F1F5F4', borderColor: '#D1D8DB', borderStyle: 'dashed' },
  storyThumbImage: { width: '100%', height: '100%' },
  storyThumbText: { color: '#FFFFFF', fontSize: 9.5, lineHeight: 12, fontWeight: '900', textAlign: 'center', paddingHorizontal: 6 },
  storyThumbTextLarge: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '900', textAlign: 'center', paddingHorizontal: 7 },
  seenOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.16)' },
  emptyState: { minHeight: 330, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40, gap: 12 },
  emptyIcon: { width: 82, height: 82, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  emptyTitle: { color: colors.text, fontSize: 18, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  emptyCopy: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  emptyCreateButton: { minHeight: 42, minWidth: 184, borderRadius: 21, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 4, shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  emptyCreatePressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  emptyCreateText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 92, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.input, borderRadius: 16, padding: 5 },
  segmentItem: { minWidth: '30%', flexGrow: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { backgroundColor: colors.header },
  segmentText: { color: colors.muted, fontSize: 12.5, fontWeight: '900' },
  segmentTextActive: { color: '#FFFFFF' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  colorDotActive: { borderColor: colors.text, transform: [{ scale: 1.08 }] },
  storyPreview: { width: '100%', aspectRatio: 4 / 4.2, borderRadius: 16, backgroundColor: '#050505' },
  storyVideoPreview: { minHeight: 180, borderRadius: 16, backgroundColor: '#050505', overflow: 'hidden' },
  storyVideoPlayer: { width: '100%', height: 220, backgroundColor: '#050505' },
  emptyMediaPreview: { minHeight: 150, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  textStoryPreview: { minHeight: 150, borderRadius: 18, alignItems: 'center', justifyContent: 'center', padding: 18 },
  textStoryPreviewText: { color: '#FFFFFF', fontSize: 20, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.58)', justifyContent: 'flex-end' },
  creatorSheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 18, paddingTop: 8 },
  creatorSheetScroll: { gap: 12, paddingBottom: 4 },
  viewersSheet: { maxHeight: '78%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, gap: 8 },
  sheetHandle: { alignSelf: 'center', width: 46, height: 5, borderRadius: 999, backgroundColor: colors.borderStrong, marginBottom: 6 },
  creatorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  creatorTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  closePill: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  viewerSheetSub: { color: colors.muted, fontSize: 12.5, fontWeight: '800', marginTop: 2 },
  viewerRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  viewerRowAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  viewerRowInitial: { color: colors.header, fontSize: 16, fontWeight: '900' },
  noViewers: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 10 },
  viewerModal: { flex: 1 },
  viewerProgressRow: { position: 'absolute', top: 38, left: 12, right: 12, zIndex: 20, flexDirection: 'row', gap: 4 },
  viewerProgressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.34)', overflow: 'hidden' },
  viewerProgressFill: { height: '100%', backgroundColor: '#FFFFFF' },
  viewerHeader: { position: 'absolute', top: 54, left: 12, right: 12, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, borderWidth: 2, borderColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  viewerAvatarImage: { width: '100%', height: '100%' },
  viewerAvatarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  viewerHeaderText: { flex: 1, minWidth: 0 },
  viewerName: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  viewerTime: { color: 'rgba(255,255,255,0.76)', fontSize: 12, fontWeight: '700', marginTop: 2 },
  viewerIconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.26)', alignItems: 'center', justifyContent: 'center' },
  viewerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerVideo: { width: '100%', height: '100%', backgroundColor: '#050505' },
  viewerText: { color: '#FFFFFF', fontSize: 29, lineHeight: 37, fontWeight: '900', textAlign: 'center', paddingHorizontal: 30, textShadowColor: 'rgba(0,0,0,0.28)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  viewerLeftTap: { position: 'absolute', left: 0, top: 106, bottom: 92, width: '38%' },
  viewerRightTap: { position: 'absolute', right: 0, top: 106, bottom: 92, width: '62%' },
  viewerCaptionWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 112, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 34, backgroundColor: 'rgba(0,0,0,0.20)' },
  viewerCaption: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontWeight: '700', textAlign: 'center' },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.12)' },
  pauseBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' },
  viewerFooter: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center', zIndex: 22 },
  viewerViewsButton: { minHeight: 38, borderRadius: 19, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.54)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewerViewsText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
