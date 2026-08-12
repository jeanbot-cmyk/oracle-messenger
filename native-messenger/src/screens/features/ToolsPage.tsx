import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import {
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Languages,
  NotebookPen,
  Search,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react-native';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { api } from '@/services/api';
import { cancelLocalReminder, scheduleLocalReminder } from '@/services/notifications';
import { colors } from '@/theme/colors';
import { AlertText, Loading, PrimaryButton, SecondaryButton } from './FeatureUi';

type ToolTab = 'meeting' | 'ai' | 'flyer' | 'video' | 'translate' | 'notes' | 'events';
type ToolsMode = ToolTab | 'directory';
type LocalNote = { id: string; title: string; body: string; updatedAt: number };
type LocalEvent = { id: string; title: string; date: string; time: string; note: string; createdAt: number; notificationId?: string };
type AiMessage = { id: string; from: 'client' | 'agent'; text: string };
type DirectoryTool = { tab: NativeTabKey; icon: typeof BriefcaseBusiness; title: string; subtitle: string };
type GeneratedCreation = { id: string; type: 'flyer' | 'video'; url: string; prompt: string; createdAt: number };
type AiPlan = { code: string; label: string; priceFcfa: number; words: number; enabled?: boolean };
type AiUsage = { id?: string; mode?: string; words?: number; createdAt?: string };
type ReferenceImage = { dataUrl: string; mime: string; name?: string };

const DEFAULT_AI_PROMPT = 'Tu es l’assistant commercial de mon entreprise. Réponds de façon claire, utile, professionnelle, courte et polie.';
const AI_VIDEO_FREE_DURATION_SECONDS = 8;
const AI_VIDEO_PREMIUM_DURATION_SECONDS = 45;
const AI_VIDEO_PREMIUM_PRICE_FCFA = 3000;
const DEFAULT_AI_PLANS: AiPlan[] = [
  { code: 'activation_1500', label: 'Activation IA Premium', priceFcfa: 1500, words: 750 },
  { code: 'recharge_2000', label: 'Recharge 3 000 mots', priceFcfa: 2000, words: 3000 },
  { code: 'recharge_5000', label: 'Recharge 8 000 mots', priceFcfa: 5000, words: 8000 },
];
const AI_DELAY_OPTIONS = [
  { value: 0, label: 'Immédiat' },
  { value: 1000, label: '1 seconde' },
  { value: 5000, label: '5 secondes' },
  { value: 10000, label: '10 secondes' },
  { value: 30000, label: '30 secondes' },
  { value: 60000, label: '1 minute' },
  { value: 120000, label: '2 minutes' },
  { value: 300000, label: '5 minutes' },
];
const AI_MAX_WORD_OPTIONS = [
  { value: 30, label: '30 mots' },
  { value: 50, label: '50 mots' },
  { value: 80, label: '80 mots' },
  { value: 120, label: '120 mots' },
  { value: 200, label: '200 mots' },
  { value: 300, label: '300 mots' },
];
const AI_SCOPE_OPTIONS = [
  { value: 'everyone', label: 'Tout le monde' },
  { value: 'private_only', label: 'Discussions privées' },
  { value: 'friends', label: 'Contacts' },
  { value: 'non_friends', label: 'Nouveaux contacts' },
  { value: 'groups_only', label: 'Groupes' },
];
const TRANSLATE_LANGUAGES = [
  { value: 'af', label: 'Afrikaans' },
  { value: 'ak', label: 'Akan' },
  { value: 'am', label: 'Amharique' },
  { value: 'ar', label: 'Arabe' },
  { value: 'as', label: 'Assamais' },
  { value: 'ay', label: 'Aymara' },
  { value: 'az', label: 'Azéri' },
  { value: 'be', label: 'Biélorusse' },
  { value: 'bg', label: 'Bulgare' },
  { value: 'bho', label: 'Bhojpuri' },
  { value: 'bm', label: 'Bambara' },
  { value: 'bn', label: 'Bengali' },
  { value: 'bs', label: 'Bosniaque' },
  { value: 'ca', label: 'Catalan' },
  { value: 'ceb', label: 'Cebuano' },
  { value: 'ckb', label: 'Kurde sorani' },
  { value: 'co', label: 'Corse' },
  { value: 'cs', label: 'Tchèque' },
  { value: 'cy', label: 'Gallois' },
  { value: 'da', label: 'Danois' },
  { value: 'de', label: 'Allemand' },
  { value: 'doi', label: 'Dogri' },
  { value: 'dv', label: 'Divehi' },
  { value: 'ee', label: 'Ewe' },
  { value: 'el', label: 'Grec' },
  { value: 'en', label: 'Anglais' },
  { value: 'eo', label: 'Espéranto' },
  { value: 'es', label: 'Espagnol' },
  { value: 'et', label: 'Estonien' },
  { value: 'eu', label: 'Basque' },
  { value: 'fa', label: 'Persan' },
  { value: 'fi', label: 'Finnois' },
  { value: 'fil', label: 'Filipino' },
  { value: 'fr', label: 'Français' },
  { value: 'fy', label: 'Frison' },
  { value: 'ga', label: 'Irlandais' },
  { value: 'gd', label: 'Gaélique écossais' },
  { value: 'gl', label: 'Galicien' },
  { value: 'gn', label: 'Guarani' },
  { value: 'gom', label: 'Konkani' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'ha', label: 'Haoussa' },
  { value: 'haw', label: 'Hawaïen' },
  { value: 'he', label: 'Hébreu' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hmn', label: 'Hmong' },
  { value: 'hr', label: 'Croate' },
  { value: 'ht', label: 'Créole haïtien' },
  { value: 'hu', label: 'Hongrois' },
  { value: 'hy', label: 'Arménien' },
  { value: 'id', label: 'Indonésien' },
  { value: 'ig', label: 'Igbo' },
  { value: 'ilo', label: 'Ilocano' },
  { value: 'is', label: 'Islandais' },
  { value: 'it', label: 'Italien' },
  { value: 'ja', label: 'Japonais' },
  { value: 'jv', label: 'Javanais' },
  { value: 'ka', label: 'Géorgien' },
  { value: 'kk', label: 'Kazakh' },
  { value: 'km', label: 'Khmer' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ko', label: 'Coréen' },
  { value: 'kri', label: 'Krio' },
  { value: 'ku', label: 'Kurde' },
  { value: 'ky', label: 'Kirghize' },
  { value: 'la', label: 'Latin' },
  { value: 'lb', label: 'Luxembourgeois' },
  { value: 'lg', label: 'Luganda' },
  { value: 'ln', label: 'Lingala' },
  { value: 'lo', label: 'Lao' },
  { value: 'lt', label: 'Lituanien' },
  { value: 'lus', label: 'Mizo' },
  { value: 'lv', label: 'Letton' },
  { value: 'mai', label: 'Maithili' },
  { value: 'mg', label: 'Malgache' },
  { value: 'mi', label: 'Maori' },
  { value: 'mk', label: 'Macédonien' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'mn', label: 'Mongol' },
  { value: 'mni-Mtei', label: 'Meitei' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ms', label: 'Malais' },
  { value: 'mt', label: 'Maltais' },
  { value: 'my', label: 'Birman' },
  { value: 'ne', label: 'Népalais' },
  { value: 'nl', label: 'Néerlandais' },
  { value: 'no', label: 'Norvégien' },
  { value: 'nso', label: 'Sepedi' },
  { value: 'ny', label: 'Chichewa' },
  { value: 'om', label: 'Oromo' },
  { value: 'or', label: 'Odia' },
  { value: 'pa', label: 'Pendjabi' },
  { value: 'pl', label: 'Polonais' },
  { value: 'ps', label: 'Pachto' },
  { value: 'pt', label: 'Portugais' },
  { value: 'qu', label: 'Quechua' },
  { value: 'ro', label: 'Roumain' },
  { value: 'ru', label: 'Russe' },
  { value: 'rw', label: 'Kinyarwanda' },
  { value: 'sa', label: 'Sanskrit' },
  { value: 'sd', label: 'Sindhi' },
  { value: 'si', label: 'Cinghalais' },
  { value: 'sk', label: 'Slovaque' },
  { value: 'sl', label: 'Slovène' },
  { value: 'sm', label: 'Samoan' },
  { value: 'sn', label: 'Shona' },
  { value: 'so', label: 'Somali' },
  { value: 'sq', label: 'Albanais' },
  { value: 'sr', label: 'Serbe' },
  { value: 'st', label: 'Sesotho' },
  { value: 'su', label: 'Soundanais' },
  { value: 'sv', label: 'Suédois' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ta', label: 'Tamoul' },
  { value: 'te', label: 'Télougou' },
  { value: 'tg', label: 'Tadjik' },
  { value: 'th', label: 'Thaï' },
  { value: 'ti', label: 'Tigrinya' },
  { value: 'tk', label: 'Turkmène' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'tr', label: 'Turc' },
  { value: 'ts', label: 'Tsonga' },
  { value: 'tt', label: 'Tatar' },
  { value: 'ug', label: 'Ouïghour' },
  { value: 'uk', label: 'Ukrainien' },
  { value: 'ur', label: 'Ourdou' },
  { value: 'uz', label: 'Ouzbek' },
  { value: 'vi', label: 'Vietnamien' },
  { value: 'xh', label: 'Xhosa' },
  { value: 'yi', label: 'Yiddish' },
  { value: 'yo', label: 'Yoruba' },
  { value: 'zh-CN', label: 'Chinois simplifié' },
  { value: 'zh-TW', label: 'Chinois traditionnel' },
  { value: 'zu', label: 'Zoulou' },
];

const PRIMARY_DIRECTORY_TOOLS: DirectoryTool[] = [
  { tab: 'business', icon: BriefcaseBusiness, title: 'Business Assistant', subtitle: 'Fiches clients, relances, notes et réponses professionnelles.' },
  { tab: 'flyers', icon: Wand2, title: 'Créer un flyer IA', subtitle: "Créez des affiches et des flyers professionnels avec l'intelligence artificielle en quelques secondes." },
  { tab: 'videos', icon: Sparkles, title: 'IA Vidéo', subtitle: 'Créez vos vidéos de présentation IA avec images de référence, voix off et musique.' },
  { tab: 'gallery', icon: ImageIcon, title: 'Ma Galerie', subtitle: 'Voir et gérer vos photos retouchées.' },
];

const SMART_DIRECTORY_TOOLS: DirectoryTool[] = [
  { tab: 'ai', icon: Bot, title: 'Réponses IA', subtitle: 'Préparer des réponses automatiques avec un prompt contrôlé.' },
  { tab: 'translate', icon: Languages, title: 'Traduction', subtitle: 'Rédiger, reformuler ou traduire un message avant envoi.' },
  { tab: 'meeting', icon: Video, title: 'Réunion Vidéo', subtitle: 'Démarrez ou rejoignez une réunion instantanément.' },
  { tab: 'notes', icon: NotebookPen, title: 'Notes', subtitle: 'Notes locales conservées sur ce téléphone.' },
  { tab: 'events', icon: CalendarDays, title: 'Rappels', subtitle: 'Rappels locaux avec notification Android.' },
];

const TOOL_TABS: { mode: ToolTab; label: string }[] = [
  { mode: 'meeting', label: '🎥 Réunion' },
  { mode: 'flyer', label: '✨ Flyer IA' },
  { mode: 'video', label: '🎬 IA Vidéo' },
  { mode: 'ai', label: '🤖 Réponse IA' },
  { mode: 'translate', label: '🌍 Traduction' },
  { mode: 'notes', label: '📝 Notes' },
  { mode: 'events', label: '📅 Rappels' },
];

function ownerKey(base: string, ownerId: string) {
  return `${base}:${ownerId || 'local'}`;
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '0';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function formatNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString('fr-FR') : '0';
}

function formatFcfa(value: unknown) {
  const numeric = Number(value ?? 0);
  return `${Number.isFinite(numeric) ? numeric.toLocaleString('fr-FR') : '0'} FCFA`;
}

function labelForDelay(value: number) {
  return AI_DELAY_OPTIONS.find(item => item.value === value)?.label || `${Math.max(0, Math.round(value / 1000))} secondes`;
}

function labelForMaxWords(value: number, paidActive: boolean) {
  if (!paidActive) return '30 mots gratuit';
  return AI_MAX_WORD_OPTIONS.find(item => item.value === value)?.label || `${Math.max(30, Math.round(value))} mots`;
}

function labelForScope(value: string) {
  return AI_SCOPE_OPTIONS.find(item => item.value === value)?.label || 'Tout le monde';
}

function labelForTranslateTarget(value: string) {
  const normalized = normalizeTranslateCode(value) || 'fr';
  return TRANSLATE_LANGUAGES.find(item => normalizeTranslateCode(item.value) === normalized)?.label || normalized.toUpperCase();
}

function normalizeTranslateCode(value: string) {
  const clean = String(value || '').trim().replace(/_/g, '-');
  return /^[a-z]{2,8}(-[a-z0-9]{2,8}){0,2}$/i.test(clean) ? clean : '';
}

function formatAiUsageMode(mode?: string) {
  if (mode === 'free_test' || mode === 'test') return 'Test IA';
  if (mode === 'auto') return 'Auto-réponse';
  if (!mode) return 'Historique IA';
  return mode.replace(/_/g, ' ');
}

function formatAiDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR');
}

function mimeFromUri(uri: string, fallback = 'image/jpeg') {
  const clean = uri.split('?')[0]?.toLowerCase() || '';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

async function imageAssetToReference(asset: ImagePicker.ImagePickerAsset): Promise<ReferenceImage> {
  const mime = asset.mimeType || mimeFromUri(asset.uri);
  const base64 = asset.base64 || await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return {
    dataUrl: `data:${mime};base64,${base64}`,
    mime,
    name: asset.fileName || asset.uri.split('/').pop() || `reference-${Date.now()}.jpg`,
  };
}

function extractAiPlans(overview: any): AiPlan[] {
  const plans = Array.isArray(overview?.plans) ? overview.plans : [];
  const activePlans = plans
    .filter((plan: any) => plan && plan.enabled !== false)
    .map((plan: any) => ({
      code: String(plan.code || ''),
      label: String(plan.label || 'Recharge IA'),
      priceFcfa: Number(plan.priceFcfa ?? plan.price ?? 0),
      words: Number(plan.words ?? 0),
    }))
    .filter((plan: AiPlan) => plan.code);
  return activePlans.length ? activePlans : DEFAULT_AI_PLANS;
}

function extractAiUsage(overview: any): AiUsage[] {
  return Array.isArray(overview?.usage) ? overview.usage : [];
}

function parseReminderDate(date: string, time: string) {
  const cleanDate = date.trim();
  if (!cleanDate) return null;
  const cleanTime = time.trim() || '09:00';
  const candidate = cleanDate.includes('T') ? cleanDate : `${cleanDate}T${cleanTime}:00`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function meetingRoomSlug(value: string) {
  const raw = value.trim() || 'oracle-votre-salle';
  const withoutHost = raw.replace(/^https?:\/\/meet\.jit\.si\//i, '');
  return withoutHost
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'oracle-votre-salle';
}

function meetingUrlFrom(value: string) {
  const clean = value.trim();
  if (/^https?:\/\//i.test(clean)) return clean;
  return `https://meet.jit.si/${encodeURIComponent(meetingRoomSlug(clean))}`;
}

function FlyerStat({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.flyerStat}>
      <Text numberOfLines={1} style={styles.flyerStatValue}>{valueText(value)}</Text>
      <Text numberOfLines={1} style={styles.flyerStatLabel}>{label}</Text>
    </View>
  );
}

function NativeSelectBox({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={styles.aiSelectBlock}>
      <Text style={styles.aiSelectLabel}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.aiSelectBox, pressed && styles.aiPressed]}>
        <Text numberOfLines={1} style={styles.aiSelectValue}>{value}</Text>
        <ChevronDown size={22} color={colors.text} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function AiPrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.aiPrimaryButton, pressed && !disabled && styles.aiPressed, disabled && styles.aiDisabled]}>
      <Text style={styles.aiPrimaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function AiPlanRow({ plan, disabled, onPress }: { plan: AiPlan; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.aiPlanRow, pressed && !disabled && styles.aiPressed, disabled && styles.aiDisabled]}>
      <Text style={styles.aiPlanTitle}>{plan.label}</Text>
      <Text style={styles.aiPlanSub}>{formatFcfa(plan.priceFcfa)} · {formatNumber(plan.words)} mots</Text>
    </Pressable>
  );
}

function AiHistoryRow({ item }: { item: AiUsage }) {
  return (
    <View style={styles.aiHistoryRow}>
      <Text numberOfLines={1} style={styles.aiHistoryTitle}>{formatAiUsageMode(item.mode)} · {formatNumber(item.words)} mots</Text>
      <Text style={styles.aiHistoryDate}>{formatAiDate(item.createdAt)}</Text>
    </View>
  );
}

function VideoOptionPill({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.videoOptionPill, active && styles.videoOptionPillActive, pressed && styles.aiPressed]}
    >
      <Text numberOfLines={1} style={[styles.videoOptionText, active && styles.videoOptionTextActive]}>{label}</Text>
    </Pressable>
  );
}

function DirectoryRow({ item, onOpenTab }: { item: DirectoryTool; onOpenTab: (tab: NativeTabKey) => void }) {
  const Icon = item.icon;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpenTab(item.tab)}
      android_ripple={{ color: 'rgba(16,42,42,0.06)' }}
      style={({ pressed }) => [styles.directoryRow, pressed && styles.directoryRowPressed]}
    >
      <View style={styles.directoryIcon}>
        <Icon size={27} color={colors.header} strokeWidth={1.9} />
      </View>
      <View style={styles.directoryCopy}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.directoryTitle}>{item.title}</Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.08} style={styles.directorySub}>{item.subtitle}</Text>
      </View>
      <ChevronRight size={24} color="#CBD5E1" strokeWidth={2.2} />
    </Pressable>
  );
}

function ToolsDirectory({ onOpenTab }: { onOpenTab: (tab: NativeTabKey) => void }) {
  const [query, setQuery] = useState('');
  const filterTools = useCallback((items: DirectoryTool[]) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(item => `${item.title} ${item.subtitle}`.toLowerCase().includes(needle));
  }, [query]);
  const primaryTools = filterTools(PRIMARY_DIRECTORY_TOOLS);
  const smartTools = filterTools(SMART_DIRECTORY_TOOLS);

  return (
    <ScrollView contentContainerStyle={styles.directoryPage} keyboardShouldPersistTaps="handled">
      <View style={styles.directorySearchWrap}>
        <View style={styles.directorySearchRow}>
          <Search size={22} color="#64748B" strokeWidth={2.1} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher..."
            placeholderTextColor="#94A3B8"
            style={styles.directorySearchInput}
          />
        </View>
      </View>

      {primaryTools.length ? (
        <>
          <Text style={styles.directorySectionLabel}>ACTIONS PRINCIPALES</Text>
          <View style={styles.directorySection}>
            {primaryTools.map(item => <DirectoryRow key={`${item.tab}-${item.title}`} item={item} onOpenTab={onOpenTab} />)}
          </View>
        </>
      ) : null}

      {smartTools.length ? (
        <>
          <Text style={styles.directorySectionLabel}>COMMUNICATION INTELLIGENTE</Text>
          <View style={styles.directorySection}>
            {smartTools.map(item => <DirectoryRow key={`${item.tab}-${item.title}`} item={item} onOpenTab={onOpenTab} />)}
          </View>
        </>
      ) : null}

      {!primaryTools.length && !smartTools.length ? (
        <View style={styles.directoryEmpty}>
          <Text style={styles.directoryTitle}>Aucun outil trouvé</Text>
          <Text style={styles.directorySub}>Essayez une autre recherche.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function MeetingTool({ userName }: { userName: string }) {
  const [room, setRoom] = useState('');
  const [active, setActive] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [joinRoom, setJoinRoom] = useState('');
  const [notice, setNotice] = useState('');

  const previewLink = meetingUrlFrom(room || 'oracle-votre-salle');
  const shareLink = roomName ? meetingUrlFrom(roomName) : '';

  const openMeetingLink = useCallback(async (target: string) => {
    try {
      const separator = target.includes('#') ? '&' : '#';
      await Linking.openURL(`${target}${separator}userInfo.displayName="${encodeURIComponent(userName)}"`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ouverture de la réunion impossible.');
    }
  }, [userName]);

  const createMeetingLink = useCallback(() => {
    const nextRoom = meetingRoomSlug(room.trim() || `oracle-${Math.random().toString(36).slice(2, 8)}`);
    setRoomName(nextRoom);
    setActive(true);
    setNotice('Réunion prête. Appuyez sur Ouvrir la réunion pour entrer, puis partagez le lien aux invités.');
  }, [room]);

  const shareMeeting = useCallback(async () => {
    const link = shareLink || previewLink;
    try {
      await Share.share({ title: 'Rejoins ma réunion', message: link, url: link });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage de la réunion impossible.');
    }
  }, [previewLink, shareLink]);

  const copyMeetingLink = useCallback(async () => {
    const link = shareLink || previewLink;
    await Clipboard.setStringAsync(link);
    setNotice('Lien copié.');
  }, [previewLink, shareLink]);

  const endMeeting = useCallback(() => {
    setActive(false);
    setRoom('');
    setRoomName('');
    setNotice('Réunion terminée.');
  }, []);

  const joinMeeting = useCallback(() => {
    const target = joinRoom.trim();
    if (!target) {
      setNotice('Entrez un lien ou un nom de salle.');
      return;
    }
    void openMeetingLink(meetingUrlFrom(target));
  }, [joinRoom, openMeetingLink]);

  return (
    <View style={styles.meetingPage}>
      <View style={styles.meetingInfoCard}>
        <Text style={styles.meetingInfoTitle}>Réunion vidéo</Text>
        <Text style={styles.meetingInfoLine}>1. Appuyez sur “Créer le lien”.</Text>
        <Text style={styles.meetingInfoLine}>2. Appuyez sur “Ouvrir la réunion” pour entrer.</Text>
        <Text style={styles.meetingInfoLine}>3. Partagez le lien aux invités.</Text>
        <Text style={styles.meetingAdvice}>Conseil : sur Android, Chrome donne souvent une meilleure compatibilité micro/caméra que certains navigateurs intégrés.</Text>
      </View>

      <View style={styles.meetingCard}>
        <Text style={styles.meetingSectionTitle}>NOUVELLE RÉUNION</Text>
        <TextInput
          value={room}
          onChangeText={text => {
            setRoom(text);
            if (active) {
              setActive(false);
              setRoomName('');
            }
          }}
          placeholder="Nom de la salle (optionnel)"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          style={styles.meetingInput}
        />
        <View style={styles.meetingPreviewBox}>
          <Text style={styles.meetingPreviewLabel}>Lien prévu</Text>
          <Text numberOfLines={2} style={styles.meetingPreviewValue}>{previewLink}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={createMeetingLink} style={({ pressed }) => [styles.meetingPrimaryButton, pressed && styles.aiPressed]}>
          <Text style={styles.meetingPrimaryText}>🎥 Créer le lien</Text>
        </Pressable>
      </View>

      {active && roomName ? (
        <View style={styles.meetingReadyCard}>
          <Text style={styles.meetingReadyTitle}>✅ Réunion : <Text style={styles.meetingReadyRoom}>{roomName}</Text></Text>
          <Text style={styles.meetingReadyNotice}>{notice || 'Réunion prête. Appuyez sur Ouvrir la réunion pour entrer, puis partagez le lien aux invités.'}</Text>
          <View style={styles.meetingShareBox}>
            <Text numberOfLines={2} style={styles.meetingShareLink}>{shareLink}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => openMeetingLink(shareLink)} style={({ pressed }) => [styles.meetingPrimaryButton, styles.meetingCreatedButton, pressed && styles.aiPressed]}>
            <Text style={styles.meetingPrimaryText}>🎥 Ouvrir la réunion</Text>
          </Pressable>
          <View style={styles.meetingActionRow}>
            <Pressable accessibilityRole="button" onPress={copyMeetingLink} style={({ pressed }) => [styles.meetingCopyButton, pressed && styles.aiPressed]}>
              <Text style={styles.meetingCopyText}>📋 Copier</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={shareMeeting} style={({ pressed }) => [styles.meetingShareButton, pressed && styles.aiPressed]}>
              <Text style={styles.meetingShareText}>📤 Partager</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={endMeeting} style={({ pressed }) => [styles.meetingEndButton, pressed && styles.aiPressed]}>
            <Text style={styles.meetingEndText}>✖ Terminer</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.meetingCard}>
        <Text style={styles.meetingSectionTitle}>REJOINDRE UNE RÉUNION</Text>
        <View style={styles.meetingJoinRow}>
          <TextInput
            value={joinRoom}
            onChangeText={setJoinRoom}
            placeholder="Lien ou nom de salle"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            style={[styles.meetingInput, styles.meetingJoinInput]}
          />
          <Pressable accessibilityRole="button" onPress={joinMeeting} style={({ pressed }) => [styles.meetingJoinButton, pressed && styles.aiPressed]}>
            <Text style={styles.meetingJoinText}>Rejoindre</Text>
          </Pressable>
        </View>
      </View>
      <AlertText text={notice} />
    </View>
  );
}

function TranslateTool({ token }: { token: string }) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('fr');
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState('');
  const [customTarget, setCustomTarget] = useState('');
  const [result, setResult] = useState('');
  const [provider, setProvider] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const filteredLanguages = useMemo(() => {
    const needle = languageQuery.trim().toLowerCase();
    if (!needle) return TRANSLATE_LANGUAGES;
    return TRANSLATE_LANGUAGES.filter(item => (
      item.label.toLowerCase().includes(needle) ||
      item.value.toLowerCase().includes(needle)
    ));
  }, [languageQuery]);

  const translate = useCallback(async () => {
    const text = source.trim();
    if (!text) return;
    const targetCode = normalizeTranslateCode(target) || 'fr';
    setBusy(true);
    setNotice('');
    setResult('');
    try {
      const data = await api.aiAutoTranslate(token, text, targetCode);
      setResult(data.translated);
      setProvider(data.provider);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Traduction impossible.');
    } finally {
      setBusy(false);
    }
  }, [source, target, token]);

  const selectLanguage = useCallback((value: string) => {
    setTarget(value);
    setLanguagePickerOpen(false);
    setLanguageQuery('');
    setCustomTarget('');
    setNotice('');
  }, []);

  const applyCustomLanguage = useCallback(() => {
    const code = normalizeTranslateCode(customTarget);
    if (!code) {
      setNotice('Entrez un code langue Google valide, exemple : sw, yo, hi, zh-CN.');
      return;
    }
    selectLanguage(code);
  }, [customTarget, selectLanguage]);

  return (
    <View style={styles.capacitorCard}>
      <Text style={styles.capacitorCardTitle}>Traduction</Text>
      <Text style={styles.capacitorLead}>Traduisez avec Google Translate. Choisissez une langue ou entrez directement son code Google.</Text>
      <Pressable accessibilityRole="button" style={styles.languageSelect} onPress={() => setLanguagePickerOpen(current => !current)}>
        <Text style={styles.languageSelectText}>{labelForTranslateTarget(target)}</Text>
        <ChevronDown size={20} color={colors.text} strokeWidth={2.1} />
      </Pressable>
      {languagePickerOpen ? (
        <View style={styles.languagePickerPanel}>
          <TextInput
            value={languageQuery}
            onChangeText={setLanguageQuery}
            placeholder="Rechercher une langue..."
            placeholderTextColor="#94A3B8"
            style={styles.languageSearchInput}
          />
          <View style={styles.languageCustomRow}>
            <TextInput
              value={customTarget}
              onChangeText={setCustomTarget}
              autoCapitalize="none"
              placeholder="Code Google : sw, yo, hi, zh-CN..."
              placeholderTextColor="#94A3B8"
              style={styles.languageCustomInput}
            />
            <Pressable accessibilityRole="button" onPress={applyCustomLanguage} style={({ pressed }) => [styles.languageUseButton, pressed && styles.aiPressed]}>
              <Text style={styles.languageUseText}>Utiliser</Text>
            </Pressable>
          </View>
          <ScrollView nestedScrollEnabled style={styles.languageList} contentContainerStyle={styles.languageListContent}>
            {filteredLanguages.map(item => {
              const selected = normalizeTranslateCode(item.value) === normalizeTranslateCode(target);
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => selectLanguage(item.value)}
                  style={({ pressed }) => [styles.languageOption, selected && styles.languageOptionActive, pressed && styles.aiPressed]}
                >
                  <Text numberOfLines={1} style={[styles.languageOptionLabel, selected && styles.languageOptionLabelActive]}>{item.label}</Text>
                  <Text style={[styles.languageOptionCode, selected && styles.languageOptionCodeActive]}>{item.value}</Text>
                </Pressable>
              );
            })}
            {!filteredLanguages.length ? (
              <Text style={styles.languageEmpty}>Aucune langue dans la liste. Entrez le code Google dans le champ ci-dessus.</Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
      <TextInput
        value={source}
        onChangeText={setSource}
        placeholder="Texte à traduire..."
        placeholderTextColor="#94A3B8"
        multiline
        style={[styles.input, styles.capacitorTextarea]}
      />
      <PrimaryButton label="Traduire avec Google" onPress={translate} disabled={busy || !source.trim()} />
      <Loading active={busy} />
      <AlertText text={notice} />
      {result ? (
        <View style={styles.resultCard}>
          <Text style={styles.cardTitle}>Résultat</Text>
          <Text style={styles.cardText}>{result}</Text>
          <Text style={styles.cardMeta}>{provider === 'google' ? 'Source : Google Traduction' : 'Source : dictionnaire local, Google indisponible'}</Text>
        </View>
      ) : null}
    </View>
  );
}

function NotesTool({ ownerId }: { ownerId: string }) {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [editing, setEditing] = useState<LocalNote | null>(null);
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

  const openNew = useCallback(() => {
    setEditing({ id: '', title: '', body: '', updatedAt: 0 });
    setTitle('');
    setBody('');
  }, []);

  const openEdit = useCallback((note: LocalNote) => {
    setEditing(note);
    setTitle(note.title);
    setBody(note.body);
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setTitle('');
    setBody('');
  }, []);

  const save = useCallback(async () => {
    if (!editing) return;
    if (!title.trim() && !body.trim()) {
      closeEditor();
      return;
    }
    const note: LocalNote = {
      id: editing.id || `${Date.now()}`,
      title: title.trim(),
      body: body.trim(),
      updatedAt: Date.now(),
    };
    const updated = editing.id
      ? notes.map(item => item.id === editing.id ? note : item)
      : [note, ...notes];
    await persist(updated.slice(0, 120));
    closeEditor();
  }, [body, closeEditor, editing, notes, persist, title]);

  const remove = useCallback(async (id: string) => {
    await persist(notes.filter(note => note.id !== id));
  }, [notes, persist]);

  if (editing) {
    return (
      <View style={styles.notesEditor}>
        <View style={styles.notesEditorHeader}>
          <Pressable accessibilityRole="button" onPress={closeEditor} style={({ pressed }) => [styles.notesBackButton, pressed && styles.aiPressed]}>
            <Text style={styles.notesBackText}>←</Text>
          </Pressable>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Titre de la note"
            placeholderTextColor="#94A3B8"
            style={styles.notesTitleInput}
          />
          <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => [styles.notesSaveButton, pressed && styles.aiPressed]}>
            <Text style={styles.notesSaveText}>Sauver</Text>
          </Pressable>
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Écrivez votre note ici..."
          placeholderTextColor="#94A3B8"
          multiline
          textAlignVertical="top"
          style={styles.notesBodyInput}
        />
      </View>
    );
  }

  return (
    <View style={styles.notesList}>
      <Pressable accessibilityRole="button" onPress={openNew} style={({ pressed }) => [styles.notesNewButton, pressed && styles.aiPressed]}>
        <Text style={styles.notesNewButtonText}>+ Nouvelle note</Text>
      </Pressable>
      {!notes.length ? (
        <View style={styles.notesEmpty}>
          <Text style={styles.notesEmptyIcon}>📝</Text>
          <Text style={styles.notesEmptyText}>Aucune note pour l’instant</Text>
        </View>
      ) : null}
      {notes.map(note => (
        <View key={note.id} style={styles.noteRow}>
          <Pressable accessibilityRole="button" onPress={() => openEdit(note)} style={({ pressed }) => [styles.noteRowBody, pressed && styles.aiPressed]}>
            <Text numberOfLines={1} style={styles.noteRowTitle}>{note.title || '(sans titre)'}</Text>
            <Text numberOfLines={2} style={styles.noteRowText}>{note.body}</Text>
            <Text style={styles.noteRowDate}>{new Date(note.updatedAt).toLocaleDateString('fr-FR')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Supprimer la note" onPress={() => remove(note.id)} style={({ pressed }) => [styles.noteDeleteButton, pressed && styles.aiPressed]}>
            <Text style={styles.noteDeleteText}>🗑</Text>
          </Pressable>
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
  const [notice, setNotice] = useState('');
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
    const scheduledAt = parseReminderDate(date, time);
    if (!scheduledAt) {
      setNotice('Date invalide. Utilisez le format YYYY-MM-DD avec une heure valide.');
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      setNotice('Choisissez une date et une heure futures pour que le rappel sonne.');
      return;
    }
    let notificationId = '';
    notificationId = await scheduleLocalReminder({
      title: title.trim(),
      body: note.trim() || 'Rappel Oracle Messenger',
      date: scheduledAt,
    });
    const event: LocalEvent = { id: `${Date.now()}`, title: title.trim(), date: date.trim(), time: time.trim() || '09:00', note: note.trim(), createdAt: Date.now(), notificationId };
    await persist([event, ...events].slice(0, 120));
    setTitle('');
    setDate('');
    setTime('09:00');
    setNote('');
    setNotice(notificationId ? 'Rappel enregistré avec sonnerie Android planifiée.' : 'Rappel enregistré, mais la permission notification est refusée donc il ne sonnera pas.');
  }, [date, events, note, persist, time, title]);

  const remove = useCallback(async (event: LocalEvent) => {
    await cancelLocalReminder(event.notificationId);
    await persist(events.filter(item => item.id !== event.id));
    setNotice('Rappel supprimé.');
  }, [events, persist]);

  const testReminderSound = useCallback(async () => {
    const notificationId = await scheduleLocalReminder({
      title: 'Test rappel Oracle Messenger',
      body: 'Si vous entendez ce rappel, la sonnerie locale fonctionne.',
      date: new Date(Date.now() + 5000),
    });
    setNotice(notificationId ? 'Test planifié : la notification doit sonner dans 5 secondes.' : 'Impossible de tester : permission notification refusée.');
  }, []);

  return (
    <View style={styles.subPanel}>
      <Text style={styles.pageCopy}>Rappels locaux conservés par compte avec notification native lorsque la date est future.</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Titre du rappel" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.actionRow}>
        <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
        <TextInput value={time} onChangeText={setTime} placeholder="09:00" placeholderTextColor={colors.muted} style={[styles.input, styles.inlineInput]} />
      </View>
      <TextInput value={note} onChangeText={setNote} placeholder="Détail" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea]} />
      <PrimaryButton label="Enregistrer le rappel" onPress={save} disabled={!title.trim() || !date.trim()} />
      <SecondaryButton label="Tester la sonnerie" onPress={testReminderSound} />
      <AlertText text={notice} />
      {events.map(event => (
        <View key={event.id} style={styles.card}>
          <Text style={styles.cardTitle}>{event.title}</Text>
          <Text style={styles.cardText}>{event.note || 'Sans détail'}</Text>
          <Text style={styles.cardMeta}>{event.date} à {event.time}{event.notificationId ? ' • sonnerie planifiée' : ' • sans sonnerie'}</Text>
          <SecondaryButton label="Supprimer" onPress={() => remove(event)} />
        </View>
      ))}
    </View>
  );
}

export function ToolsPage({
  token,
  ownerId,
  userName,
  initialMode = 'directory',
  onOpenTab,
}: {
  token: string;
  ownerId: string;
  userName: string;
  initialMode?: ToolsMode;
  onOpenTab?: (tab: NativeTabKey) => void;
}) {
  const [mode, setMode] = useState<ToolsMode>(initialMode);
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [aiConfigPrompt, setAiConfigPrompt] = useState(DEFAULT_AI_PROMPT);
  const [aiDelayMs, setAiDelayMs] = useState(1000);
  const [aiMaxWords, setAiMaxWords] = useState(30);
  const [aiRecipientScope, setAiRecipientScope] = useState('everyone');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<8 | 45>(8);
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const [videoQuality, setVideoQuality] = useState<'hd' | 'full_hd' | 'ultra'>('hd');
  const [videoVoiceOver, setVideoVoiceOver] = useState(true);
  const [videoMusic, setVideoMusic] = useState(true);
  const [videoSoundEffects, setVideoSoundEffects] = useState(false);
  const [flyerReferenceImages, setFlyerReferenceImages] = useState<ReferenceImage[]>([]);
  const [videoReferenceImages, setVideoReferenceImages] = useState<ReferenceImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [creations, setCreations] = useState<GeneratedCreation[]>([]);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabsScrollRef = useRef<ScrollView | null>(null);
  const creationsStorageKey = useMemo(() => ownerKey('oracle-native-ai-creations', ownerId), [ownerId]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (mode === 'directory') return;
    const index = TOOL_TABS.findIndex(item => item.mode === mode);
    if (index < 0) return;
    requestAnimationFrame(() => {
      tabsScrollRef.current?.scrollTo({ x: Math.max(0, index * 108 - 112), animated: true });
    });
  }, [mode]);

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
      if (mode === 'ai') {
        const config = data?.config || {};
        setAiConfigPrompt(config.prompt || DEFAULT_AI_PROMPT);
        setAiDelayMs(Number(config.delayMs ?? 1000));
        setAiMaxWords(Math.max(30, Math.min(300, Number(config.maxWords ?? 30) || 30)));
        setAiRecipientScope(config.recipientScope || 'everyone');
        setAiEnabled(Boolean(config.isEnabled));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Outils indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [mode, token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(creationsStorageKey)
      .then(raw => {
        if (!alive) return;
        const parsed = raw ? JSON.parse(raw) : [];
        setCreations(Array.isArray(parsed) ? parsed : []);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [creationsStorageKey]);

  const persistCreations = useCallback(async (next: GeneratedCreation[]) => {
    const limited = next.slice(0, 80);
    setCreations(limited);
    await AsyncStorage.setItem(creationsStorageKey, JSON.stringify(limited));
  }, [creationsStorageKey]);

  const saveCreation = useCallback(async (creation: GeneratedCreation) => {
    await persistCreations([creation, ...creations]);
  }, [creations, persistCreations]);

  const armAutoClose = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      setAiOpen(false);
      setNotice('Test IA fermé après 45 secondes d’inactivité.');
    }, 45000);
  }, []);

  const saveAiConfig = useCallback(async (nextEnabled = aiEnabled, silent = false) => {
    setBusy(true);
    if (!silent) setNotice('');
    try {
      const selectedDelay = aiDelayMs === -1 ? 0 : aiDelayMs;
      const selectedMaxWords = Math.max(30, Math.min(300, Math.round(Number(aiMaxWords) || 30)));
      const limitedPrompt = aiConfigPrompt.trim().split(/\s+/).filter(Boolean).slice(0, 80).join(' ') || DEFAULT_AI_PROMPT;
      const data = await api.aiAutoSaveConfig(token, {
        prompt: limitedPrompt,
        delayMs: selectedDelay,
        maxWords: selectedMaxWords,
        recipientScope: aiRecipientScope,
        isEnabled: nextEnabled,
        dailyLimit: null,
      });
      setAiConfigPrompt(limitedPrompt);
      setAiMaxWords(selectedMaxWords);
      setAiEnabled(nextEnabled);
      setOverview(data?.overview || data);
      if (!silent) setNotice(data?.blocked || 'Configuration IA enregistrée.');
      await load();
    } catch (error) {
      if (!silent) setNotice(error instanceof Error ? error.message : 'Enregistrement IA impossible.');
    } finally {
      setBusy(false);
    }
  }, [aiConfigPrompt, aiDelayMs, aiEnabled, aiMaxWords, aiRecipientScope, load, token]);

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
      await saveAiConfig(aiEnabled, true);
      const data = await api.aiAutoTest(token, clientText, 'tools');
      setAiMessages(current => [...current, { id: `a-${Date.now()}`, from: 'agent', text: data.response }]);
      if (data.freeTestsRemainingToday === 0) {
        setNotice('Tests gratuits terminés pour aujourd’hui.');
      }
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Test IA impossible.');
    } finally {
      setBusy(false);
    }
  }, [aiEnabled, armAutoClose, load, prompt, saveAiConfig, token]);

  const generateFlyer = useCallback(async () => {
    if (!prompt.trim()) return;
    const currentPrompt = prompt.trim();
    setBusy(true);
    try {
      const data = await api.aiFlyerGenerate(token, currentPrompt, flyerReferenceImages);
      const url = data?.imageUrl || data?.url || data?.assetUrl || '';
      if (url) {
        await saveCreation({ id: `flyer-${Date.now()}`, type: 'flyer', url, prompt: currentPrompt, createdAt: Date.now() });
      }
      setNotice(url ? 'Flyer généré et enregistré dans vos créations.' : 'Flyer généré.');
      setPrompt('');
      setFlyerReferenceImages([]);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Génération flyer impossible.');
    } finally {
      setBusy(false);
    }
  }, [flyerReferenceImages, load, prompt, saveCreation, token]);

  const pickFlyerReferenceImages = useCallback(async () => {
    const remaining = 3 - flyerReferenceImages.length;
    if (remaining <= 0) {
      setNotice('Maximum 3 images de référence.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour ajouter une référence flyer.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      base64: true,
      allowsEditing: false,
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
    });
    if (result.canceled || !result.assets?.length) return;
    setBusy(true);
    setNotice('');
    try {
      const references = await Promise.all(result.assets.slice(0, remaining).map(imageAssetToReference));
      setFlyerReferenceImages(current => [...current, ...references].slice(0, 3));
      setNotice(`${references.length} image${references.length > 1 ? 's' : ''} de référence ajoutée${references.length > 1 ? 's' : ''}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Lecture des images de référence impossible.');
    } finally {
      setBusy(false);
    }
  }, [flyerReferenceImages.length]);

  const removeFlyerReferenceImage = useCallback((index: number) => {
    setFlyerReferenceImages(current => current.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const pickVideoReferenceImages = useCallback(async () => {
    const remaining = 4 - videoReferenceImages.length;
    if (remaining <= 0) {
      setNotice('Vous pouvez ajouter 4 images de référence maximum.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour ajouter des images de référence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      base64: true,
      allowsEditing: false,
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
    });
    if (result.canceled || !result.assets?.length) return;
    setBusy(true);
    setNotice('');
    try {
      const references = await Promise.all(result.assets.slice(0, remaining).map(imageAssetToReference));
      setVideoReferenceImages(current => [...current, ...references].slice(0, 4));
      setNotice(`${references.length} image${references.length > 1 ? 's' : ''} de référence ajoutée${references.length > 1 ? 's' : ''}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Lecture des images de référence impossible.');
    } finally {
      setBusy(false);
    }
  }, [videoReferenceImages.length]);

  const removeVideoReferenceImage = useCallback((index: number) => {
    setVideoReferenceImages(current => current.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const generateVideo = useCallback(async () => {
    if (!prompt.trim()) return;
    const currentPrompt = prompt.trim();
    const videoPayment = Array.isArray(overview?.payments)
      ? overview.payments.find((payment: any) => payment?.status === 'success' && !payment?.consumedAt && Number(payment?.amountFcfa || 0) >= AI_VIDEO_PREMIUM_PRICE_FCFA && Number(payment?.durationSeconds || 0) === AI_VIDEO_PREMIUM_DURATION_SECONDS)
      : null;
    if (videoDurationSeconds === AI_VIDEO_PREMIUM_DURATION_SECONDS && !overview?.isAdmin && !videoPayment?.reference) {
      setNotice('Paiement vidéo requis : payez 3 000 FCFA, revenez sur cette page, puis lancez la génération 45s.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.aiVideoGenerate(token, {
        prompt: currentPrompt,
        durationSeconds: videoDurationSeconds,
        aspectRatio: videoAspectRatio,
        quality: videoQuality,
        voiceOver: videoVoiceOver,
        music: videoMusic,
        soundEffects: videoSoundEffects,
        paymentReference: videoDurationSeconds === AI_VIDEO_PREMIUM_DURATION_SECONDS && !overview?.isAdmin ? videoPayment.reference : undefined,
        referenceImages: videoReferenceImages,
      });
      const url = data?.videoUrl || data?.url || data?.assetUrl || '';
      if (url) {
        await saveCreation({ id: `video-${Date.now()}`, type: 'video', url, prompt: currentPrompt, createdAt: Date.now() });
      }
      setNotice(url ? 'Vidéo générée et enregistrée dans vos créations.' : 'Vidéo demandée.');
      setPrompt('');
      setVideoReferenceImages([]);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Génération vidéo impossible.');
    } finally {
      setBusy(false);
    }
  }, [load, overview?.isAdmin, overview?.payments, prompt, saveCreation, token, videoAspectRatio, videoDurationSeconds, videoMusic, videoQuality, videoReferenceImages, videoSoundEffects, videoVoiceOver]);

  const pay = useCallback(async () => {
    setBusy(true);
    try {
      const data = mode === 'ai'
        ? await api.aiAutoInitializePaystack(token, 'activation_1500')
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

  const payAiPlan = useCallback(async (planCode: string) => {
    if (!planCode) return;
    setBusy(true);
    setNotice('');
    try {
      const data = await api.aiAutoInitializePaystack(token, planCode);
      await Linking.openURL(data.authorizationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Paiement indisponible.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const openCreation = useCallback((creation: GeneratedCreation) => {
    Linking.openURL(creation.url).catch(() => setNotice('Ouverture de la création impossible.'));
  }, []);

  const shareCreation = useCallback(async (creation: GeneratedCreation) => {
    await Share.share({ title: creation.type === 'flyer' ? 'Flyer Oracle IA' : 'Vidéo Oracle IA', message: creation.url, url: creation.url });
  }, []);

  const deleteCreation = useCallback(async (creationId: string) => {
    await persistCreations(creations.filter(item => item.id !== creationId));
  }, [creations, persistCreations]);

  const showDelayPicker = useCallback(() => {
    Alert.alert('Délai', 'Choisir le délai avant auto-réponse.', [
      ...AI_DELAY_OPTIONS.map(item => ({
        text: item.label,
        onPress: () => setAiDelayMs(item.value),
      })),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  }, []);

  const showScopePicker = useCallback(() => {
    Alert.alert('Destinataires', 'Choisir les conversations concernées.', [
      ...AI_SCOPE_OPTIONS.map(item => ({
        text: item.label,
        onPress: () => setAiRecipientScope(item.value),
      })),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  }, []);

  const aiPaidActive = Boolean(overview?.config?.paidActive || overview?.paidActive || overview?.freeAccess);

  const showMaxWordsPicker = useCallback(() => {
    if (!aiPaidActive) {
      Alert.alert('Limite gratuite', 'En gratuit, les réponses IA restent limitées à 30 mots. Activez ou rechargez Gemini pour choisir une limite plus grande.', [
        { text: 'Compris' },
      ]);
      return;
    }
    Alert.alert('Nombre de mots', 'Choisir la longueur maximale des réponses IA payantes.', [
      ...AI_MAX_WORD_OPTIONS.map(item => ({
        text: item.label,
        onPress: () => setAiMaxWords(item.value),
      })),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  }, [aiPaidActive]);

  const aiPlans = useMemo(() => extractAiPlans(overview), [overview]);
  const aiUsage = useMemo(() => extractAiUsage(overview), [overview]);
  const aiLastResponse = useMemo(() => [...aiMessages].reverse().find(message => message.from === 'agent')?.text || '', [aiMessages]);
  const aiWordsRemaining = overview?.wallet?.wordsRemaining ?? overview?.wordsRemaining ?? overview?.remaining ?? 0;
  const aiWordsConsumed = overview?.wallet?.wordsConsumed ?? overview?.wordsConsumed ?? aiUsage.reduce((total, item) => total + Number(item.words || 0), 0);
  const aiResponsesCount = overview?.config?.totalReplies ?? overview?.responsesCount ?? aiUsage.filter(item => item.mode === 'auto').length;
  const aiPromptWords = countWords(aiConfigPrompt);
  const videoFreeAvailable = Boolean(overview?.isAdmin || overview?.free?.available);
  const videoFreeDuration = AI_VIDEO_FREE_DURATION_SECONDS;
  const videoPremiumDuration = AI_VIDEO_PREMIUM_DURATION_SECONDS;
  const videoPremiumPrice = AI_VIDEO_PREMIUM_PRICE_FCFA;
  const availableVideoPayment = Array.isArray(overview?.payments)
    ? overview.payments.find((payment: any) => payment?.status === 'success' && !payment?.consumedAt && Number(payment?.amountFcfa || 0) >= videoPremiumPrice && Number(payment?.durationSeconds || 0) === videoPremiumDuration)
    : null;
  const videoNeedsPayment = mode === 'video' && videoDurationSeconds === 45 && !overview?.isAdmin && !availableVideoPayment?.reference;
  const videoFreeBlocked = Boolean(overview && mode === 'video' && videoDurationSeconds === 8 && !overview?.isAdmin && !videoFreeAvailable);
  const videoFreeNextDate = overview?.free?.nextFreeAt ? new Date(overview.free.nextFreeAt) : null;
  const videoFreeNextLabel = videoFreeNextDate && Number.isFinite(videoFreeNextDate.getTime())
    ? videoFreeNextDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  if (mode === 'directory') {
    return <ToolsDirectory onOpenTab={onOpenTab || (() => undefined)} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ScrollView
        ref={tabsScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.toolsTabScroller}
        contentContainerStyle={styles.toolsTabContent}
      >
        {TOOL_TABS.map(item => (
          <Pressable key={item.mode} onPress={() => setMode(item.mode)} style={styles.toolsTab}>
            <Text style={[styles.toolsTabText, mode === item.mode && styles.toolsTabTextActive]}>{item.label}</Text>
            <View style={[styles.toolsTabUnderline, mode === item.mode && styles.toolsTabUnderlineActive]} />
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.moduleContent}>
        {mode === 'meeting' ? <MeetingTool userName={userName} /> : null}
        {mode === 'translate' ? <TranslateTool token={token} /> : null}
        {mode === 'notes' ? <NotesTool ownerId={ownerId} /> : null}
        {mode === 'events' ? <EventsTool ownerId={ownerId} /> : null}
        {mode === 'ai' || mode === 'flyer' || mode === 'video' ? (
          <View style={styles.subPanel}>
            {mode === 'video' ? (
              <View style={styles.videoHero}>
                <Text style={styles.videoHeroTitle}>IA Vidéo</Text>
                <Text style={styles.videoHeroCopy}>Créez automatiquement des vidéos professionnelles de présentation avec l’IA.</Text>
                <View style={styles.videoHeroStats}>
                  <View style={styles.videoHeroStat}>
                    <Text style={styles.videoHeroStatLabel}>GRATUIT</Text>
                    <Text style={styles.videoHeroStatValue}>{overview ? (videoFreeAvailable ? `${videoFreeDuration}s / semaine` : 'Utilisé') : 'Chargement'}</Text>
                  </View>
                  <View style={styles.videoHeroStat}>
                    <Text style={styles.videoHeroStatLabel}>PREMIUM</Text>
                    <Text style={styles.videoHeroStatValue}>{videoPremiumDuration}s assemblée</Text>
                  </View>
                  <View style={styles.videoHeroStat}>
                    <Text style={styles.videoHeroStatLabel}>PAIEMENT</Text>
                    <Text style={styles.videoHeroStatValue}>{videoPremiumPrice.toLocaleString('fr-FR')} FCFA</Text>
                  </View>
                </View>
              </View>
            ) : null}
            {mode === 'video' ? (
              <View style={styles.videoPayCard}>
                <View style={styles.videoPayHead}>
                  <View style={styles.videoPayIcon}><Text style={styles.videoPayIconText}>45s</Text></View>
                  <View style={styles.videoPayCopy}>
                    <Text style={styles.videoPayTitle}>Paiement vidéo IA</Text>
                    <Text style={styles.videoPaySub}>Chaque vidéo Premium 45s coûte {videoPremiumPrice.toLocaleString('fr-FR')} FCFA. Le paiement Paystack est consommé uniquement quand la génération démarre.</Text>
                  </View>
                </View>
                <View style={styles.videoPayStatusRow}>
                  <View style={styles.videoPayStatus}>
                    <Text style={styles.videoPayStatusLabel}>Essai gratuit</Text>
                    <Text style={styles.videoPayStatusValue}>{overview ? (videoFreeAvailable ? `${videoFreeDuration}s disponible` : videoFreeNextLabel ? `Retour ${videoFreeNextLabel}` : 'Utilisé cette semaine') : 'Chargement'}</Text>
                  </View>
                  <View style={styles.videoPayStatus}>
                    <Text style={styles.videoPayStatusLabel}>Paiement 45s</Text>
                    <Text style={styles.videoPayStatusValue}>{availableVideoPayment?.reference ? 'Validé' : `${videoPremiumPrice.toLocaleString('fr-FR')} FCFA`}</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { setVideoDurationSeconds(45); void pay(); }}
                  disabled={busy || overview?.paystackReady === false}
                  style={({ pressed }) => [styles.videoPayButton, availableVideoPayment?.reference && styles.videoPayButtonReady, pressed && !busy && styles.aiPressed, (busy || overview?.paystackReady === false) && styles.aiDisabled]}
                >
                  <Text style={styles.videoPayButtonText}>{availableVideoPayment?.reference ? 'Paiement validé - créer la vidéo 45s' : `Payer ${videoPremiumPrice.toLocaleString('fr-FR')} FCFA par vidéo`}</Text>
                </Pressable>
                {overview?.paystackReady === false ? <AlertText text="Paiement non disponible : Paystack n’est pas configuré côté serveur." /> : null}
              </View>
            ) : mode === 'flyer' ? (
              <>
                <View style={styles.flyerHero}>
                  <Text style={styles.flyerHeroTitle}>Créer un flyer IA</Text>
                  <Text style={styles.flyerHeroCopy}>Créez des affiches et des flyers professionnels avec l’intelligence artificielle en quelques secondes.</Text>
                  <View style={styles.flyerHeroStats}>
                    <FlyerStat label="Restants" value={`${overview?.wallet?.creditsRemaining ?? overview?.credits ?? overview?.remaining ?? 0} / 6`} />
                    <FlyerStat label="Gratuit" value={overview?.free?.available || overview?.freeRemaining ? 'Disponible' : 'Utilisé'} />
                    <FlyerStat label="Créés" value={overview?.wallet?.totalGenerated ?? creations.filter(item => item.type === 'flyer').length} />
                  </View>
                </View>
                <View style={styles.flyerPayCard}>
                  <View style={styles.flyerPayHead}>
                    <View style={styles.flyerPayIcon}>
                      <Text style={styles.flyerPayIconText}>₣</Text>
                    </View>
                    <View style={styles.flyerPayCopy}>
                      <Text style={styles.flyerPayTitle}>Paiement Flyer IA</Text>
                      <Text style={styles.flyerPaySub}>1 création gratuite. Ensuite, activez un pack de 6 créations pour continuer.</Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={pay}
                    disabled={busy || overview?.paystackReady === false}
                    style={({ pressed }) => [styles.flyerPayButton, pressed && !busy && styles.aiPressed, (busy || overview?.paystackReady === false) && styles.aiDisabled]}
                  >
                    <Text style={styles.flyerPayButtonText}>{Number(overview?.wallet?.creditsRemaining ?? overview?.credits ?? 0) > 0 ? 'Recharger encore' : 'Acheter 6 créations - 1 500 FCFA'}</Text>
                  </Pressable>
                  {overview?.paystackReady === false ? <AlertText text="Paiement non disponible : Paystack n’est pas configuré côté serveur." /> : null}
                </View>
                <View style={styles.flyerStorageCard}>
                  <Text style={styles.flyerStorageTitle}>Stockage et transit</Text>
                  <Text style={styles.flyerStorageText}>Vos flyers restent dans la galerie locale de ce téléphone. Le prompt et les images de référence transitent par le serveur uniquement pour générer le visuel IA.</Text>
                </View>
              </>
            ) : null}
            {mode === 'ai' ? (
              <>
                <View style={styles.aiHero}>
                  <Text style={styles.aiHeroTitle}>Gemini Auto-Réponse Premium</Text>
                  <Text style={styles.aiHeroCopy}>Assistant automatique pour répondre aux messages entrants selon votre prompt. Désactivé tant que Paystack n’a pas validé le paiement.</Text>
                  <View style={styles.aiHeroStats}>
                    <View style={styles.aiHeroStat}>
                      <Text style={styles.aiHeroStatLabel}>RESTANTS</Text>
                      <Text numberOfLines={1} style={styles.aiHeroStatValue}>{formatNumber(aiWordsRemaining)} mots</Text>
                    </View>
                    <View style={styles.aiHeroStat}>
                      <Text style={styles.aiHeroStatLabel}>UTILISÉS</Text>
                      <Text numberOfLines={1} style={styles.aiHeroStatValue}>{formatNumber(aiWordsConsumed)}</Text>
                    </View>
                    <View style={styles.aiHeroStat}>
                      <Text style={styles.aiHeroStatLabel}>RÉPONSES</Text>
                      <Text numberOfLines={1} style={styles.aiHeroStatValue}>{formatNumber(aiResponsesCount)}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.aiActivationCard}>
                  <View style={styles.aiActivationCopy}>
                    <Text style={styles.aiCardTitle}>Activation</Text>
                    <Text style={styles.aiMutedStrong}>État : {aiEnabled ? 'activé' : 'désactivé'} · Paiement : {aiPaidActive ? 'validé' : 'à valider'}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => saveAiConfig(!aiEnabled)}
                    disabled={busy}
                    style={({ pressed }) => [styles.aiSmallDarkButton, pressed && !busy && styles.aiPressed, busy && styles.aiDisabled]}
                  >
                    <Text style={styles.aiSmallDarkText}>{aiEnabled ? 'Désactiver' : 'Activer'}</Text>
                  </Pressable>
                </View>

                <View style={styles.aiCard}>
                  <View style={styles.aiCardHeaderRow}>
                    <Text style={styles.aiSectionLabel}>PROMPT PRINCIPAL PRIVÉ</Text>
                    <Text style={styles.aiWordCounter}>{Math.min(aiPromptWords, 80)}/80 mots</Text>
                  </View>
                  <TextInput
                    value={aiConfigPrompt}
                    onChangeText={setAiConfigPrompt}
                    placeholder="Décrivez comment Gemini doit répondre..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    style={[styles.input, styles.aiPromptLargeInput]}
                  />
                  <View style={styles.aiSelectRow}>
                    <NativeSelectBox label="DÉLAI" value={labelForDelay(aiDelayMs)} onPress={showDelayPicker} />
                    <NativeSelectBox label="DESTINATAIRES" value={labelForScope(aiRecipientScope)} onPress={showScopePicker} />
                  </View>
                  <View style={styles.aiSelectRow}>
                    <NativeSelectBox label="MOTS MAX" value={labelForMaxWords(aiMaxWords, aiPaidActive)} onPress={showMaxWordsPicker} />
                    <View style={styles.aiLimitNotice}>
                      <Text style={styles.aiLimitNoticeText}>
                        {aiPaidActive ? 'Compte payant : vous choisissez le nombre de mots et le délai.' : 'Gratuit : 4 réponses par jour, 30 mots maximum.'}
                      </Text>
                    </View>
                  </View>
                  <AiPrimaryButton label="Enregistrer les réglages" onPress={() => saveAiConfig(aiEnabled)} disabled={busy} />
                </View>

                <View style={styles.aiCard}>
                  <Text style={styles.aiCardTitle}>Tester mon IA</Text>
                  <Text style={styles.aiCardCopy}>Le test ne contacte personne. Gratuit : {overview?.freeMessagesRemaining ?? overview?.freeTestsRemainingToday ?? overview?.freeMessagesLimit ?? 4} réponse(s) restante(s) aujourd’hui, 30 mots max. Payant : votre limite de mots et votre délai sont appliqués.</Text>
                  <TextInput
                    value={prompt}
                    onChangeText={text => { setPrompt(text); if (aiOpen) armAutoClose(); }}
                    placeholder="Message de test reçu d’un client..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    style={[styles.input, styles.aiTestInput]}
                  />
                  <AiPrimaryButton label="Tester mon IA" onPress={testAi} disabled={busy || !prompt.trim()} />
                  <View style={styles.aiResponseBox}>
                    <Text style={styles.aiResponseLabel}>RÉPONSE DU TEST</Text>
                    <Text style={styles.aiResponseText}>{aiLastResponse || 'La réponse générée par Gemini apparaîtra ici après le test.'}</Text>
                  </View>
                </View>

                <View style={styles.aiCard}>
                  <Text style={styles.aiCardTitle}>Paiement et recharges Paystack</Text>
                  {aiPlans.map(plan => (
                    <AiPlanRow key={plan.code} plan={plan} disabled={busy || overview?.paystackReady === false} onPress={() => payAiPlan(plan.code)} />
                  ))}
                  {overview?.paystackReady === false ? <AlertText text="Paiement non disponible : Paystack n’est pas configuré côté serveur." /> : null}
                </View>

                <View style={styles.aiCard}>
                  <Text style={styles.aiCardTitle}>Historique</Text>
                  {aiUsage.length ? aiUsage.slice(0, 8).map((item, index) => <AiHistoryRow key={item.id || `${item.mode}-${item.createdAt}-${index}`} item={item} />) : (
                    <Text style={styles.aiCardCopy}>Aucun test ou auto-réponse pour le moment.</Text>
                  )}
                </View>
              </>
            ) : null}
            {mode === 'video' ? (
              <View style={styles.videoPromptCard}>
                <View style={styles.cardHeadRow}>
                  <Text style={styles.capacitorCardTitle}>Décrivez votre vidéo</Text>
                  <Text style={styles.counterBadge}>{prompt.length}/1000</Text>
                </View>
                <Text style={styles.capacitorLead}>Décrivez l’histoire, le style, le public, les scènes et l’objectif de la vidéo.</Text>
                <TextInput
                  value={prompt}
                  onChangeText={text => setPrompt(text.slice(0, 1000))}
                  placeholder="Exemple : Crée une vidéo verticale de 45 secondes pour présenter mon salon de beauté, avec plans modernes, voix off professionnelle, musique douce et appel à l’action final."
                  placeholderTextColor="#94A3B8"
                  multiline
                  style={[styles.input, styles.videoPromptInput]}
                />
                <Text style={styles.videoWarningBox}>Les vidéos longues sont générées en fragments de 8s puis assemblées automatiquement. Les noms ou ressemblances de personnes réelles sont remplacés par un rôle fictif pour éviter le filtre Gemini.</Text>
                <View style={styles.videoOptionGrid}>
                  <VideoOptionPill label="Test 8s" active={videoDurationSeconds === 8} onPress={() => setVideoDurationSeconds(8)} />
                  <VideoOptionPill label="Premium 45s" active={videoDurationSeconds === 45} onPress={() => setVideoDurationSeconds(45)} />
                  <VideoOptionPill label="Voix off" active={videoVoiceOver} onPress={() => setVideoVoiceOver(current => !current)} />
                  <VideoOptionPill label="16:9" active={videoAspectRatio === '16:9'} onPress={() => setVideoAspectRatio('16:9')} />
                  <VideoOptionPill label="9:16" active={videoAspectRatio === '9:16'} onPress={() => setVideoAspectRatio('9:16')} />
                  <VideoOptionPill label="HD" active={videoQuality === 'hd'} onPress={() => setVideoQuality('hd')} />
                  <VideoOptionPill label="Full HD" active={videoQuality === 'full_hd'} onPress={() => setVideoQuality('full_hd')} />
                  <VideoOptionPill label="Très HD" active={videoQuality === 'ultra'} onPress={() => setVideoQuality('ultra')} />
                  <VideoOptionPill label="Musique" active={videoMusic} onPress={() => setVideoMusic(current => !current)} />
                  <VideoOptionPill label="Effets" active={videoSoundEffects} onPress={() => setVideoSoundEffects(current => !current)} />
                </View>
                <View style={styles.videoReferenceCard}>
                  <Text style={styles.videoReferenceTitle}>Images de référence (facultatif)</Text>
                  <Text style={styles.videoReferenceCopy}>Ajoutez jusqu’à 4 images pour guider le style, les couleurs, le produit ou le logo.</Text>
                  {videoReferenceImages.length ? (
                    <View style={styles.videoReferenceList}>
                      {videoReferenceImages.map((reference, index) => (
                        <View key={`${reference.name}-${index}`} style={styles.videoReferenceThumbWrap}>
                          <Image source={{ uri: reference.dataUrl }} style={styles.videoReferenceThumb} resizeMode="cover" />
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => removeVideoReferenceImage(index)}
                            style={({ pressed }) => [styles.videoReferenceRemove, pressed && styles.aiPressed]}
                          >
                            <Text style={styles.videoReferenceRemoveText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={pickVideoReferenceImages}
                    disabled={busy || videoReferenceImages.length >= 4}
                    style={({ pressed }) => [styles.videoReferenceButton, pressed && !busy && styles.aiPressed, (busy || videoReferenceImages.length >= 4) && styles.aiDisabled]}
                  >
                    <Text style={styles.videoReferenceButtonText}>Ajouter des images</Text>
                  </Pressable>
                </View>
                {overview && videoDurationSeconds === 8 && !overview?.isAdmin && !videoFreeAvailable ? (
                  <AlertText text={`Votre test gratuit IA Vidéo de la semaine est utilisé.${videoFreeNextLabel ? ` Prochain test : ${videoFreeNextLabel}.` : ''}`} />
                ) : null}
                {videoNeedsPayment ? (
                  <AlertText text={`Vidéo Premium 45s : paiement de ${videoPremiumPrice.toLocaleString('fr-FR')} FCFA requis avant génération.`} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={generateVideo}
                  disabled={busy || !prompt.trim() || videoNeedsPayment || videoFreeBlocked}
                  style={({ pressed }) => [styles.videoCreateButton, (!prompt.trim() || videoNeedsPayment || videoFreeBlocked) && styles.videoCreateButtonDisabled, pressed && !busy && prompt.trim() && !videoNeedsPayment && !videoFreeBlocked && styles.aiPressed, busy && styles.aiDisabled]}
                >
                  <Text style={[styles.videoCreateButtonText, (!prompt.trim() || videoNeedsPayment || videoFreeBlocked) && styles.videoCreateButtonTextDisabled]}>{videoNeedsPayment ? `Payer ${videoPremiumPrice.toLocaleString('fr-FR')} FCFA avant création` : videoFreeBlocked ? 'Test gratuit déjà utilisé cette semaine' : 'Créer ma vidéo'}</Text>
                </Pressable>
              </View>
            ) : mode === 'flyer' ? (
              <View style={styles.flyerPromptCard}>
                <View style={styles.cardHeadRow}>
                  <View style={styles.flexCopy}>
                    <Text style={styles.capacitorCardTitle}>Décrivez votre idée</Text>
                    <Text style={styles.capacitorLead}>Décrivez précisément le flyer ou l’image que vous souhaitez créer.</Text>
                  </View>
                  <Text style={styles.counterBadge}>{countWords(prompt)}/1000</Text>
                </View>
                <TextInput
                  value={prompt}
                  onChangeText={text => { setPrompt(text); if (aiOpen) armAutoClose(); }}
                  placeholder="Décrivez le flyer ou l'image que vous souhaitez créer (1000 mots maximum)."
                  placeholderTextColor="#94A3B8"
                  multiline
                  style={[styles.input, styles.flyerPromptInput]}
                />
                <View style={styles.flyerReferenceCard}>
                  <Text style={styles.flyerReferenceTitle}>Ajouter une image <Text style={styles.flyerReferenceMuted}>(facultatif)</Text></Text>
                  <Text style={styles.flyerReferenceCopy}>Ajoutez jusqu’à 3 images JPG, PNG ou WEBP pour reprendre un logo, un produit, une personne, un style ou des couleurs.</Text>
                  {flyerReferenceImages.length ? (
                    <View style={styles.videoReferenceList}>
                      {flyerReferenceImages.map((reference, index) => (
                        <View key={`${reference.name}-${index}`} style={styles.videoReferenceThumbWrap}>
                          <Image source={{ uri: reference.dataUrl }} style={styles.videoReferenceThumb} resizeMode="cover" />
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => removeFlyerReferenceImage(index)}
                            style={({ pressed }) => [styles.videoReferenceRemove, pressed && styles.aiPressed]}
                          >
                            <Text style={styles.videoReferenceRemoveText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={pickFlyerReferenceImages}
                    disabled={busy || flyerReferenceImages.length >= 3}
                    style={({ pressed }) => [styles.flyerReferenceButton, pressed && !busy && styles.aiPressed, (busy || flyerReferenceImages.length >= 3) && styles.aiDisabled]}
                  >
                    <Text style={styles.flyerReferenceButtonText}>Choisir galerie</Text>
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={generateFlyer}
                  disabled={busy || countWords(prompt) < 4 || countWords(prompt) > 1000}
                  style={({ pressed }) => [styles.flyerCreateButton, pressed && !busy && countWords(prompt) >= 4 && styles.aiPressed, (busy || countWords(prompt) < 4 || countWords(prompt) > 1000) && styles.aiDisabled]}
                >
                  <Text style={styles.flyerCreateButtonText}>{busy ? 'Création avec l’IA...' : 'Créer avec l’IA'}</Text>
                </Pressable>
              </View>
            ) : null}
            {mode === 'video' ? (
              <View style={styles.videoGalleryCard}>
                <Text style={styles.videoGalleryTitle}>Ma Galerie Vidéo</Text>
                <Text style={styles.videoGallerySub}>Vidéos IA conservées localement sur ce téléphone.</Text>
                {!creations.filter(item => item.type === 'video').length ? <Text style={styles.videoGalleryEmpty}>Aucune vidéo IA locale pour le moment.</Text> : null}
                {creations.filter(item => item.type === 'video').map(creation => (
                  <View key={creation.id} style={styles.videoCreationRow}>
                    <View style={styles.creationCopy}>
                      <Text numberOfLines={1} style={styles.videoCreationTitle}>Vidéo IA</Text>
                      <Text numberOfLines={2} style={styles.videoCreationPrompt}>{creation.prompt}</Text>
                      <Text style={styles.cardMeta}>{new Date(creation.createdAt).toLocaleString('fr-FR')}</Text>
                    </View>
                    <View style={styles.creationActions}>
                      <SecondaryButton label="Ouvrir" onPress={() => openCreation(creation)} />
                      <SecondaryButton label="Partager" onPress={() => shareCreation(creation)} />
                      <SecondaryButton label="Suppr." onPress={() => deleteCreation(creation.id)} />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            <Loading active={busy} />
            <AlertText text={notice} />
            {aiOpen && mode !== 'ai' ? (
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
            {mode === 'flyer' ? (
              <View style={styles.configBox}>
                <Text style={styles.cardTitle}>Créations enregistrées</Text>
                {!creations.filter(item => item.type === mode).length ? <Text style={styles.cardMeta}>Aucune création locale pour ce module.</Text> : null}
                {creations.filter(item => item.type === mode).map(creation => (
                  <View key={creation.id} style={styles.creationRow}>
                    <View style={styles.creationCopy}>
                      <Text numberOfLines={1} style={styles.cardTitle}>{creation.type === 'flyer' ? 'Flyer IA' : 'Vidéo IA'}</Text>
                      <Text numberOfLines={2} style={styles.cardText}>{creation.prompt}</Text>
                      <Text style={styles.cardMeta}>{new Date(creation.createdAt).toLocaleString('fr-FR')}</Text>
                    </View>
                    <View style={styles.creationActions}>
                      <SecondaryButton label="Ouvrir" onPress={() => openCreation(creation)} />
                      <SecondaryButton label="Partager" onPress={() => shareCreation(creation)} />
                      <SecondaryButton label="Suppr." onPress={() => deleteCreation(creation.id)} />
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 92, gap: 0, backgroundColor: colors.background },
  directoryPage: { paddingBottom: 96, backgroundColor: colors.background },
  directorySearchWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 9, backgroundColor: colors.surface },
  directorySearchRow: { minHeight: 46, borderRadius: 23, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  directorySearchInput: { flex: 1, minHeight: 42, color: colors.text, fontSize: 15, fontWeight: '700', paddingHorizontal: 0 },
  directorySectionLabel: { backgroundColor: colors.background, color: '#64748B', fontSize: 11.5, lineHeight: 15, fontWeight: '900', letterSpacing: 1.4, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  directorySection: { backgroundColor: colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  directoryRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  directoryRowPressed: { backgroundColor: '#EAF4F1' },
  directoryIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#EEF2F1', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  directoryCopy: { flex: 1, minWidth: 0 },
  directoryTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  directorySub: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  directoryEmpty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 6 },
  toolsTabScroller: { backgroundColor: colors.header, maxHeight: 44 },
  toolsTabContent: { minHeight: 44, alignItems: 'flex-end' },
  toolsTab: { minWidth: 94, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 8 },
  toolsTabText: { color: 'rgba(255,255,255,0.62)', fontSize: 13, lineHeight: 16, fontWeight: '800', marginBottom: 7 },
  toolsTabTextActive: { color: '#FFFFFF', fontWeight: '900' },
  toolsTabUnderline: { height: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  toolsTabUnderlineActive: { backgroundColor: '#FFFFFF' },
  moduleContent: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 16, gap: 12 },
  meetingPage: { gap: 14, paddingTop: 14, paddingBottom: 16 },
  meetingInfoCard: { borderRadius: 16, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.13)', paddingHorizontal: 14, paddingVertical: 14, gap: 8 },
  meetingInfoTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  meetingInfoLine: { color: colors.text, fontSize: 12.8, lineHeight: 19, fontWeight: '800' },
  meetingAdvice: { color: '#53615F', fontSize: 12.4, lineHeight: 18, fontWeight: '800', marginTop: 4 },
  meetingCard: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(15,23,42,0.04)', paddingHorizontal: 16, paddingVertical: 16, gap: 12, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  meetingSectionTitle: { color: colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: '900', letterSpacing: 0.8 },
  meetingInput: { minHeight: 46, borderRadius: 10, backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  meetingPreviewBox: { minHeight: 62, borderRadius: 10, backgroundColor: '#F1F3F6', borderWidth: 1, borderColor: '#DDE2E8', paddingHorizontal: 12, justifyContent: 'center', gap: 4 },
  meetingPreviewLabel: { color: '#64748B', fontSize: 11.5, lineHeight: 15, fontWeight: '900' },
  meetingPreviewValue: { color: colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
  meetingPrimaryButton: { minHeight: 48, borderRadius: 12, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  meetingPrimaryText: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  meetingReadyCard: { borderRadius: 16, backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#C8E6C9', padding: 16, gap: 10 },
  meetingReadyTitle: { color: '#2E7D32', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  meetingReadyRoom: { fontWeight: '900' },
  meetingReadyNotice: { color: '#2E7D32', fontSize: 12.5, lineHeight: 18, fontWeight: '800' },
  meetingShareBox: { minHeight: 42, borderRadius: 10, backgroundColor: '#FFFFFF', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  meetingShareLink: { color: colors.header, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  meetingActionRow: { flexDirection: 'row', gap: 8 },
  meetingCopyButton: { flex: 1, minHeight: 42, borderRadius: 10, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  meetingCopyText: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  meetingShareButton: { flex: 1, minHeight: 42, borderRadius: 10, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  meetingShareText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  meetingEndButton: { minHeight: 42, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  meetingEndText: { color: '#DC2626', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  meetingCreatedActions: { gap: 10 },
  meetingCreatedButton: { minHeight: 46 },
  meetingSecondaryButton: { minHeight: 42, borderRadius: 12, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.12)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  meetingSecondaryText: { color: colors.header, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  meetingJoinRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meetingJoinInput: { flex: 1, minWidth: 0 },
  meetingJoinButton: { minHeight: 46, borderRadius: 10, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  meetingJoinText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
  capacitorCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  capacitorCardTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  capacitorLead: { color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  languageSelect: { minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  languageSelectText: { color: colors.text, fontSize: 16, fontWeight: '900' },
  languagePickerPanel: { borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  languageSearchInput: { minHeight: 44, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  languageCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  languageCustomInput: { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  languageUseButton: { minHeight: 42, borderRadius: 12, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  languageUseText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  languageList: { maxHeight: 280 },
  languageListContent: { gap: 7, paddingBottom: 2 },
  languageOption: { minHeight: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 12 },
  languageOptionActive: { backgroundColor: '#EAF4F1', borderColor: 'rgba(16,42,42,0.18)' },
  languageOptionLabel: { flex: 1, minWidth: 0, color: colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  languageOptionLabelActive: { color: colors.header },
  languageOptionCode: { color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase' },
  languageOptionCodeActive: { color: colors.header },
  languageEmpty: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: '800', textAlign: 'center', paddingVertical: 12 },
  capacitorTextarea: { minHeight: 150, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 14, lineHeight: 21, fontWeight: '500', textAlignVertical: 'top' },
  resultCard: { borderRadius: 16, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.12)', padding: 12, gap: 6 },
  videoHero: { marginTop: 14, borderRadius: 18, backgroundColor: colors.header, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 12, overflow: 'hidden', shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  videoHeroTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 25, fontWeight: '900' },
  videoHeroCopy: { color: 'rgba(255,255,255,0.78)', fontSize: 13.5, lineHeight: 20, fontWeight: '800' },
  videoHeroStats: { flexDirection: 'row', gap: 8 },
  videoHeroStat: { flex: 1, minHeight: 62, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 9, justifyContent: 'center' },
  videoHeroStatLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  videoHeroStatValue: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900', marginTop: 5 },
  videoPayCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(217,183,91,0.45)', borderRadius: 16, padding: 14, gap: 12, shadowColor: '#102A2A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  videoPayHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  videoPayIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
  videoPayIconText: { color: '#F8E6A0', fontSize: 13, lineHeight: 16, fontWeight: '900' },
  videoPayCopy: { flex: 1, minWidth: 0 },
  videoPayTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  videoPaySub: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: '800', marginTop: 4 },
  videoPayStatusRow: { flexDirection: 'row', gap: 8 },
  videoPayStatus: { flex: 1, minHeight: 58, borderRadius: 13, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, justifyContent: 'center' },
  videoPayStatusLabel: { color: colors.muted, fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  videoPayStatusValue: { color: colors.header, fontSize: 12.5, lineHeight: 16, fontWeight: '900', marginTop: 5 },
  videoPayButton: { minHeight: 48, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  videoPayButtonReady: { backgroundColor: '#128C7E' },
  videoPayButtonText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  videoPromptCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  counterBadge: { minWidth: 68, overflow: 'hidden', borderRadius: 18, backgroundColor: colors.input, color: colors.muted, textAlign: 'center', paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, fontWeight: '900' },
  videoPromptInput: { minHeight: 168, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 14, lineHeight: 21, fontWeight: '500', textAlignVertical: 'top' },
  warningBox: { borderRadius: 16, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', color: '#9A3412', padding: 14, fontSize: 14, lineHeight: 21, fontWeight: '900' },
  videoWarningBox: { borderRadius: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', color: '#9A3412', padding: 11, fontSize: 12, lineHeight: 18, fontWeight: '900' },
  videoOptionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  videoOptionPill: { width: '31%', minWidth: 82, flexGrow: 1, minHeight: 42, borderRadius: 13, backgroundColor: '#EEF2F1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  videoOptionPillActive: { backgroundColor: colors.header, borderColor: colors.header },
  videoOptionText: { color: colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: '900', textAlign: 'center' },
  videoOptionTextActive: { color: '#FFFFFF' },
  videoReferenceCard: { borderRadius: 14, backgroundColor: '#F1F3F6', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  videoReferenceTitle: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  videoReferenceCopy: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  videoReferenceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  videoReferenceThumbWrap: { width: 68, height: 68, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border },
  videoReferenceThumb: { width: '100%', height: '100%' },
  videoReferenceRemove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(16,42,42,0.86)', alignItems: 'center', justifyContent: 'center' },
  videoReferenceRemoveText: { color: '#FFFFFF', fontSize: 20, lineHeight: 22, fontWeight: '900' },
  videoReferenceButton: { minHeight: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  videoReferenceButtonText: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  videoCreateButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  videoCreateButtonDisabled: { backgroundColor: '#E2E8F0' },
  videoCreateButtonText: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  videoCreateButtonTextDisabled: { color: '#94A3B8' },
  videoGalleryCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  videoGalleryTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  videoGallerySub: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  videoGalleryEmpty: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: '800', paddingTop: 4 },
  videoCreationRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 9 },
  videoCreationTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  videoCreationPrompt: { color: colors.text, fontSize: 14.5, lineHeight: 21, fontWeight: '700' },
  aiReplyCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 16, borderWidth: 1, borderColor: colors.border, shadowColor: '#102A2A', shadowOpacity: 0.05, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  aiReplyTitle: { color: colors.text, fontSize: 26, lineHeight: 31, fontWeight: '900' },
  aiReplyLead: { color: colors.muted, fontSize: 18, lineHeight: 27, fontWeight: '600' },
  aiReplyLabel: { color: colors.header, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 6 },
  aiPromptInput: { minHeight: 104, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  aiMessageInput: { minHeight: 158, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 18, lineHeight: 26, textAlignVertical: 'top' },
  aiNoteCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: colors.border },
  aiNoteText: { color: colors.muted, fontSize: 16, lineHeight: 25, fontWeight: '600' },
  aiHero: { marginTop: 14, borderRadius: 18, backgroundColor: colors.header, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, gap: 12, shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  aiHeroTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 25, fontWeight: '900' },
  aiHeroCopy: { color: 'rgba(255,255,255,0.72)', fontSize: 13.5, lineHeight: 20, fontWeight: '800' },
  aiHeroStats: { flexDirection: 'row', gap: 8 },
  aiHeroStat: { flex: 1, minHeight: 62, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 9, justifyContent: 'center' },
  aiHeroStatLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 10.5, lineHeight: 13, fontWeight: '900' },
  aiHeroStatValue: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900', marginTop: 5 },
  aiActivationCard: { minHeight: 86, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  aiActivationCopy: { flex: 1, minWidth: 0, gap: 6 },
  aiCard: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  aiCardTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  aiCardCopy: { color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  aiMutedStrong: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  aiSmallDarkButton: { minHeight: 42, borderRadius: 21, backgroundColor: colors.header, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  aiSmallDarkText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  aiCardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  aiSectionLabel: { flex: 1, color: colors.header, fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  aiWordCounter: { color: colors.secondary, fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  aiPromptLargeInput: { minHeight: 170, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 14, lineHeight: 21, fontWeight: '500', textAlignVertical: 'top', paddingHorizontal: 13, paddingVertical: 12 },
  aiSelectRow: { flexDirection: 'row', gap: 12 },
  aiSelectBlock: { flex: 1, minWidth: 0, gap: 10 },
  aiSelectLabel: { color: colors.header, fontSize: 12, lineHeight: 15, fontWeight: '900' },
  aiSelectBox: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  aiSelectValue: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  aiLimitNotice: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 13, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.12)', justifyContent: 'center', paddingHorizontal: 11 },
  aiLimitNoticeText: { color: colors.header, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  aiPrimaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  aiPrimaryButtonText: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  aiTestInput: { minHeight: 150, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 14, lineHeight: 21, fontWeight: '500', textAlignVertical: 'top', paddingHorizontal: 13, paddingVertical: 12 },
  aiResponseBox: { borderRadius: 14, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.12)', paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  aiResponseLabel: { color: colors.header, fontSize: 12, lineHeight: 15, fontWeight: '900' },
  aiResponseText: { color: colors.text, fontSize: 13.5, lineHeight: 21, fontWeight: '900' },
  aiPlanRow: { minHeight: 68, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F1F3F6', paddingHorizontal: 12, justifyContent: 'center', gap: 6 },
  aiPlanTitle: { color: colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900' },
  aiPlanSub: { color: '#64748B', fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  aiHistoryRow: { minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, justifyContent: 'center', gap: 5 },
  aiHistoryTitle: { color: colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  aiHistoryDate: { color: colors.muted, fontSize: 12, lineHeight: 15, fontWeight: '700' },
  aiPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  aiDisabled: { opacity: 0.54 },
  heroCopy: { color: colors.secondary, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickCard: { width: '48%', minWidth: 142, flexGrow: 1, minHeight: 142, borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: 18, justifyContent: 'center' },
  quickCardActive: { borderColor: colors.header, backgroundColor: '#F8FFFA' },
  quickIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  quickIconText: { color: '#FFFFFF', fontSize: 16, lineHeight: 19, fontWeight: '900' },
  quickTitle: { color: colors.text, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  quickSubtitle: { color: colors.secondary, fontSize: 13.5, lineHeight: 18, fontWeight: '900', marginTop: 8 },
  assistantCard: { borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: 20, gap: 10 },
  assistantTitle: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  assistantCopy: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  greenButton: { alignSelf: 'flex-start', minHeight: 46, minWidth: 190, borderRadius: 23, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, marginTop: 8 },
  greenButtonText: { color: '#102A2A', fontSize: 14, fontWeight: '900' },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
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
  subPanel: { gap: 10 },
  notesList: { paddingTop: 14, gap: 10 },
  notesNewButton: { minHeight: 52, borderRadius: 12, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  notesNewButtonText: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900' },
  notesEmpty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10 },
  notesEmptyIcon: { fontSize: 48, lineHeight: 54 },
  notesEmptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  noteRow: { borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  noteRowBody: { flex: 1, minWidth: 0, gap: 4 },
  noteRowTitle: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  noteRowText: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  noteRowDate: { color: '#94A3B8', fontSize: 11, lineHeight: 14, fontWeight: '800' },
  noteDeleteButton: { width: 34, minHeight: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  noteDeleteText: { color: '#DC2626', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  notesEditor: { flex: 1, minHeight: 520, paddingTop: 14, gap: 12 },
  notesEditorHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notesBackButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  notesBackText: { color: colors.muted, fontSize: 24, lineHeight: 28, fontWeight: '900' },
  notesTitleInput: { flex: 1, minHeight: 44, color: colors.text, borderBottomWidth: 2, borderBottomColor: colors.header, fontSize: 17, lineHeight: 22, fontWeight: '900', paddingHorizontal: 0, paddingVertical: 7 },
  notesSaveButton: { minHeight: 40, borderRadius: 10, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  notesSaveText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  notesBodyInput: { flex: 1, minHeight: 300, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: 14, fontSize: 15, lineHeight: 24, fontWeight: '600' },
  flexCopy: { flex: 1, minWidth: 0 },
  flyerHero: { borderRadius: 18, backgroundColor: colors.header, padding: 16, gap: 12, shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  flyerHeroTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 25, fontWeight: '900' },
  flyerHeroCopy: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  flyerHeroStats: { flexDirection: 'row', gap: 8 },
  flyerStat: { flex: 1, minHeight: 54, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', justifyContent: 'center', paddingHorizontal: 8 },
  flyerStatValue: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900' },
  flyerStatLabel: { color: 'rgba(255,255,255,0.64)', fontSize: 10.5, lineHeight: 13, fontWeight: '900', marginTop: 3 },
  flyerPayCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(217,183,91,0.45)', borderRadius: 16, padding: 14, gap: 12, shadowColor: '#102A2A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  flyerPayHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  flyerPayIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' },
  flyerPayIconText: { color: '#F8E6A0', fontSize: 19, fontWeight: '900' },
  flyerPayCopy: { flex: 1, minWidth: 0 },
  flyerPayTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  flyerPaySub: { color: colors.muted, fontSize: 12.5, lineHeight: 18, fontWeight: '700', marginTop: 4 },
  flyerPayButton: { minHeight: 48, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  flyerPayButtonText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  flyerStorageCard: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, gap: 5 },
  flyerStorageTitle: { color: colors.text, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  flyerStorageText: { color: colors.muted, fontSize: 12.3, lineHeight: 18, fontWeight: '700' },
  flyerPromptCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border, shadowColor: '#102A2A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  flyerPromptInput: { minHeight: 160, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 14, lineHeight: 21, fontWeight: '500', textAlignVertical: 'top' },
  flyerReferenceCard: { borderRadius: 14, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 9 },
  flyerReferenceTitle: { color: colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  flyerReferenceMuted: { color: colors.muted, fontWeight: '800' },
  flyerReferenceCopy: { color: colors.muted, fontSize: 12.3, lineHeight: 17, fontWeight: '700' },
  flyerReferenceButton: { minHeight: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  flyerReferenceButtonText: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  flyerCreateButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  flyerCreateButtonText: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  configBox: { borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  inlineInput: { flex: 1, minWidth: 130 },
  dangerText: { color: colors.danger },
  chatPanel: { borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  aiBubble: { maxWidth: '92%', borderRadius: 16, padding: 10, gap: 4 },
  aiClient: { alignSelf: 'flex-end', backgroundColor: '#DCFCE7' },
  aiAgent: { alignSelf: 'flex-start', backgroundColor: '#EAF4F1' },
  aiFrom: { color: colors.muted, fontSize: 10.5, fontWeight: '900' },
  aiText: { color: colors.text, fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  creationRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 },
  creationCopy: { gap: 3 },
  creationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
