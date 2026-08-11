import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, requireNativeComponent, ScrollView, Share, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { FRONTEND_URL } from '@/config/env';
import { api } from '@/services/api';
import { readLocalGalleryItems, removeLocalGalleryItem, type LocalGalleryItem } from '@/services/localMedia';
import { syncPendingMedia } from '@/services/mediaSync';
import { saveSession } from '@/services/session';
import { colors } from '@/theme/colors';
import type { AuthSession, Conversation, Message, User } from '@/types/messenger';

export type NativeTabKey = 'chats' | 'contacts' | 'stories' | 'gallery' | 'tools' | 'ai' | 'flyers' | 'videos' | 'payments' | 'business' | 'profile' | 'admin';

export const NATIVE_TABS: { key: NativeTabKey; label: string }[] = [
  { key: 'chats', label: 'Chats' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'stories', label: 'Stories' },
  { key: 'gallery', label: 'Galerie' },
  { key: 'tools', label: 'Outils' },
  { key: 'ai', label: 'IA' },
  { key: 'flyers', label: 'Flyers' },
  { key: 'videos', label: 'Vidéos' },
  { key: 'payments', label: 'Paiements' },
  { key: 'business', label: 'Business' },
  { key: 'profile', label: 'Profil' },
  { key: 'admin', label: 'Admin' },
];

type FeatureProps = {
  tab: NativeTabKey;
  session: AuthSession;
  onOpenConversation: (conversation: Conversation) => void;
  onRefreshConversations: () => Promise<void>;
  onLogout: () => Promise<void>;
};

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function initials(name?: string | null) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.primaryButton, disabled && styles.disabled]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function AlertText({ text }: { text?: string }) {
  if (!text) return null;
  return <Text style={styles.alert}>{text}</Text>;
}

function ownerKey(base: string, ownerId: string) {
  return `${base}:${ownerId || 'local'}`;
}

type ToolTab = 'meeting' | 'ai' | 'flyer' | 'video' | 'translate' | 'notes' | 'events';
type LocalNote = { id: string; title: string; body: string; updatedAt: number };
type LocalEvent = { id: string; title: string; date: string; time: string; note: string; createdAt: number };
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
  viewers?: Array<User & { viewedAt?: string }>;
};

const STORY_BACKGROUNDS = ['#102A2A', '#25D366', '#008069', '#34B7F1', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
const OracleVideoPlayer = requireNativeComponent<{
  sourceUrl: string;
  paused?: boolean;
  muted?: boolean;
  repeat?: boolean;
  style?: ViewStyle;
}>('OracleVideoPlayer');
const OracleAudioPlayer = requireNativeComponent<{
  sourceUrl: string;
  paused?: boolean;
  style?: ViewStyle;
}>('OracleAudioPlayer');

function phoneCandidates(raw: string) {
  const cleaned = String(raw || '').replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  const normalized = cleaned.startsWith('+') ? `+${digits}` : digits ? `+${digits}` : '';
  return [
    normalized,
    digits,
    digits.length >= 8 ? digits.slice(-8) : '',
    digits.length >= 9 ? digits.slice(-9) : '',
  ].filter(Boolean);
}

async function hashPhones(values: string[]) {
  const unique = [...new Set(values.flatMap(phoneCandidates))];
  const hashes = await Promise.all(unique.map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
  return [...new Set(hashes)];
}

async function fileToDataUrl(uri: string, mime = 'image/jpeg') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

function Loading({ active }: { active: boolean }) {
  if (!active) return null;
  return <ActivityIndicator color={colors.brand} style={styles.loader} />;
}

function UserRow({ user, actionLabel, onPress }: { user: User; actionLabel?: string; onPress?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        {user.avatar ? <Image source={{ uri: user.avatar }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(user.name)}</Text>}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{user.name || user.email || 'Utilisateur'}</Text>
        <Text style={styles.rowSub}>{user.username ? `@${user.username}` : user.email || user.status || 'Oracle Messenger'}</Text>
      </View>
      {actionLabel && onPress ? <SecondaryButton label={actionLabel} onPress={onPress} /> : null}
    </View>
  );
}

function ContactsPage({ token, onOpenConversation, onRefreshConversations }: { token: string; onOpenConversation: (conversation: Conversation) => void; onRefreshConversations: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [matched, setMatched] = useState<User | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      setResults(await api.searchUsers(query.trim(), token));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Recherche impossible.');
    } finally {
      setBusy(false);
    }
  }, [query, token]);

  const createConversation = useCallback(async (user: User) => {
    setBusy(true);
    setNotice('');
    try {
      const conversation = await api.createConversation(user.id, token);
      await onRefreshConversations();
      onOpenConversation(conversation);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Conversation impossible.');
    } finally {
      setBusy(false);
    }
  }, [onOpenConversation, onRefreshConversations, token]);

  const matchPhone = useCallback(async () => {
    const normalized = phone.trim();
    if (!normalized) return;
    if (!normalized.startsWith('+')) {
      setNotice('Ajoutez le code pays avant invitation, exemple +225...');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const user = await api.matchContact(token, { phone: normalized });
      setMatched(user);
      if (!user) setNotice('Aucun compte trouvé. Le numéro peut être invité avec son code pays.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Vérification contact impossible.');
    } finally {
      setBusy(false);
    }
  }, [phone, token]);

  const importContacts = useCallback(async () => {
    setBusy(true);
    setNotice('');
    setMatched(null);
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        setNotice('Permission Contacts refusée. Import impossible sans accès au carnet.');
        return;
      }
      const response = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name, Contacts.Fields.Image],
        pageSize: 2000,
      });
      const phones = response.data.flatMap(contact => (contact.phoneNumbers || []).map(item => item.number || '')).filter(Boolean);
      setImportedCount(phones.length);
      if (!phones.length) {
        setNotice('Aucun numéro lisible dans le carnet.');
        return;
      }
      const hashes = await hashPhones(phones);
      const users = await api.matchPhoneHashes(token, hashes);
      setResults(users);
      setNotice(users.length
        ? `${users.length} contact(s) Oracle Messenger trouvé(s) sur ${phones.length} numéro(s) lus.`
        : `Aucun contact Oracle Messenger trouvé sur ${phones.length} numéro(s) lus.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Import contacts impossible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Contacts">
        <Text style={styles.pageCopy}>Recherchez, ajoutez ou invitez un contact sans mélanger les comptes.</Text>
        <PrimaryButton label="Importer mes contacts" onPress={importContacts} disabled={busy} />
        {importedCount ? <Text style={styles.cardMeta}>{importedCount} numéro(s) lus dans le carnet local.</Text> : null}
        <TextInput value={query} onChangeText={setQuery} placeholder="Nom, email ou username" placeholderTextColor={colors.muted} style={styles.input} />
        <PrimaryButton label="Rechercher" onPress={search} disabled={busy || !query.trim()} />
        <Loading active={busy} />
        <AlertText text={notice} />
        {results.map(user => <UserRow key={user.id} user={user} actionLabel="Écrire" onPress={() => createConversation(user)} />)}
      </Section>

      <Section title="Invitation">
        <Text style={styles.pageCopy}>Si le numéro n’a pas d’indicatif, Oracle Messenger demande de le compléter avant invitation.</Text>
        <TextInput value={phone} onChangeText={setPhone} placeholder="+225..." placeholderTextColor={colors.muted} keyboardType="phone-pad" style={styles.input} />
        <PrimaryButton label="Vérifier le numéro" onPress={matchPhone} disabled={busy || !phone.trim()} />
        {matched ? <UserRow user={matched} actionLabel="Écrire" onPress={() => createConversation(matched)} /> : null}
      </Section>
    </ScrollView>
  );
}

function StoriesPage({ token, userId }: { token: string; userId: string }) {
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

function GalleryPage({ token, userId }: { token: string; userId: string }) {
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

type BusinessMode = 'clients' | 'reminders' | 'stats';
const BUSINESS_STATUS_OPTIONS = ['prospect', 'chaud', 'froid', 'relancer', 'paye', 'vip', 'perdu'] as const;

function BusinessPage({ token }: { token: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [mode, setMode] = useState<BusinessMode>('clients');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientStatus, setClientStatus] = useState('prospect');
  const [clientValue, setClientValue] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setOverview(await api.businessOverview(token));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Business indisponible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const clients = Array.isArray(overview?.clients) ? overview.clients : [];
  const reminders = Array.isArray(overview?.reminders) ? overview.reminders : [];
  const payments = Array.isArray(overview?.payments) ? overview.payments : [];
  const access = overview?.access;
  const canAct = Boolean(access?.canAct);

  const pay = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api.businessInitializePaystack(token);
      if (data.authorizationUrl) await Linking.openURL(data.authorizationUrl);
      else await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Paiement Business impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, token]);

  const saveClient = useCallback(async () => {
    if (!clientName.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      await api.businessSaveClient(token, {
        name: clientName.trim(),
        phone: clientPhone.trim() || undefined,
        email: clientEmail.trim() || undefined,
        status: clientStatus,
        tags: [clientStatus],
        notes: clientNotes.trim(),
        value: Number(clientValue) || 0,
      });
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientStatus('prospect');
      setClientValue('');
      setClientNotes('');
      await load();
      setNotice('Client Business enregistré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement client impossible.');
    } finally {
      setBusy(false);
    }
  }, [clientEmail, clientName, clientNotes, clientPhone, clientStatus, clientValue, load, token]);

  const saveReminder = useCallback(async () => {
    if (!reminderDate.trim()) return;
    setBusy(true);
    setNotice('');
    try {
      await api.businessSaveReminder(token, {
        clientId: selectedClientId || undefined,
        dueAt: reminderDate.trim(),
        note: reminderNote.trim(),
      });
      setReminderDate('');
      setReminderNote('');
      await load();
      setNotice('Rappel Business enregistré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement rappel impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, reminderDate, reminderNote, selectedClientId, token]);

  const markDone = useCallback(async (id: string, done: boolean) => {
    setBusy(true);
    setNotice('');
    try {
      await api.businessMarkReminderDone(token, id, done);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Mise à jour rappel impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Business Hub">
        <Text style={styles.pageCopy}>CRM, rappels et accès Business reliés aux données serveur. Aucune statistique fictive n’est affichée.</Text>
        <View style={styles.statsGrid}>
          <Stat label="Clients" value={clients.length} />
          <Stat label="Relances" value={reminders.length} />
          <Stat label="Paiements" value={payments.length} />
          <Stat label="Accès" value={canAct ? 'Actif' : 'Bloqué'} />
        </View>
        {!canAct ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Accès Business requis</Text>
            <Text style={styles.cardText}>
              {access?.subscriptionActive === false
                ? `Abonnement requis: ${valueText(access?.monthlyPriceFcfa || 5000)} FCFA/mois.`
                : access?.aiCreditsOk === false
                  ? 'Crédit IA insuffisant pour les actions Business.'
                  : 'Activez Business pour enregistrer des données CRM.'}
            </Text>
            <PrimaryButton label="Activer / renouveler avec Paystack" onPress={pay} disabled={busy} />
          </View>
        ) : <SecondaryButton label="Renouveler Business" onPress={pay} disabled={busy} />}
        <View style={styles.segment}>
          {(['clients', 'reminders', 'stats'] as const).map(item => (
            <Pressable key={item} onPress={() => setMode(item)} style={[styles.segmentItem, mode === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>{item === 'clients' ? 'Clients' : item === 'reminders' ? 'Rappels' : 'Stats'}</Text>
            </Pressable>
          ))}
        </View>
        <Loading active={busy} />
        <AlertText text={notice} />
      </Section>

      {mode === 'clients' ? (
        <Section title="Clients">
          <TextInput value={clientName} onChangeText={setClientName} placeholder="Nom client" placeholderTextColor={colors.muted} style={styles.input} />
          <View style={styles.actionRow}>
            <TextInput value={clientPhone} onChangeText={setClientPhone} placeholder="Téléphone" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={[styles.input, styles.inlineInput]} />
            <TextInput value={clientEmail} onChangeText={setClientEmail} placeholder="Email" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={[styles.input, styles.inlineInput]} />
          </View>
          <View style={styles.segment}>
            {BUSINESS_STATUS_OPTIONS.map(status => (
              <Pressable key={status} onPress={() => setClientStatus(status)} style={[styles.segmentItem, clientStatus === status && styles.segmentActive]}>
                <Text style={[styles.segmentText, clientStatus === status && styles.segmentTextActive]}>{status === 'paye' ? 'payé' : status}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={clientValue} onChangeText={setClientValue} placeholder="Valeur FCFA" placeholderTextColor={colors.muted} keyboardType="numeric" style={styles.input} />
          <TextInput value={clientNotes} onChangeText={setClientNotes} placeholder="Notes" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
          <PrimaryButton label="Enregistrer client" onPress={saveClient} disabled={busy || !clientName.trim()} />
          {!clients.length ? <Text style={styles.empty}>Aucun client Business.</Text> : null}
          {clients.map((client: any) => (
            <View key={client.id} style={styles.card}>
              <Text style={styles.cardTitle}>{client.name || 'Client'}</Text>
              <Text style={styles.cardText}>{client.phone || client.email || 'Coordonnées non renseignées'}</Text>
              <Text style={styles.cardMeta}>{client.status || 'prospect'} • {valueText(client.value || 0)} FCFA • {client.updatedAt ? new Date(client.updatedAt).toLocaleString('fr-FR') : ''}</Text>
              {client.notes ? <Text numberOfLines={3} style={styles.cardText}>{client.notes}</Text> : null}
            </View>
          ))}
        </Section>
      ) : null}

      {mode === 'reminders' ? (
        <Section title="Rappels">
          <View style={styles.segment}>
            <Pressable onPress={() => setSelectedClientId('')} style={[styles.segmentItem, !selectedClientId && styles.segmentActive]}>
              <Text style={[styles.segmentText, !selectedClientId && styles.segmentTextActive]}>Général</Text>
            </Pressable>
            {clients.slice(0, 8).map((client: any) => (
              <Pressable key={client.id} onPress={() => setSelectedClientId(client.id)} style={[styles.segmentItem, selectedClientId === client.id && styles.segmentActive]}>
                <Text numberOfLines={1} style={[styles.segmentText, selectedClientId === client.id && styles.segmentTextActive]}>{client.name}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={reminderDate} onChangeText={setReminderDate} placeholder="Date ISO: 2026-08-12T09:00:00Z" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput value={reminderNote} onChangeText={setReminderNote} placeholder="Note du rappel" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
          <PrimaryButton label="Créer rappel" onPress={saveReminder} disabled={busy || !reminderDate.trim()} />
          {!reminders.length ? <Text style={styles.empty}>Aucun rappel Business.</Text> : null}
          {reminders.map((reminder: any) => (
            <View key={reminder.id} style={styles.card}>
              <Text style={styles.cardTitle}>{reminder.title || 'Rappel Business'}</Text>
              <Text style={styles.cardText}>{reminder.note || 'Sans note'}</Text>
              <Text style={styles.cardMeta}>{reminder.dueAt ? new Date(reminder.dueAt).toLocaleString('fr-FR') : ''} • {reminder.done ? 'Terminé' : 'À faire'}</Text>
              <SecondaryButton label={reminder.done ? 'Réouvrir' : 'Terminer'} onPress={() => markDone(reminder.id, !reminder.done)} disabled={busy} />
            </View>
          ))}
        </Section>
      ) : null}

      {mode === 'stats' ? (
        <Section title="Statistiques Business">
          <View style={styles.statsGrid}>
            <Stat label="Actifs" value={clients.filter((client: any) => client.status !== 'perdu').length} />
            <Stat label="Payés" value={clients.filter((client: any) => client.status === 'paye').length} />
            <Stat label="Valeur" value={clients.reduce((sum: number, client: any) => sum + (Number(client.value) || 0), 0)} />
            <Stat label="À faire" value={reminders.filter((reminder: any) => !reminder.done).length} />
          </View>
          {payments.map((payment: any) => (
            <View key={payment.id || payment.reference} style={styles.card}>
              <Text style={styles.cardTitle}>{payment.reference || 'Paiement'}</Text>
              <Text style={styles.cardMeta}>{payment.status || 'pending'} • {valueText(payment.amountFcfa || 0)} FCFA • {payment.createdAt ? new Date(payment.createdAt).toLocaleString('fr-FR') : ''}</Text>
            </View>
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{valueText(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

type AiMessage = { id: string; from: 'client' | 'agent'; text: string };

function MeetingTool({ userName }: { userName: string }) {
  const [room, setRoom] = useState('');
  const [notice, setNotice] = useState('');

  const roomName = room.trim() || `oracle-${userName.replace(/\W+/g, '-').toLowerCase() || 'meeting'}`;
  const link = `https://meet.jit.si/${encodeURIComponent(roomName)}`;

  const openMeeting = useCallback(async () => {
    try {
      await Linking.openURL(`${link}#userInfo.displayName="${encodeURIComponent(userName)}"`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ouverture Meeting impossible.');
    }
  }, [link, userName]);

  const shareMeeting = useCallback(async () => {
    try {
      await Share.share({ message: link });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage Meeting impossible.');
    }
  }, [link]);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Créez ou rejoignez une salle Meeting avec un lien partageable.</Text>
      <TextInput value={room} onChangeText={setRoom} placeholder="Nom de salle ou lien" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.actionRow}>
        <PrimaryButton label="Ouvrir Meeting" onPress={openMeeting} />
        <SecondaryButton label="Partager" onPress={shareMeeting} />
      </View>
      <Text style={styles.cardMeta}>{link}</Text>
      <AlertText text={notice} />
    </View>
  );
}

function TranslateTool({ token }: { token: string }) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('fr');
  const [result, setResult] = useState('');
  const [provider, setProvider] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const translate = useCallback(async () => {
    const text = source.trim();
    if (!text) return;
    setBusy(true);
    setNotice('');
    try {
      const data = await api.aiAutoTranslate(token, text, target.trim() || 'fr');
      setResult(data.translated);
      setProvider(data.provider);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Traduction impossible.');
    } finally {
      setBusy(false);
    }
  }, [source, target, token]);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Traduction reliée au backend IA avec code langue cible.</Text>
      <TextInput value={target} onChangeText={setTarget} placeholder="Langue cible: fr, en, es..." placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput value={source} onChangeText={setSource} placeholder="Texte à traduire" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
      <PrimaryButton label="Traduire" onPress={translate} disabled={busy || !source.trim()} />
      <Loading active={busy} />
      <AlertText text={notice} />
      {result ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Résultat</Text>
          <Text style={styles.cardText}>{result}</Text>
          <Text style={styles.cardMeta}>{provider ? `Provider: ${provider}` : ''}</Text>
        </View>
      ) : null}
    </View>
  );
}

function NotesTool({ ownerId }: { ownerId: string }) {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const storageKey = useMemo(() => ownerKey('oracle-native-notes', ownerId), [ownerId]);

  const persist = useCallback(async (next: LocalNote[]) => {
    setNotes(next);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (!alive) return;
        setNotes(raw ? JSON.parse(raw) : []);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [storageKey]);

  const save = useCallback(async () => {
    if (!title.trim() && !body.trim()) return;
    const note: LocalNote = { id: `${Date.now()}`, title: title.trim() || 'Note', body: body.trim(), updatedAt: Date.now() };
    await persist([note, ...notes].slice(0, 120));
    setTitle('');
    setBody('');
  }, [body, notes, persist, title]);

  const remove = useCallback(async (id: string) => {
    await persist(notes.filter(note => note.id !== id));
  }, [notes, persist]);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Notes locales isolées par compte, conservées après redémarrage de l’application.</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Titre" placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput value={body} onChangeText={setBody} placeholder="Note" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
      <PrimaryButton label="Enregistrer la note" onPress={save} disabled={!title.trim() && !body.trim()} />
      {notes.map(note => (
        <View key={note.id} style={styles.card}>
          <Text style={styles.cardTitle}>{note.title}</Text>
          <Text style={styles.cardText}>{note.body}</Text>
          <Text style={styles.cardMeta}>{new Date(note.updatedAt).toLocaleString('fr-FR')}</Text>
          <SecondaryButton label="Supprimer" onPress={() => remove(note.id)} />
        </View>
      ))}
    </View>
  );
}

function EventsTool({ ownerId }: { ownerId: string }) {
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [note, setNote] = useState('');
  const storageKey = useMemo(() => ownerKey('oracle-native-events', ownerId), [ownerId]);

  const persist = useCallback(async (next: LocalEvent[]) => {
    setEvents(next);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (!alive) return;
        const parsed = raw ? JSON.parse(raw) : [];
        setEvents(Array.isArray(parsed) ? parsed : []);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [storageKey]);

  const save = useCallback(async () => {
    if (!title.trim() || !date.trim()) return;
    const event: LocalEvent = { id: `${Date.now()}`, title: title.trim(), date: date.trim(), time: time.trim() || '09:00', note: note.trim(), createdAt: Date.now() };
    await persist([event, ...events].slice(0, 120));
    setTitle('');
    setDate('');
    setTime('09:00');
    setNote('');
  }, [date, events, note, persist, time, title]);

  const remove = useCallback(async (id: string) => {
    await persist(events.filter(event => event.id !== id));
  }, [events, persist]);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Rappels locaux conservés par compte. Les notifications planifiées natives restent à brancher pour parité totale avec le service worker Web.</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Titre du rappel" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.actionRow}>
        <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
        <TextInput value={time} onChangeText={setTime} placeholder="09:00" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
      </View>
      <TextInput value={note} onChangeText={setNote} placeholder="Détail" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
      <PrimaryButton label="Enregistrer le rappel" onPress={save} disabled={!title.trim() || !date.trim()} />
      {events.map(event => (
        <View key={event.id} style={styles.card}>
          <Text style={styles.cardTitle}>{event.title}</Text>
          <Text style={styles.cardText}>{event.note || 'Sans détail'}</Text>
          <Text style={styles.cardMeta}>{event.date} à {event.time}</Text>
          <SecondaryButton label="Supprimer" onPress={() => remove(event.id)} />
        </View>
      ))}
    </View>
  );
}

function ToolsPage({ token, ownerId, userName, initialMode = 'meeting' }: { token: string; ownerId: string; userName: string; initialMode?: ToolTab }) {
  const [mode, setMode] = useState<ToolTab>(initialMode);
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const load = useCallback(async () => {
    if (mode !== 'ai' && mode !== 'flyer' && mode !== 'video') {
      setOverview(null);
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const data = mode === 'ai'
        ? await api.aiAutoOverview(token)
        : mode === 'flyer'
          ? await api.aiFlyerOverview(token)
          : await api.aiVideoOverview(token);
      setOverview(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Outils indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [mode, token]);

  useEffect(() => { void load(); }, [load]);

  const armAutoClose = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      setAiOpen(false);
      setNotice('Test IA fermé après 45 secondes d’inactivité.');
    }, 45000);
  }, []);

  useEffect(() => () => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
  }, []);

  const testAi = useCallback(async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setNotice('');
    setAiOpen(true);
    const clientText = prompt.trim();
    setAiMessages(current => [...current, { id: `c-${Date.now()}`, from: 'client', text: clientText }]);
    setPrompt('');
    armAutoClose();
    try {
      const data = await api.aiAutoTest(token, clientText, 'tools');
      setAiMessages(current => [...current, { id: `a-${Date.now()}`, from: 'agent', text: data.response }]);
      if (data.freeTestsRemainingToday === 0) {
        setAiOpen(false);
        setNotice('Tests gratuits terminés pour aujourd’hui.');
      }
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Test IA impossible.');
    } finally {
      setBusy(false);
    }
  }, [armAutoClose, load, prompt, token]);

  const generateFlyer = useCallback(async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const data = await api.aiFlyerGenerate(token, prompt.trim());
      setNotice(data?.imageUrl ? `Flyer généré: ${data.imageUrl}` : 'Flyer généré.');
      setPrompt('');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Génération flyer impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, prompt, token]);

  const generateVideo = useCallback(async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const data = await api.aiVideoGenerate(token, {
        prompt: prompt.trim(),
        durationSeconds: 10,
        aspectRatio: '9:16',
        quality: 'hd',
        voiceOver: true,
        music: true,
        soundEffects: true,
      });
      setNotice(data?.videoUrl ? `Vidéo générée: ${data.videoUrl}` : 'Vidéo demandée.');
      setPrompt('');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Génération vidéo impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, prompt, token]);

  const pay = useCallback(async () => {
    setBusy(true);
    try {
      const data = mode === 'ai'
        ? await api.aiAutoInitializePaystack(token, 'starter')
        : mode === 'flyer'
          ? await api.aiFlyerInitializePaystack(token)
          : await api.aiVideoInitializePaystack(token);
      await Linking.openURL(data.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Paiement indisponible.');
    } finally {
      setBusy(false);
    }
  }, [mode, token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Outils">
        <Text style={styles.pageCopy}>Meeting, IA, flyers, vidéos, traduction, notes et rappels restaurés en écrans natifs reliés aux services disponibles.</Text>
        <View style={styles.segment}>
          {(['meeting', 'ai', 'flyer', 'video', 'translate', 'notes', 'events'] as const).map(item => (
            <Pressable key={item} onPress={() => setMode(item)} style={[styles.segmentItem, mode === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>
                {item === 'meeting' ? 'Meeting' : item === 'ai' ? 'IA' : item === 'flyer' ? 'Flyer' : item === 'video' ? 'Vidéo' : item === 'translate' ? 'Traduire' : item === 'notes' ? 'Notes' : 'Rappels'}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode === 'meeting' ? <MeetingTool userName={userName} /> : null}
        {mode === 'translate' ? <TranslateTool token={token} /> : null}
        {mode === 'notes' ? <NotesTool ownerId={ownerId} /> : null}
        {mode === 'events' ? <EventsTool ownerId={ownerId} /> : null}
        {mode === 'ai' || mode === 'flyer' || mode === 'video' ? (
          <View style={styles.subPanel}>
            <View style={styles.statsGrid}>
              <Stat label="Crédits" value={overview?.credits ?? overview?.wordsBalance ?? overview?.remaining ?? overview?.wallet?.creditsRemaining ?? overview?.wallet?.wordsRemaining ?? 0} />
              <Stat label="Paystack" value={overview?.paystackReady ? 'Prêt' : 'Bloqué'} />
              <Stat label="Gratuit" value={overview?.freeTestsRemainingToday ?? overview?.freeRemaining ?? overview?.free?.remaining ?? '-'} />
              <Stat label="Statut" value={overview?.access?.active || overview?.paidActive || overview?.config?.paidActive ? 'Premium' : 'Standard'} />
            </View>
            <TextInput
              value={prompt}
              onChangeText={text => { setPrompt(text); if (aiOpen) armAutoClose(); }}
              placeholder={mode === 'ai' ? 'Message client pour tester l’agent IA' : mode === 'flyer' ? 'Instruction du flyer à créer' : 'Instruction de la vidéo à créer'}
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.textarea]}
            />
            {mode === 'ai' ? <PrimaryButton label="Tester l’agent IA" onPress={testAi} disabled={busy || !prompt.trim()} /> : null}
            {mode === 'flyer' ? <PrimaryButton label="Créer le flyer" onPress={generateFlyer} disabled={busy || !prompt.trim()} /> : null}
            {mode === 'video' ? <PrimaryButton label="Créer la vidéo" onPress={generateVideo} disabled={busy || !prompt.trim()} /> : null}
            <SecondaryButton label={mode === 'video' ? 'Payer / activer video' : mode === 'flyer' ? 'Payer / activer les flyers' : 'Acheter credits IA'} onPress={pay} disabled={busy || overview?.paystackReady === false} />
            {overview?.paystackReady === false ? <AlertText text="Paiement non disponible : Paystack n’est pas configuré côté serveur." /> : null}
            <Loading active={busy} />
            <AlertText text={notice} />
            {aiOpen ? (
              <View style={styles.chatPanel}>
                <Text style={styles.cardTitle}>Test IA</Text>
                {aiMessages.map(message => (
                  <View key={message.id} style={[styles.aiBubble, message.from === 'client' ? styles.aiClient : styles.aiAgent]}>
                    <Text style={styles.aiFrom}>{message.from === 'client' ? 'Client' : 'Agent IA'}</Text>
                    <Text style={styles.aiText}>{message.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Section>
    </ScrollView>
  );
}

type PaymentScope = 'ai' | 'flyer' | 'video' | 'business';

function PaymentsPage({ token }: { token: string }) {
  const [scope, setScope] = useState<PaymentScope>('ai');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<any>(null);

  const initialize = useCallback(async () => {
    setBusy(true);
    setNotice('');
    setResult(null);
    try {
      const data = scope === 'ai'
        ? await api.aiAutoInitializePaystack(token, 'starter')
        : scope === 'flyer'
          ? await api.aiFlyerInitializePaystack(token)
          : scope === 'video'
            ? await api.aiVideoInitializePaystack(token)
            : await api.businessInitializePaystack(token);
      setReference(data.reference || '');
      await Linking.openURL(data.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Initialisation paiement impossible.');
    } finally {
      setBusy(false);
    }
  }, [scope, token]);

  const verify = useCallback(async () => {
    const clean = reference.trim();
    if (!clean) return;
    setBusy(true);
    setNotice('');
    try {
      const data = scope === 'ai'
        ? await api.aiAutoVerifyPaystack(token, clean)
        : scope === 'flyer'
          ? await api.aiFlyerVerifyPaystack(token, clean)
          : scope === 'video'
            ? await api.aiVideoVerifyPaystack(token, clean)
            : await api.businessVerifyPaystack(token, clean);
      setResult(data);
      setNotice('Vérification serveur terminée.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Vérification paiement impossible.');
    } finally {
      setBusy(false);
    }
  }, [reference, scope, token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Paiements">
        <Text style={styles.pageCopy}>Paystack est vérifié côté serveur par référence. Le retour visuel Android ne suffit jamais à valider un crédit.</Text>
        <View style={styles.segment}>
          {(['ai', 'flyer', 'video', 'business'] as const).map(item => (
            <Pressable key={item} onPress={() => setScope(item)} style={[styles.segmentItem, scope === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, scope === item && styles.segmentTextActive]}>{item === 'ai' ? 'IA' : item === 'flyer' ? 'Flyer' : item === 'video' ? 'Vidéo' : 'Business'}</Text>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="Démarrer paiement Paystack" onPress={initialize} disabled={busy} />
        <TextInput value={reference} onChangeText={setReference} placeholder="Référence Paystack à vérifier" placeholderTextColor={colors.muted} style={styles.input} />
        <SecondaryButton label="Vérifier côté serveur" onPress={verify} disabled={busy || !reference.trim()} />
        <Loading active={busy} />
        <AlertText text={notice} />
        {result ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Résultat serveur</Text>
            <Text style={styles.cardText}>{JSON.stringify(result, null, 2)}</Text>
          </View>
        ) : null}
      </Section>
    </ScrollView>
  );
}

function ProfilePage({ session, onLogout }: { session: AuthSession; onLogout: () => Promise<void> }) {
  const [name, setName] = useState(session.user.name || '');
  const [bio, setBio] = useState(session.user.bio || '');
  const [avatar, setAvatar] = useState(session.user.avatar || '');
  const [phone, setPhone] = useState(session.user.phone || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState<User>(session.user);
  const storageKey = useMemo(() => ownerKey('oracle-native-profile', session.user.id || session.user.email || session.token), [session.token, session.user.email, session.user.id]);
  const profileLink = user.username
    ? `${FRONTEND_URL}/u/${encodeURIComponent(user.username)}`
    : `${FRONTEND_URL}/install`;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (!alive || !raw) return;
        const local = JSON.parse(raw);
        if (typeof local.name === 'string') setName(local.name);
        if (typeof local.bio === 'string') setBio(local.bio);
        if (typeof local.avatar === 'string') setAvatar(local.avatar);
        if (typeof local.phone === 'string') setPhone(local.phone);
      })
      .catch(() => undefined);
    api.me(session.token)
      .then(remote => {
        if (!alive) return;
        setUser(remote);
        setName(remote.name || '');
        setBio(remote.bio || '');
        setAvatar(remote.avatar || '');
        setPhone(remote.phone || '');
        return AsyncStorage.setItem(storageKey, JSON.stringify({
          name: remote.name || '',
          bio: remote.bio || '',
          avatar: remote.avatar || '',
          phone: remote.phone || '',
        }));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [session.token, storageKey]);

  const pickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour modifier la photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.78,
      base64: false,
      allowsEditing: true,
      aspect: [1, 1],
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setBusy(true);
    try {
      setAvatar(await fileToDataUrl(asset.uri, asset.mimeType || 'image/jpeg'));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Préparation photo impossible.');
    } finally {
      setBusy(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (!name.trim()) {
      setNotice('Le nom est requis.');
      return;
    }
    setBusy(true);
    try {
      const saved: any = await api.updateMe(session.token, {
        name: name.trim(),
        bio: bio.trim(),
        avatar: avatar || undefined,
      });
      const nextSession: AuthSession = {
        token: saved?.token || session.token,
        user: {
          ...session.user,
          ...saved,
          name: saved?.name || name.trim(),
          bio: saved?.bio ?? bio.trim(),
          avatar: saved?.avatar ?? avatar,
          phone: saved?.phone ?? phone,
          isNew: false,
        },
      };
      delete (nextSession.user as any).token;
      await saveSession(nextSession);
      await AsyncStorage.setItem(storageKey, JSON.stringify({
        name: nextSession.user.name || '',
        bio: nextSession.user.bio || '',
        avatar: nextSession.user.avatar || '',
        phone: nextSession.user.phone || '',
      }));
      setUser(nextSession.user);
      setPhone(nextSession.user.phone || '');
      setNotice('Profil enregistré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement profil impossible.');
    } finally {
      setBusy(false);
    }
  }, [avatar, bio, name, phone, session.token, session.user, storageKey]);

  const shareProfile = useCallback(async () => {
    try {
      await Share.share({ title: 'Oracle Messenger', message: `Mon profil Oracle Messenger: ${profileLink}`, url: profileLink });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage du profil impossible.');
    }
  }, [profileLink]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Profil">
        <View style={styles.profileHero}>
          <Pressable onPress={pickAvatar} disabled={busy} style={styles.profileAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.profileAvatarText}>{initials(name || user.name)}</Text>}
          </Pressable>
          <Text style={styles.profileName}>{user.name || name || 'Utilisateur'}</Text>
          <Text style={styles.profileMeta}>{user.username ? `@${user.username}` : user.email || 'Oracle Messenger'}</Text>
          <SecondaryButton label="Changer la photo" onPress={pickAvatar} disabled={busy} />
        </View>
        <TextInput value={name} onChangeText={setName} placeholder="Nom public" placeholderTextColor={colors.muted} style={styles.input} />
        <TextInput value={bio} onChangeText={setBio} placeholder="Bio ou statut" placeholderTextColor={colors.muted} multiline maxLength={160} style={[styles.input, styles.textarea]} />
        <PrimaryButton label="Enregistrer" onPress={save} disabled={busy || !name.trim()} />
        <Loading active={busy} />
        <AlertText text={notice} />
      </Section>

      <Section title="Lien Oracle">
        <Text style={styles.pageCopy}>Lien public associé au username lorsque disponible.</Text>
        <View style={styles.linkBox}>
          <Text selectable style={styles.linkText}>{profileLink}</Text>
        </View>
        <SecondaryButton label="Partager mon profil" onPress={shareProfile} />
      </Section>

      <Section title="Compte">
        <InfoRow label="Email" value={user.email || session.user.email || '—'} />
        <InfoRow label="Téléphone" value={phone || 'Aucun numéro enregistré'} />
        <InfoRow label="Identifiant" value={user.id || session.user.id} />
        <InfoRow label="Statut" value={user.status || 'Standard'} />
        <Text style={styles.cardMeta}>Le numéro reste lié au compte et ne se modifie pas depuis le profil.</Text>
      </Section>

      <Section title="Paramètres">
        <InfoRow label="Confidentialité" value="Profil personnel" />
        <InfoRow label="Notifications" value="Gérées par Android" />
        <InfoRow label="Sécurité" value="Session stockée en SecureStore" />
        <InfoRow label="Stockage" value="Médias locaux dans le stockage app" />
      </Section>

      <Section title="Session">
        <SecondaryButton label="Déconnexion" onPress={onLogout} disabled={busy} />
      </Section>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function AdminPage({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [broadcastMedia, setBroadcastMedia] = useState<{ url: string; type: string; name: string } | null>(null);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [stats, metrics, users, countries, ai] = await Promise.all([
        api.adminStats(token),
        api.adminMetrics(token),
        api.adminUsers(token),
        api.adminCountries(token),
        api.adminAiAuto(token),
      ]);
      setData({ stats, metrics, users, countries, ai });
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Admin indisponible ou accès réservé.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const uploadBroadcastMedia = useCallback(async (input: { uri: string; name?: string; mime?: string; kind: string }) => {
    setBusy(true);
    setNotice('');
    try {
      const mime = input.mime || 'application/octet-stream';
      const uploaded = await api.mediaUpload(token, {
        dataUrl: await fileToDataUrl(input.uri, mime),
        name: input.name,
        mime,
        kind: input.kind,
      });
      setBroadcastMedia({ url: uploaded.url, type: uploaded.kind || input.kind, name: uploaded.name || input.name || 'media' });
      setNotice('Media admin prepare pour le message systeme.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Upload media admin impossible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const pickBroadcastMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour joindre une image ou video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.86,
      allowsEditing: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    await uploadBroadcastMedia({
      uri: asset.uri,
      name: asset.fileName || `broadcast-${Date.now()}`,
      mime: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: asset.type === 'video' ? 'video' : 'image',
    });
  }, [uploadBroadcastMedia]);

  const pickBroadcastDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    await uploadBroadcastMedia({
      uri: asset.uri,
      name: asset.name,
      mime: asset.mimeType || 'application/octet-stream',
      kind: asset.mimeType?.startsWith('audio/') ? 'audio' : 'file',
    });
  }, [uploadBroadcastMedia]);

  const broadcast = useCallback(async () => {
    if (!message.trim() && !broadcastMedia?.url) return;
    setBusy(true);
    try {
      await api.adminBroadcast(token, {
        content: message.trim(),
        mediaUrl: broadcastMedia?.url,
        type: broadcastMedia?.type || 'text',
      });
      setMessage('');
      setBroadcastMedia(null);
      setNotice('Message systeme envoye.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Message systeme impossible.');
    } finally {
      setBusy(false);
    }
  }, [broadcastMedia, message, token]);

  const notifyAll = useCallback(async () => {
    if (!notifTitle.trim() || !notifBody.trim()) return;
    setBusy(true);
    try {
      await api.adminNotify(token, { title: notifTitle.trim(), body: notifBody.trim() });
      setNotifTitle('');
      setNotifBody('');
      setNotice('Notification envoyée.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Notification impossible.');
    } finally {
      setBusy(false);
    }
  }, [notifBody, notifTitle, token]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Section title="Administration" right={<SecondaryButton label="Actualiser" onPress={load} disabled={busy} />}>
        <Text style={styles.pageCopy}>Statistiques, utilisateurs, règles IA, notifications et message système admin. Toutes les données viennent du backend.</Text>
        <Loading active={busy} />
        <AlertText text={notice} />
        <View style={styles.statsGrid}>
          <Stat label="Utilisateurs" value={data?.stats?.totalUsers ?? data?.users?.length ?? 0} />
          <Stat label="En ligne" value={data?.stats?.onlineUsers ?? 0} />
          <Stat label="Messages" value={data?.stats?.totalMessages ?? 0} />
          <Stat label="IA active" value={data?.ai?.stats?.activeUsers ?? 0} />
          <Stat label="RAM" value={`${data?.metrics?.ramPct ?? 0}%`} />
          <Stat label="PWA" value={data?.stats?.pwaInstalls ?? 0} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Serveur</Text>
          <Text style={styles.cardMeta}>CPU {data?.metrics?.cpu ?? 0}% • RAM {valueText(data?.metrics?.ramUsed)} / {valueText(data?.metrics?.ramTotal)} MB • Load {valueText(data?.metrics?.loadAvg1m)} • {data?.metrics?.platform || 'platform inconnue'}</Text>
        </View>
        <TextInput value={message} onChangeText={setMessage} placeholder="Message systeme a envoyer" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
        <View style={styles.actionRow}>
          <SecondaryButton label="Image/video" onPress={pickBroadcastMedia} disabled={busy} />
          <SecondaryButton label="Document" onPress={pickBroadcastDocument} disabled={busy} />
          {broadcastMedia ? <SecondaryButton label="Retirer media" onPress={() => setBroadcastMedia(null)} disabled={busy} /> : null}
        </View>
        {broadcastMedia ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{broadcastMedia.name}</Text>
            <Text style={styles.cardMeta}>{broadcastMedia.type} • media pret pour diffusion admin</Text>
          </View>
        ) : null}
        <PrimaryButton label="Envoyer message systeme" onPress={broadcast} disabled={busy || (!message.trim() && !broadcastMedia?.url)} />
      </Section>

      <Section title="Notification globale">
        <TextInput value={notifTitle} onChangeText={setNotifTitle} placeholder="Titre notification" placeholderTextColor={colors.muted} style={styles.input} />
        <TextInput value={notifBody} onChangeText={setNotifBody} placeholder="Message notification" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
        <PrimaryButton label="Envoyer notification" onPress={notifyAll} disabled={busy || !notifTitle.trim() || !notifBody.trim()} />
      </Section>

      <Section title="Pays">
        {!data?.countries?.length ? <Text style={styles.empty}>Aucune statistique pays.</Text> : null}
        {data?.countries?.slice?.(0, 10)?.map((country: any) => (
          <View key={country.country || country.name} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{country.country || country.name || 'Pays'}</Text>
            <Text style={styles.infoValue}>{valueText(country.count)} utilisateur(s) • {valueText(country.online)} en ligne</Text>
          </View>
        ))}
      </Section>

      <Section title="Utilisateurs récents">
        {data?.users?.slice?.(0, 12)?.map((user: User) => <UserRow key={user.id || user.email} user={user} />)}
      </Section>

      <Section title="IA Admin">
        <View style={styles.statsGrid}>
          <Stat label="Usage" value={data?.ai?.stats?.usageCount ?? 0} />
          <Stat label="Mots" value={data?.ai?.stats?.wordsConsumed ?? 0} />
          <Stat label="Plans" value={data?.ai?.plans?.length ?? 0} />
          <Stat label="Réglages" value={data?.ai?.settings?.length ?? 0} />
        </View>
        {data?.ai?.plans?.slice?.(0, 8)?.map((plan: any) => (
          <View key={plan.code} style={styles.card}>
            <Text style={styles.cardTitle}>{plan.label || plan.code}</Text>
            <Text style={styles.cardMeta}>{plan.enabled ? 'Actif' : 'Inactif'} • {valueText(plan.priceFcfa)} FCFA • {valueText(plan.words)} mots</Text>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

export function NativeFeaturePage({ tab, session, onOpenConversation, onRefreshConversations, onLogout }: FeatureProps) {
  const token = session.token;
  if (tab === 'contacts') return <ContactsPage token={token} onOpenConversation={onOpenConversation} onRefreshConversations={onRefreshConversations} />;
  if (tab === 'stories') return <StoriesPage token={token} userId={session.user.id} />;
  if (tab === 'gallery') return <GalleryPage token={token} userId={session.user.id} />;
  if (tab === 'tools') return <ToolsPage token={token} ownerId={session.user.id || session.user.email || token} userName={session.user.name || session.user.email || 'Utilisateur'} />;
  if (tab === 'ai') return <ToolsPage token={token} ownerId={session.user.id || session.user.email || token} userName={session.user.name || session.user.email || 'Utilisateur'} initialMode="ai" />;
  if (tab === 'flyers') return <ToolsPage token={token} ownerId={session.user.id || session.user.email || token} userName={session.user.name || session.user.email || 'Utilisateur'} initialMode="flyer" />;
  if (tab === 'videos') return <ToolsPage token={token} ownerId={session.user.id || session.user.email || token} userName={session.user.name || session.user.email || 'Utilisateur'} initialMode="video" />;
  if (tab === 'payments') return <PaymentsPage token={token} />;
  if (tab === 'business') return <BusinessPage token={token} />;
  if (tab === 'profile') return <ProfilePage session={session} onLogout={onLogout} />;
  if (tab === 'admin') return <AdminPage token={token} />;
  return null;
}

export function isAdminSession(session: AuthSession | null) {
  const email = session?.user?.email?.toLowerCase();
  return email === 'tchingankonggeorges@gmail.com' || email === 'tchingangankonggeorges@gmail.com';
}

export function useVisibleTabs(session: AuthSession | null) {
  return useMemo(() => NATIVE_TABS.filter(tab => tab.key !== 'admin' || isAdminSession(session)), [session]);
}

const styles = StyleSheet.create({
  page: { padding: 12, paddingBottom: 96, gap: 12 },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  primaryButton: { minHeight: 48, borderRadius: 15, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { minHeight: 40, borderRadius: 14, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.header, fontSize: 12.5, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  loader: { marginVertical: 6 },
  alert: { color: '#9A3412', backgroundColor: '#FFF7ED', borderRadius: 12, padding: 10, fontSize: 12.5, lineHeight: 18, fontWeight: '800' },
  empty: { color: colors.muted, fontSize: 13, fontWeight: '800', paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 15, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontWeight: '900', fontSize: 14 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900' },
  rowSub: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  profileHero: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  profileAvatar: { width: 112, height: 112, borderRadius: 40, overflow: 'hidden', backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  profileAvatarText: { color: colors.header, fontWeight: '900', fontSize: 32 },
  profileName: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  profileMeta: { color: colors.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
  linkBox: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F8FAFC', padding: 12 },
  linkText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '900', flexShrink: 0 },
  infoValue: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '800', flex: 1, textAlign: 'right' },
  card: { borderRadius: 16, padding: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, gap: 5 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardText: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', minHeight: 74, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 10, justifyContent: 'center' },
  statValue: { color: colors.header, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 3 },
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
  subPanel: { gap: 10 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  inlineInput: { flex: 1, minWidth: 130 },
  chatPanel: { borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  aiBubble: { maxWidth: '92%', borderRadius: 16, padding: 10, gap: 4 },
  aiClient: { alignSelf: 'flex-end', backgroundColor: '#DCFCE7' },
  aiAgent: { alignSelf: 'flex-start', backgroundColor: '#EAF4F1' },
  aiFrom: { color: colors.muted, fontSize: 10.5, fontWeight: '900' },
  aiText: { color: colors.text, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
});
