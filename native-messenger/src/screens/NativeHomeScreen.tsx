import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Image, KeyboardAvoidingView, Linking, NativeModules, PermissionsAndroid, Platform, Pressable, requireNativeComponent, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Camera, CameraOff, Image as ImageIcon, Mic, MicOff, Paperclip, Phone, PhoneOff, RefreshCcw, RotateCcw, Send, Video, Volume2 } from 'lucide-react-native';
import { RTCView } from 'react-native-webrtc';
import { ANDROID_PACKAGE, GOOGLE_WEB_CLIENT_ID, NATIVE_BASELINE } from '@/config/env';
import { useNativeCall } from '@/hooks/useNativeCall';
import { NativeFeaturePage, type NativeTabKey, useVisibleTabs } from '@/screens/NativeFeaturePages';
import { api } from '@/services/api';
import { readLocalGalleryItems, type LocalGalleryItem } from '@/services/localMedia';
import { syncPendingMedia, type MediaSyncResult } from '@/services/mediaSync';
import { ensureNativeSocket } from '@/services/nativeSocket';
import { configureAndroidNotifications, registerPushToken } from '@/services/notifications';
import { clearSession, loadSession, saveSession } from '@/services/session';
import { colors } from '@/theme/colors';
import type { AuthSession, Conversation, Message } from '@/types/messenger';

function initials(name?: string | null) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

function conversationName(conversation: Conversation) {
  return conversation.name || conversation.participants?.[0]?.name || 'Conversation';
}

function messagePreview(message?: Message | null) {
  if (!message) return 'Aucun message';
  if (message.isDeleted) return 'Message supprimé';
  if (message.type === 'text') return message.content;
  const payload = parseMediaPayload(message.content);
  if (message.type === 'image') return payload?.name || 'Image';
  if (message.type === 'video') return payload?.name || 'Vidéo';
  if (message.type === 'audio' || message.type === 'voice') return payload?.name || 'Note vocale';
  return payload?.name || 'Fichier';
}

function parseMediaPayload(content?: string | null): MediaPayload | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') return null;
    const url = typeof parsed.url === 'string' ? parsed.url : '';
    if (!url) return null;
    return {
      url,
      size: typeof parsed.size === 'number' ? parsed.size : undefined,
      checksum: typeof parsed.checksum === 'string' ? parsed.checksum : undefined,
      mime: typeof parsed.mime === 'string' ? parsed.mime : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
    };
  } catch {
    return null;
  }
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return 'taille inconnue';
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

async function fileToDataUrl(uri: string, mime = 'application/octet-stream') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

function sortMessages(items: Message[]) {
  return [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

type Country = { code: string; name: string; dial: string; flag: string };
type PaystackScope = 'ai' | 'flyer' | 'video' | 'business';
type VoiceRecordingResult = { uri: string; name: string; mime: string; size: number; durationMs: number };
type MediaPayload = { url: string; size?: number; checksum?: string; mime?: string; name?: string };
type PendingCallAction = { action: 'accept' | 'reject'; callId?: string | null; conversationId?: string | null };

const OracleVoiceRecorder = NativeModules.OracleVoiceRecorder as {
  start?: () => Promise<{ uri: string; startedAt: number }>;
  stop?: () => Promise<VoiceRecordingResult>;
  cancel?: () => Promise<boolean>;
} | undefined;
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

const COUNTRIES: Country[] = [
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225', flag: 'CI' },
  { code: 'CM', name: 'Cameroun', dial: '+237', flag: 'CM' },
  { code: 'SN', name: 'Sénégal', dial: '+221', flag: 'SN' },
  { code: 'ML', name: 'Mali', dial: '+223', flag: 'ML' },
  { code: 'BF', name: 'Burkina Faso', dial: '+226', flag: 'BF' },
  { code: 'GN', name: 'Guinée', dial: '+224', flag: 'GN' },
  { code: 'TG', name: 'Togo', dial: '+228', flag: 'TG' },
  { code: 'BJ', name: 'Bénin', dial: '+229', flag: 'BJ' },
  { code: 'NE', name: 'Niger', dial: '+227', flag: 'NE' },
  { code: 'CD', name: 'Congo RDC', dial: '+243', flag: 'CD' },
  { code: 'CG', name: 'Congo', dial: '+242', flag: 'CG' },
  { code: 'GA', name: 'Gabon', dial: '+241', flag: 'GA' },
  { code: 'GH', name: 'Ghana', dial: '+233', flag: 'GH' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: 'NG' },
  { code: 'MA', name: 'Maroc', dial: '+212', flag: 'MA' },
  { code: 'DZ', name: 'Algérie', dial: '+213', flag: 'DZ' },
  { code: 'TN', name: 'Tunisie', dial: '+216', flag: 'TN' },
  { code: 'FR', name: 'France', dial: '+33', flag: 'FR' },
  { code: 'BE', name: 'Belgique', dial: '+32', flag: 'BE' },
  { code: 'CH', name: 'Suisse', dial: '+41', flag: 'CH' },
  { code: 'US', name: 'États-Unis', dial: '+1', flag: 'US' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: 'CA' },
  { code: 'GB', name: 'Royaume-Uni', dial: '+44', flag: 'GB' },
].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

function normalizeOnboardingPhone(country: Country, rawPhone: string) {
  const digits = rawPhone.replace(/\D/g, '');
  const dialDigits = country.dial.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith(dialDigits) ? `+${digits}` : `${country.dial}${digits}`;
}

function socketAck<T>(socket: ReturnType<typeof ensureNativeSocket>, event: string, payload: unknown, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error: Error | null, response: T) => {
      if (error) reject(new Error('Temps réel indisponible.'));
      else resolve(response);
    });
  });
}

function parsePaystackDeepLink(url: string): { scope: PaystackScope; reference: string } | null {
  if (!url.startsWith('oraclemessenger://paystack')) return null;
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const scope = params.get('scope');
  const reference = params.get('reference');
  if (!reference || !['ai', 'flyer', 'video', 'business'].includes(scope || '')) return null;
  return { scope: scope as PaystackScope, reference };
}

function parseCallActionDeepLink(url: string): { action: 'accept' | 'reject' | 'open'; callId?: string | null; conversationId?: string | null } | null {
  if (!url.startsWith('oraclemessenger://call')) return null;
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const action = params.get('action') || 'open';
  if (!['accept', 'reject', 'open'].includes(action)) return null;
  return {
    action: action as 'accept' | 'reject' | 'open',
    callId: params.get('callId'),
    conversationId: params.get('conversationId') || params.get('conv'),
  };
}

function parseConversationTarget(input?: string | null): { conversationId: string; callId?: string | null } | null {
  if (!input) return null;
  const raw = input.startsWith('oraclemessenger://') ? input : `oraclemessenger://notification${input.startsWith('/') ? input : `/${input}`}`;
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const conversationId = params.get('conv') || params.get('conversationId');
  if (!conversationId) return null;
  return { conversationId, callId: params.get('call') || params.get('callId') };
}

function NativeOnboarding({
  session,
  onComplete,
  onLogout,
}: {
  session: AuthSession;
  onComplete: (session: AuthSession) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [name, setName] = useState(session.user.name || '');
  const [bio, setBio] = useState(session.user.bio || '');
  const [avatar, setAvatar] = useState(session.user.avatar || '');
  const [phone, setPhone] = useState(session.user.phone || '');
  const [country, setCountry] = useState<Country>(COUNTRIES.find(item => item.code === 'CI') || COUNTRIES[0]);
  const [showCountries, setShowCountries] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredCountries = useMemo(() => {
    const needle = countrySearch.trim().toLowerCase();
    if (!needle) return COUNTRIES;
    return COUNTRIES.filter(item => (
      item.name.toLowerCase().includes(needle) ||
      item.dial.includes(needle) ||
      item.code.toLowerCase().includes(needle)
    ));
  }, [countrySearch]);

  const pickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Permission galerie requise pour ajouter une photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    if (asset.base64) {
      setAvatar(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    } else {
      setAvatar(asset.uri);
    }
    setError('');
  }, []);

  const saveOnboarding = useCallback(async () => {
    const cleanName = name.trim();
    const cleanPhone = normalizeOnboardingPhone(country, phone);
    if (!cleanName) {
      setError('Le nom est requis.');
      return;
    }
    if (cleanPhone.replace(/\D/g, '').length < 8) {
      setError('Le numéro de téléphone est requis avec un format valide.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved: any = await api.updateMe(session.token, {
        name: cleanName,
        bio: bio.trim(),
        avatar: avatar || undefined,
        phone: cleanPhone,
      });
      const nextSession: AuthSession = {
        token: saved?.token || session.token,
        user: {
          ...session.user,
          ...saved,
          name: saved?.name || cleanName,
          bio: saved?.bio ?? bio.trim(),
          avatar: saved?.avatar ?? avatar,
          phone: saved?.phone || cleanPhone,
          isNew: false,
        },
      };
      delete (nextSession.user as any).token;
      await onComplete(nextSession);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err || '');
      setError(raw.includes('autre compte Google') || raw.includes('409') || raw.includes('déjà lié')
        ? 'Ce numéro est déjà lié à un autre compte Google. Connectez-vous avec le Gmail associé à ce numéro.'
        : raw.includes('votre compte Oracle Messenger') || raw.includes('même compte Google')
          ? 'Ce numéro appartient déjà à votre compte. Reconnexion du bon profil en cours impossible, réessayez.'
          : raw || 'Erreur lors de la sauvegarde du profil.');
    } finally {
      setSaving(false);
    }
  }, [avatar, bio, country, name, onComplete, phone, session]);

  return (
    <SafeAreaView style={styles.onboardingSafe}>
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled">
        <View style={styles.onboardingHeader}>
          <Text style={styles.onboardingEyebrow}>Bienvenue sur</Text>
          <Text style={styles.onboardingTitle}>Oracle Messenger</Text>
          <Text style={styles.onboardingSubtitle}>Complétez votre profil pour commencer.</Text>
        </View>

        <Pressable onPress={pickAvatar} style={styles.onboardingAvatarWrap}>
          <View style={styles.onboardingAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.onboardingAvatarText}>{initials(name)}</Text>}
          </View>
          <View style={styles.onboardingCameraBadge}>
            <Camera size={16} color="#FFFFFF" />
          </View>
        </Pressable>
        <Text style={styles.onboardingHint}>Appuyez pour ajouter une photo</Text>

        {error ? <Text style={styles.onboardingError}>{error}</Text> : null}

        <View style={styles.onboardingForm}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Votre nom *</Text>
            <TextInput
              value={name}
              onChangeText={text => { setName(text); setError(''); }}
              placeholder="Ex : Jean Dupont"
              placeholderTextColor={colors.muted}
              maxLength={50}
              style={styles.onboardingInput}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Dites quelque chose sur vous..."
              placeholderTextColor={colors.muted}
              maxLength={160}
              multiline
              style={[styles.onboardingInput, styles.onboardingTextarea]}
            />
            <Text style={styles.fieldCounter}>{bio.length}/160</Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Numéro de téléphone *</Text>
            <View style={styles.phoneRow}>
              <Pressable style={styles.countryButton} onPress={() => setShowCountries(current => !current)}>
                <Text style={styles.countryFlag}>{country.flag}</Text>
                <Text style={styles.countryDial}>{country.dial}</Text>
                <Text style={styles.countryChevron}>⌄</Text>
              </Pressable>
              <TextInput
                value={phone}
                onChangeText={text => { setPhone(text.replace(/[^\d\s]/g, '')); setError(''); }}
                placeholder="Ex: 0102030405"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                style={[styles.onboardingInput, styles.phoneInput]}
              />
            </View>
          </View>

          {showCountries ? (
            <View style={styles.countryPicker}>
              <TextInput
                value={countrySearch}
                onChangeText={setCountrySearch}
                placeholder="Rechercher un pays ou code..."
                placeholderTextColor={colors.muted}
                style={styles.countrySearch}
              />
              {filteredCountries.slice(0, 60).map(item => (
                <Pressable key={`${item.code}-${item.dial}`} style={styles.countryOption} onPress={() => { setCountry(item); setShowCountries(false); setCountrySearch(''); }}>
                  <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                  <Text style={styles.countryOptionName}>{item.name}</Text>
                  <Text style={styles.countryOptionDial}>{item.dial}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={saveOnboarding}
            disabled={saving || !name.trim() || normalizeOnboardingPhone(country, phone).replace(/\D/g, '').length < 8}
            style={[styles.onboardingSubmit, (saving || !name.trim() || normalizeOnboardingPhone(country, phone).replace(/\D/g, '').length < 8) && styles.disabledButton]}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.onboardingSubmitText}>Commencer à discuter →</Text>}
          </Pressable>
          <Pressable onPress={onLogout} disabled={saving} style={styles.onboardingLogout}>
            <Text style={styles.onboardingLogoutText}>Changer de compte Google</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NativeCallOverlay({ call }: { call: ReturnType<typeof useNativeCall> }) {
  if (call.callState === 'idle') return null;
  const remoteEntries = Array.from(call.remoteStreams.entries());
  const isVideo = call.callInfo?.type === 'video';
  const status =
    call.callState === 'incoming' ? 'Appel entrant' :
    call.callState === 'calling' ? 'Appel en cours...' :
    call.callState === 'connecting' ? 'Connexion...' :
    call.callState === 'reconnecting' ? 'Reconnexion...' :
    call.callState === 'connected' ? 'Connecté' : 'Appel';

  return (
    <View style={styles.callOverlay}>
      {isVideo && remoteEntries[0]?.[1] ? (
        <RTCView streamURL={remoteEntries[0][1].toURL()} objectFit="cover" style={styles.remoteVideo} />
      ) : (
        <View style={styles.callAvatar}>
          <Text style={styles.callAvatarText}>{(call.callInfo?.callerName || 'O').slice(0, 1).toUpperCase()}</Text>
        </View>
      )}

      {isVideo && call.localStream ? (
        <View style={styles.localVideoWrap}>
          {call.isCameraOff ? (
            <View style={styles.localVideoOff}><CameraOff size={22} color="#FFFFFF" /></View>
          ) : (
            <RTCView streamURL={call.localStream.toURL()} objectFit="cover" mirror style={styles.localVideo} />
          )}
        </View>
      ) : null}

      <View style={styles.callTop}>
        <Text style={styles.callTitle}>{call.callInfo?.callerName || 'Oracle Messenger'}</Text>
        <Text style={styles.callStatus}>{status}</Text>
        {call.callNotice ? <Text style={styles.callNotice}>{call.callNotice}</Text> : null}
      </View>

      <View style={styles.callControls}>
        {call.callState === 'incoming' ? (
          <>
            <Pressable style={[styles.callButton, styles.rejectButton]} onPress={() => call.answerCall(false)}>
              <PhoneOff size={24} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.callButton, styles.acceptButton]} onPress={() => call.answerCall(true)}>
              <Phone size={24} color="#FFFFFF" />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={[styles.callControl, call.speakerOn && styles.callControlActive]} onPress={call.toggleSpeaker}>
              <Volume2 size={22} color="#FFFFFF" />
              <Text style={styles.callControlLabel}>Haut-parleur</Text>
            </Pressable>
            <Pressable style={[styles.callControl, call.isMuted && styles.callControlActive]} onPress={call.toggleMute}>
              {call.isMuted ? <MicOff size={22} color="#FFFFFF" /> : <Mic size={22} color="#FFFFFF" />}
              <Text style={styles.callControlLabel}>Micro</Text>
            </Pressable>
            {isVideo ? (
              <>
                <Pressable style={[styles.callControl, call.isCameraOff && styles.callControlActive]} onPress={call.toggleCamera}>
                  {call.isCameraOff ? <CameraOff size={22} color="#FFFFFF" /> : <Camera size={22} color="#FFFFFF" />}
                  <Text style={styles.callControlLabel}>Caméra</Text>
                </Pressable>
                <Pressable style={styles.callControl} onPress={call.switchCamera}>
                  <RotateCcw size={22} color="#FFFFFF" />
                  <Text style={styles.callControlLabel}>Tourner</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable style={[styles.callButton, styles.rejectButton]} onPress={call.endCall}>
              <PhoneOff size={24} color="#FFFFFF" />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function ChatMediaMessage({ message, localItem }: { message: Message; localItem?: LocalGalleryItem }) {
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

export function NativeHomeScreen() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationSearch, setConversationSearch] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageSearch, setMessageSearch] = useState('');
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [localMediaByMessageId, setLocalMediaByMessageId] = useState<Record<string, LocalGalleryItem>>({});
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceStartedAt, setVoiceStartedAt] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<NativeTabKey>('chats');
  const [typingByConversation, setTypingByConversation] = useState<Record<string, Record<string, string>>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRefreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingCallActionRef = useRef<PendingCallAction | null>(null);
  const pendingCallActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationSearchRequestRef = useRef(0);
  const selectedRef = useRef<Conversation | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const initialDeepLinkHandledRef = useRef(false);
  const initialNotificationResponseHandledRef = useRef(false);
  const nativeCall = useNativeCall(session);

  const token = session?.token;
  const currentCallId = nativeCall.callInfo?.callId ?? null;
  const answerNativeCall = nativeCall.answerCall;
  const prepareIncomingCall = nativeCall.prepareIncomingCall;
  const visibleTabs = useVisibleTabs(session);
  const needsOnboarding = Boolean(session && (session.user.isNew || !session.user.phone));

  const refreshLocalMediaIndex = useCallback(async () => {
    try {
      const items = await readLocalGalleryItems();
      setLocalMediaByMessageId(Object.fromEntries(items.map(item => [item.messageId, item])));
    } catch {
      setLocalMediaByMessageId({});
    }
  }, []);

  const clearMediaRefreshTimers = useCallback(() => {
    for (const timer of mediaRefreshTimersRef.current) clearTimeout(timer);
    mediaRefreshTimersRef.current = [];
  }, []);

  const clearPendingCallAction = useCallback(() => {
    if (pendingCallActionTimerRef.current) clearTimeout(pendingCallActionTimerRef.current);
    pendingCallActionTimerRef.current = null;
    pendingCallActionRef.current = null;
  }, []);

  const queuePendingCallAction = useCallback((action: PendingCallAction) => {
    if (!action.callId) {
      setNotice('Action appel invalide ou expirée.');
      return;
    }
    clearPendingCallAction();
    pendingCallActionRef.current = action;
    pendingCallActionTimerRef.current = setTimeout(() => {
      pendingCallActionRef.current = null;
      pendingCallActionTimerRef.current = null;
      setNotice('Appel entrant introuvable ou deja termine.');
    }, 45000);
  }, [clearPendingCallAction]);

  const scheduleMediaIndexRefreshes = useCallback((result?: MediaSyncResult) => {
    if (!result?.queuedNativeMessageIds.length) return;
    clearMediaRefreshTimers();
    mediaRefreshTimersRef.current = [1500, 5000, 12000, 30000].map(delay => (
      setTimeout(() => {
        refreshLocalMediaIndex().catch(() => null);
      }, delay)
    ));
  }, [clearMediaRefreshTimers, refreshLocalMediaIndex]);

  const runMediaSync = useCallback((activeToken: string, currentUserId?: string, knownMessages: Message[] = []) => (
    syncPendingMedia(activeToken, currentUserId, knownMessages)
      .then(result => {
        scheduleMediaIndexRefreshes(result);
        return result;
      })
      .finally(() => refreshLocalMediaIndex().catch(() => null))
      .catch(() => null)
  ), [refreshLocalMediaIndex, scheduleMediaIndexRefreshes]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations(current => {
      const exists = current.some(item => item.id === conversation.id);
      const next = exists
        ? current.map(item => item.id === conversation.id ? { ...item, ...conversation } : item)
        : [conversation, ...current];
      return next.sort((a, b) => new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime() - new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime());
    });
  }, []);

  const upsertMessage = useCallback((message: Message) => {
    setMessages(current => {
      const active = selectedRef.current;
      if (!active || active.id !== message.conversationId) return current;
      const exists = current.some(item => item.id === message.id);
      return sortMessages(exists ? current.map(item => item.id === message.id ? { ...item, ...message } : item) : [...current, message]);
    });
    setConversations(current => {
      let found = false;
      const next = current.map(conversation => {
        if (conversation.id !== message.conversationId) return conversation;
        found = true;
        const isCurrentOpen = selectedRef.current?.id === message.conversationId;
        const isOwn = message.senderId === sessionRef.current?.user.id;
        return {
          ...conversation,
          lastMessage: message,
          unreadCount: isCurrentOpen || isOwn ? conversation.unreadCount || 0 : (conversation.unreadCount || 0) + 1,
          updatedAt: message.createdAt || conversation.updatedAt,
        };
      });
      if (!found) return current;
      return next.sort((a, b) => new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime() - new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime());
    });
  }, []);

  const patchMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    setConversations(current => current.map(conversation => (
      conversation.lastMessage?.id === id
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, ...patch } }
        : conversation
    )));
  }, []);

  const markMessageDeleted = useCallback((conversationId: string, messageId: string) => {
    setMessages(current => current.map(item => item.id === messageId ? { ...item, isDeleted: true, content: '' } : item));
    setConversations(current => current.map(conversation => (
      conversation.id === conversationId && conversation.lastMessage?.id === messageId
        ? { ...conversation, lastMessage: { ...conversation.lastMessage, isDeleted: true, content: '' } }
        : conversation
    )));
  }, []);

  const refreshConversations = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    setBusy(true);
    try {
      const query = conversationSearch.trim();
      const items = query ? await api.searchConversations(query, activeToken) : await api.conversations(activeToken);
      setConversations(items);
      setNotice(items.length ? '' : query ? 'Aucune conversation trouvée.' : 'Aucune conversation pour ce compte.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Chargement conversations impossible.');
    } finally {
      setBusy(false);
    }
  }, [conversationSearch, token]);

  useEffect(() => {
    if (!token || activeTab !== 'chats' || selected) return;
    const query = conversationSearch.trim();
    const requestId = conversationSearchRequestRef.current + 1;
    conversationSearchRequestRef.current = requestId;
    const timer = setTimeout(() => {
      setBusy(true);
      (query ? api.searchConversations(query, token) : api.conversations(token))
        .then(items => {
          if (conversationSearchRequestRef.current !== requestId) return;
          setConversations(items);
          setNotice(items.length ? '' : query ? 'Aucune conversation trouvée.' : 'Aucune conversation pour ce compte.');
        })
        .catch(error => {
          if (conversationSearchRequestRef.current !== requestId) return;
          setNotice(error instanceof Error ? error.message : 'Recherche conversations impossible.');
        })
        .finally(() => {
          if (conversationSearchRequestRef.current === requestId) setBusy(false);
        });
    }, query ? 280 : 0);
    return () => clearTimeout(timer);
  }, [activeTab, conversationSearch, selected, token]);

  const completeOnboarding = useCallback(async (nextSession: AuthSession) => {
    await saveSession(nextSession);
    setSession(nextSession);
    setNotice('');
    setSelected(null);
    setActiveTab('chats');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await refreshConversations(nextSession.token);
    runMediaSync(nextSession.token, nextSession.user.id);
  }, [refreshConversations, runMediaSync]);

  const loadMessages = useCallback(async (conversation: Conversation, activeToken = token) => {
    if (!activeToken) return;
    setActiveTab('chats');
    setSelected(conversation);
    setMessageSearch('');
    setSelectedMessageIds([]);
    setForwardMessages([]);
    setBusy(true);
    try {
      const socket = ensureNativeSocket(activeToken);
      socket.emit('conversation:join', { conversationId: conversation.id });
      const items = await api.messages(conversation.id, activeToken);
      setMessages(items);
      const lastIncoming = [...items].reverse().find(item => item.senderId !== sessionRef.current?.user.id);
      if (lastIncoming) socket.emit('message:read', { conversationId: conversation.id, messageId: lastIncoming.id });
      setConversations(current => current.map(item => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
      setNotice('');
      runMediaSync(activeToken, session?.user.id, items);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Messages indisponibles.');
    } finally {
      setBusy(false);
    }
  }, [runMediaSync, session?.user.id, token]);

  const openConversationById = useCallback(async (conversationId: string, activeToken = token) => {
    if (!activeToken || !conversationId) return;
    setBusy(true);
    setNotice('');
    try {
      const items = await api.conversations(activeToken);
      setConversations(items);
      const conversation = items.find(item => item.id === conversationId);
      if (!conversation) {
        setActiveTab('chats');
        setSelected(null);
        setNotice('Conversation introuvable ou non autorisee pour ce compte.');
        return;
      }
      await loadMessages(conversation, activeToken);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ouverture conversation impossible.');
    } finally {
      setBusy(false);
    }
  }, [loadMessages, token]);

  const openConversationFromFeature = useCallback((conversation: Conversation) => {
    setActiveTab('chats');
    void loadMessages(conversation);
  }, [loadMessages]);

  const restore = useCallback(async () => {
    setLoading(true);
    try {
      const saved = await loadSession();
      if (saved) {
        setSession(saved);
        await refreshConversations(saved.token);
        await refreshLocalMediaIndex();
        runMediaSync(saved.token, saved.user.id);
      }
    } finally {
      setLoading(false);
    }
  }, [refreshConversations, refreshLocalMediaIndex, runMediaSync]);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    configureAndroidNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
      profileImageSize: 240,
    });
  }, []);

  useEffect(() => {
    if (!session?.token) return;
    registerPushToken(session.token)
      .catch(error => {
        console.info('[NativeNotifications]', {
          event: 'push-register-error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    refreshLocalMediaIndex().catch(() => null);
    runMediaSync(session.token, session.user.id);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runMediaSync(session.token, session.user.id);
      }
    });
    return () => subscription.remove();
  }, [refreshLocalMediaIndex, runMediaSync, session?.token, session?.user.id]);

  const verifyPaystackReturn = useCallback(async (url: string) => {
    const parsed = parsePaystackDeepLink(url);
    const activeSession = sessionRef.current;
    if (!parsed || !activeSession?.token) return;
    setBusy(true);
    setNotice('Vérification Paystack en cours...');
    try {
      if (parsed.scope === 'ai') await api.aiAutoVerifyPaystack(activeSession.token, parsed.reference);
      else if (parsed.scope === 'flyer') await api.aiFlyerVerifyPaystack(activeSession.token, parsed.reference);
      else if (parsed.scope === 'video') await api.aiVideoVerifyPaystack(activeSession.token, parsed.reference);
      else await api.businessVerifyPaystack(activeSession.token, parsed.reference);
      setActiveTab(parsed.scope === 'business' ? 'business' : 'payments');
      setSelected(null);
      setNotice('Paiement vérifié côté serveur.');
      await refreshConversations(activeSession.token);
    } catch (error) {
      setActiveTab('payments');
      setSelected(null);
      setNotice(error instanceof Error ? error.message : 'Vérification Paystack impossible.');
    } finally {
      setBusy(false);
    }
  }, [refreshConversations]);

  const handleNativeDeepLink = useCallback(async (url: string) => {
    const callAction = parseCallActionDeepLink(url);
    if (callAction) {
      setSelected(null);
      setActiveTab('chats');
      if (callAction.conversationId) {
        openConversationById(callAction.conversationId).catch(() => null);
      }
      if (callAction.action === 'open') {
        if (callAction.callId) {
          const prepared = await prepareIncomingCall(callAction.callId);
          setNotice(prepared ? 'Appel ouvert depuis la notification.' : 'Appel entrant introuvable ou deja termine.');
        } else {
          setNotice('');
        }
        return;
      }
      if (callAction.action === 'accept') {
        if (currentCallId && (!callAction.callId || callAction.callId === currentCallId)) {
          clearPendingCallAction();
          await answerNativeCall(true);
        } else if (callAction.callId && await prepareIncomingCall(callAction.callId)) {
          clearPendingCallAction();
          await answerNativeCall(true);
        } else {
          queuePendingCallAction({ action: 'accept', callId: callAction.callId, conversationId: callAction.conversationId });
          setNotice('Appel entrant en cours de synchronisation...');
        }
      } else if (callAction.action === 'reject') {
        if (currentCallId && (!callAction.callId || callAction.callId === currentCallId)) {
          clearPendingCallAction();
          await answerNativeCall(false);
        } else if (callAction.callId && await prepareIncomingCall(callAction.callId)) {
          clearPendingCallAction();
          await answerNativeCall(false);
        } else {
          queuePendingCallAction({ action: 'reject', callId: callAction.callId, conversationId: callAction.conversationId });
          setNotice('Refus de l’appel en attente de synchronisation...');
        }
      }
      return;
    }
    const conversationTarget = parseConversationTarget(url);
    if (conversationTarget) {
      await openConversationById(conversationTarget.conversationId);
      if (conversationTarget.callId) {
        const prepared = await prepareIncomingCall(conversationTarget.callId);
        setNotice(prepared ? 'Appel ouvert depuis la notification.' : 'Appel entrant introuvable ou deja termine.');
      }
      return;
    }
    await verifyPaystackReturn(url);
  }, [answerNativeCall, clearPendingCallAction, currentCallId, openConversationById, prepareIncomingCall, queuePendingCallAction, verifyPaystackReturn]);

  useEffect(() => {
    const pending = pendingCallActionRef.current;
    if (!pending || !currentCallId) return;
    if (pending.callId && pending.callId !== currentCallId) return;
    clearPendingCallAction();
    answerNativeCall(pending.action === 'accept').catch(error => {
      setNotice(error instanceof Error ? error.message : 'Action appel impossible.');
    });
  }, [answerNativeCall, clearPendingCallAction, currentCallId]);

  const handleNotificationResponse = useCallback((response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data || {};
    const url = typeof data.url === 'string' ? data.url : null;
    const conversationId = typeof data.conversationId === 'string' ? data.conversationId : null;
    const callId = typeof data.callId === 'string' ? data.callId : null;
    const type = typeof data.type === 'string' ? data.type : '';
    if (url) {
      void handleNativeDeepLink(url);
    } else if ((type === 'call' || type === 'call-sync') && callId) {
      void handleNativeDeepLink(`oraclemessenger://call?action=open&callId=${encodeURIComponent(callId)}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`);
    } else if (conversationId) {
      void openConversationById(conversationId);
    } else if (callId) {
      void handleNativeDeepLink(`oraclemessenger://call?action=open&callId=${encodeURIComponent(callId)}`);
    }
  }, [handleNativeDeepLink, openConversationById]);

  useEffect(() => {
    if (!session?.token) return;
    if (initialDeepLinkHandledRef.current) return;
    initialDeepLinkHandledRef.current = true;
    Linking.getInitialURL()
      .then(url => {
        if (url) void handleNativeDeepLink(url);
      })
      .catch(() => null);
  }, [handleNativeDeepLink, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    const subscription = Linking.addEventListener('url', event => {
      void handleNativeDeepLink(event.url);
    });
    return () => subscription.remove();
  }, [handleNativeDeepLink, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    if (!initialNotificationResponseHandledRef.current) {
      initialNotificationResponseHandledRef.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then(response => {
          if (response) handleNotificationResponse(response);
        })
        .catch(() => null);
    }
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data || {};
      const conversationId = typeof data.conversationId === 'string' ? data.conversationId : null;
      const type = typeof data.type === 'string' ? data.type : '';
      if (type === 'message' && conversationId && selectedRef.current?.id === conversationId) {
        const socket = ensureNativeSocket(session.token);
        socket.emit('conversation:join', { conversationId });
      }
    });
    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [handleNotificationResponse, session?.token]);

  useEffect(() => () => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    clearMediaRefreshTimers();
    clearPendingCallAction();
  }, [clearMediaRefreshTimers, clearPendingCallAction]);

  useEffect(() => {
    if (!session?.token) return;
    const socket = ensureNativeSocket(session.token);

    const onMessageNew = (message: Message) => {
      upsertMessage(message);
      if (message.senderId !== sessionRef.current?.user.id) {
        socket.emit('message:delivered', { messageId: message.id });
        if (selectedRef.current?.id === message.conversationId) {
          socket.emit('message:read', { conversationId: message.conversationId, messageId: message.id });
        }
        runMediaSync(session.token, session.user.id, [message]);
      }
    };

    const onConversationUpsert = (conversation: Conversation) => {
      upsertConversation(conversation);
    };

    const onMessageUpdate = ({ id, patch }: { id: string; patch: Partial<Message> }) => {
      patchMessage(id, patch);
    };

    const onConversationRead = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (userId === sessionRef.current?.user.id) {
        setConversations(current => current.map(item => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
        return;
      }
      setMessages(current => current.map(item => (
        item.conversationId === conversationId && item.senderId === sessionRef.current?.user.id
          ? { ...item, status: 'read' }
          : item
      )));
    };

    const onMessageDelete = ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      markMessageDeleted(conversationId, messageId);
    };

    const onTypingStart = ({ conversationId, userId, userName }: { conversationId: string; userId: string; userName?: string }) => {
      if (userId === sessionRef.current?.user.id) return;
      setTypingByConversation(current => ({
        ...current,
        [conversationId]: {
          ...(current[conversationId] || {}),
          [userId]: userName || 'Contact',
        },
      }));
    };

    const onTypingStop = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      setTypingByConversation(current => {
        const nextForConversation = { ...(current[conversationId] || {}) };
        delete nextForConversation[userId];
        return { ...current, [conversationId]: nextForConversation };
      });
    };

    const onOnline = ({ userId }: { userId: string }) => {
      setOnlineUsers(current => new Set([...current, userId]));
    };

    const onOffline = ({ userId }: { userId: string }) => {
      setOnlineUsers(current => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    };

    socket.on('message:new', onMessageNew);
    socket.on('conversation:upsert', onConversationUpsert);
    socket.on('message:update', onMessageUpdate);
    socket.on('conversation:read', onConversationRead);
    socket.on('message:delete', onMessageDelete);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('user:online', onOnline);
    socket.on('user:offline', onOffline);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('conversation:upsert', onConversationUpsert);
      socket.off('message:update', onMessageUpdate);
      socket.off('conversation:read', onConversationRead);
      socket.off('message:delete', onMessageDelete);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('user:online', onOnline);
      socket.off('user:offline', onOffline);
    };
  }, [markMessageDeleted, patchMessage, refreshLocalMediaIndex, runMediaSync, session?.token, session?.user.id, upsertConversation, upsertMessage]);

  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setNotice('');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signOut().catch(() => {});
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken;
      if (!idToken) {
        setNotice('Google n’a pas renvoyé de jeton de connexion.');
        return;
      }
      const next = await api.authGoogle(idToken);
      await saveSession(next);
      setSession(next);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshConversations(next.token);
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return;
      const message = error instanceof Error ? error.message : 'Connexion Google impossible.';
      setNotice(message.includes('DEVELOPER_ERROR')
        ? 'Connexion Google bloquée par la configuration Google Cloud.'
        : message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(false);
    }
  }, [refreshConversations]);

  const send = useCallback(async () => {
    const clean = draft.trim();
    if (!clean || !selected || !token) return;
    setDraft('');
    try {
      const socket = ensureNativeSocket(token);
      if (editingMessage) {
        socket.emit('message:edit', { messageId: editingMessage.id, content: clean });
        const message = await api.editMessage(editingMessage.id, token, clean);
        patchMessage(editingMessage.id, { content: message.content, isEdited: true, updatedAt: message.updatedAt });
        setEditingMessage(null);
      } else {
        const message = await socketAck<Message>(socket, 'message:send', {
          conversationId: selected.id,
          content: clean,
          type: 'text',
          replyToId: replyTo?.id,
        }).catch(() => api.sendMessage(selected.id, token, clean, 'text', replyTo?.id));
        upsertMessage({ ...message, status: message.status || 'sent', replyTo: replyTo || message.replyTo });
        setReplyTo(null);
      }
      await refreshConversations();
    } catch (error) {
      setDraft(clean);
      setNotice(error instanceof Error ? error.message : 'Envoi impossible.');
    }
  }, [draft, editingMessage, patchMessage, refreshConversations, replyTo, selected, token, upsertMessage]);

  const sendMedia = useCallback(async (input: { uri: string; name?: string; mime?: string; kind: 'image' | 'file' | 'video' | 'audio' | 'voice' }) => {
    if (!selected || !token) return false;
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
      const payload = JSON.stringify({
        url: uploaded.url,
        size: uploaded.size,
        checksum: uploaded.checksum,
        mime: uploaded.mime,
        name: uploaded.name,
      });
      const socket = ensureNativeSocket(token);
      const message = await socketAck<Message>(socket, 'message:send', {
        conversationId: selected.id,
        content: payload,
        type: input.kind,
      }).catch(() => api.sendMessage(selected.id, token, payload, input.kind));
      upsertMessage({ ...message, status: message.status || 'sent' });
      await refreshConversations();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Envoi média impossible.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refreshConversations, selected, token, upsertMessage]);

  const attachImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour envoyer une image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.86,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia({
      uri: asset.uri,
      name: asset.fileName || `media-${Date.now()}`,
      mime: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: asset.type === 'video' ? 'video' : 'image',
    });
  }, [sendMedia]);

  const attachDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia({
      uri: asset.uri,
      name: asset.name,
      mime: asset.mimeType || 'application/octet-stream',
      kind: asset.mimeType?.startsWith('audio/') ? 'audio' : 'file',
    });
  }, [sendMedia]);

  const ensureRecordAudioPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted) return true;
    const response = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone',
      message: 'Oracle Messenger utilise le microphone pour enregistrer les messages vocaux.',
      buttonPositive: 'Autoriser',
      buttonNegative: 'Refuser',
    });
    return response === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const toggleVoiceRecording = useCallback(async () => {
    if (!selected || !token) return;
    if (!OracleVoiceRecorder?.start || !OracleVoiceRecorder?.stop) {
      setNotice('Enregistrement vocal natif indisponible sur cette build.');
      return;
    }
    if (!voiceRecording) {
      const permitted = await ensureRecordAudioPermission();
      if (!permitted) {
        setNotice('Permission microphone refusee. Message vocal impossible.');
        return;
      }
      try {
        const started = await OracleVoiceRecorder.start();
        setVoiceRecording(true);
        setVoiceStartedAt(started.startedAt || Date.now());
        setNotice('Enregistrement vocal en cours.');
      } catch (error) {
        setVoiceRecording(false);
        setVoiceStartedAt(null);
        setNotice(error instanceof Error ? error.message : 'Demarrage vocal impossible.');
      }
      return;
    }

    setBusy(true);
    try {
      const recording = await OracleVoiceRecorder.stop();
      setVoiceRecording(false);
      setVoiceStartedAt(null);
      if (!recording.uri || !recording.size) {
        setNotice('Message vocal vide.');
        return;
      }
      const sent = await sendMedia({
        uri: recording.uri,
        name: recording.name || `voice-${Date.now()}.m4a`,
        mime: recording.mime || 'audio/mp4',
        kind: 'voice',
      });
      if (sent) setNotice('Message vocal envoye.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Envoi vocal impossible.');
    } finally {
      setBusy(false);
    }
  }, [ensureRecordAudioPermission, selected, sendMedia, token, voiceRecording]);

  const cancelVoiceRecording = useCallback(async () => {
    await OracleVoiceRecorder?.cancel?.().catch(() => null);
    setVoiceRecording(false);
    setVoiceStartedAt(null);
    setNotice('Enregistrement vocal annule.');
  }, []);

  const deleteOwnMessage = useCallback((message: Message) => {
    if (!token || message.senderId !== session?.user.id) return;
    const socket = ensureNativeSocket(token);
    socket.emit('message:delete', { conversationId: message.conversationId, messageId: message.id });
    api.deleteMessage(message.id, token)
      .then(() => {
        markMessageDeleted(message.conversationId, message.id);
        refreshConversations().catch(() => null);
      })
      .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression impossible.'));
  }, [markMessageDeleted, refreshConversations, session?.user.id, token]);

  const selectedMessages = useMemo(() => {
    if (!selectedMessageIds.length) return [];
    const ids = new Set(selectedMessageIds);
    return messages.filter(message => ids.has(message.id));
  }, [messages, selectedMessageIds]);

  const reactToMessage = useCallback((message: Message, emoji: string | null) => {
    if (!token) return;
    const socket = ensureNativeSocket(token);
    socket.emit('message:react', { messageId: message.id, emoji });
  }, [token]);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds(current => (
      current.includes(messageId)
        ? current.filter(id => id !== messageId)
        : [...current, messageId]
    ));
  }, []);

  const shareMessages = useCallback(async (items: Message[]) => {
    const body = items.map(message => messagePreview(message) === message.content ? message.content : `${messagePreview(message)}: ${message.content}`).join('\n\n');
    if (!body.trim()) return;
    try {
      await Share.share({ message: body });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage impossible.');
    }
  }, []);

  const beginForward = useCallback((items: Message[]) => {
    const valid = items.filter(message => !message.isDeleted);
    if (!valid.length) return;
    setForwardMessages(valid.slice(0, 50));
    setSelectedMessageIds([]);
  }, []);

  const forwardToConversation = useCallback(async (conversation: Conversation) => {
    if (!token || !forwardMessages.length) return;
    setBusy(true);
    setNotice('');
    try {
      const socket = ensureNativeSocket(token);
      for (const message of forwardMessages) {
        const forwarded = await socketAck<Message>(socket, 'message:send', {
          conversationId: conversation.id,
          content: message.content,
          type: message.type,
        }).catch(() => api.sendMessage(conversation.id, token, message.content, message.type));
        if (selected?.id === conversation.id) upsertMessage({ ...forwarded, status: forwarded.status || 'sent' });
      }
      setForwardMessages([]);
      await refreshConversations();
      setNotice(forwardMessages.length > 1 ? 'Messages transférés.' : 'Message transféré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Transfert impossible.');
    } finally {
      setBusy(false);
    }
  }, [forwardMessages, refreshConversations, selected?.id, token, upsertMessage]);

  const deleteSelectedOwnMessages = useCallback(() => {
    const own = selectedMessages.filter(message => message.senderId === session?.user.id && !message.isDeleted);
    if (!own.length) {
      setNotice('Aucun message sélectionné ne peut être supprimé par ce compte.');
      return;
    }
    Alert.alert('Supprimer', `${own.length} message(s) seront supprimés.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          own.forEach(message => deleteOwnMessage(message));
          setSelectedMessageIds([]);
        },
      },
    ]);
  }, [deleteOwnMessage, selectedMessages, session?.user.id]);

  const openMessageActions = useCallback((message: Message) => {
    const mine = message.senderId === session?.user.id;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Répondre', onPress: () => { setReplyTo(message); setEditingMessage(null); } },
      { text: 'Réagir ❤️', onPress: () => reactToMessage(message, '❤️') },
      { text: 'Sélectionner', onPress: () => toggleMessageSelection(message.id) },
      { text: 'Transférer', onPress: () => beginForward([message]) },
      { text: 'Partager', onPress: () => shareMessages([message]) },
    ];
    if (mine && message.type === 'text' && !message.isDeleted) {
      buttons.push({ text: 'Modifier', onPress: () => { setEditingMessage(message); setReplyTo(null); setDraft(message.content); } });
      buttons.push({ text: 'Supprimer', style: 'destructive', onPress: () => deleteOwnMessage(message) });
    }
    buttons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Message', messagePreview(message), buttons);
  }, [beginForward, deleteOwnMessage, reactToMessage, session?.user.id, shareMessages, toggleMessageSelection]);

  const deleteConversation = useCallback((conversation: Conversation) => {
    if (!token) return;
    Alert.alert(
      'Supprimer la conversation',
      `La conversation "${conversationName(conversation)}" sera retirée de ce compte. Les autres participants ne seront pas supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setNotice('');
            api.deleteConversation(conversation.id, token)
              .then(async () => {
                if (selected?.id === conversation.id) {
                  setSelected(null);
                  setMessages([]);
                }
                setConversations(current => current.filter(item => item.id !== conversation.id));
                await refreshConversations();
              })
              .catch(error => setNotice(error instanceof Error ? error.message : 'Suppression conversation impossible.'))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }, [refreshConversations, selected?.id, token]);

  const openConversationActions = useCallback((conversation: Conversation) => {
    Alert.alert('Conversation', conversationName(conversation), [
      { text: 'Ouvrir', onPress: () => { setActiveTab('chats'); loadMessages(conversation); } },
      { text: 'Supprimer de mon compte', style: 'destructive', onPress: () => deleteConversation(conversation) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [deleteConversation, loadMessages]);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    if (!token || !selected) return;
    const socket = ensureNativeSocket(token);
    socket.emit(value.trim() ? 'typing:start' : 'typing:stop', { conversationId: selected.id });
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (value.trim()) {
      typingStopTimerRef.current = setTimeout(() => {
        socket.emit('typing:stop', { conversationId: selected.id });
      }, 1800);
    }
  }, [selected, token]);

  const logout = useCallback(async () => {
    await OracleVoiceRecorder?.cancel?.().catch(() => null);
    await clearSession();
    setSession(null);
    setSelected(null);
    setReplyTo(null);
    setEditingMessage(null);
    setMessageSearch('');
    setSelectedMessageIds([]);
    setForwardMessages([]);
    setVoiceRecording(false);
    setVoiceStartedAt(null);
    setActiveTab('chats');
    setMessages([]);
    setConversations([]);
  }, []);

  const headerSubtitle = useMemo(() => {
    if (session?.user?.name) return `${session.user.name} • ${ANDROID_PACKAGE}`;
    return `${ANDROID_PACKAGE} • baseline ${NATIVE_BASELINE}`;
  }, [session?.user?.name]);

  const selectedTypingNames = useMemo(() => {
    if (!selected) return [];
    return Object.values(typingByConversation[selected.id] || {});
  }, [selected, typingByConversation]);

  const selectedOnline = useMemo(() => {
    if (!selected || !session?.user.id) return false;
    return selected.participants.some(user => user.id !== session.user.id && onlineUsers.has(user.id));
  }, [onlineUsers, selected, session?.user.id]);

  const visibleMessages = useMemo(() => {
    const needle = messageSearch.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter(message => {
      const haystack = [
        message.content,
        message.sender?.name,
        message.type,
        message.replyTo?.content,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [messageSearch, messages]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#FFFFFF" />
        <Text style={styles.loadingText}>Ouverture d&apos;Oracle Messenger...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.loginContent}>
          <View style={styles.loginHero}>
            <View style={styles.logo}>
              <View style={styles.logoBubble}>
                <Text style={styles.logoText}>O</Text>
              </View>
            </View>
            <Text style={styles.title}>Oracle Messenger</Text>
            <Text style={styles.subtitle}>
              Bienvenue. Connectez-vous pour retrouver vos messages.
            </Text>
            <View style={styles.heroLine} />
          </View>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Pressable
            disabled={busy}
            style={[styles.primaryButton, busy && styles.disabledButton]}
            onPress={signInWithGoogle}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.googleMark}>G</Text>}
            <Text style={styles.primaryButtonText}>Continuer avec Google</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (needsOnboarding) {
    return (
      <NativeOnboarding
        session={session}
        onComplete={completeOnboarding}
        onLogout={logout}
      />
    );
  }

  return (
    <SafeAreaView style={styles.app}>
      <NativeCallOverlay call={nativeCall} />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Oracle Messenger</Text>
          <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
        </View>
        <Pressable style={styles.headerButton} onPress={() => refreshConversations()}>
          <RefreshCcw size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.tabWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {visibleTabs.map(tab => (
            <Pressable key={tab.key} onPress={() => { setActiveTab(tab.key); if (tab.key !== 'chats') setSelected(null); }} style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}>
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {notice ? <Text style={styles.banner}>{notice}</Text> : null}

      {activeTab !== 'chats' && session ? (
        <NativeFeaturePage
          tab={activeTab}
          session={session}
          onOpenConversation={openConversationFromFeature}
          onRefreshConversations={() => refreshConversations()}
          onLogout={logout}
        />
      ) : selected ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatPanel}>
          <View style={styles.chatTopRow}>
            <Pressable style={styles.backRow} onPress={() => setSelected(null)}>
              <Text style={styles.backText}>Retour aux conversations</Text>
              <Text style={styles.chatPresence}>
                {selectedTypingNames.length
                  ? `${selectedTypingNames.slice(0, 2).join(', ')} écrit...`
                  : selectedOnline ? 'En ligne' : 'Hors ligne'}
              </Text>
            </Pressable>
            <View style={styles.callShortcutRow}>
              <Pressable style={styles.callShortcut} onPress={() => nativeCall.startCall(selected, 'audio')}>
                <Phone size={18} color="#FFFFFF" />
              </Pressable>
              <Pressable style={styles.callShortcut} onPress={() => nativeCall.startCall(selected, 'video')}>
                <Video size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          {nativeCall.callNotice ? <Text style={styles.banner}>{nativeCall.callNotice}</Text> : null}
          <View style={styles.messageSearchRow}>
            <TextInput
              value={messageSearch}
              onChangeText={setMessageSearch}
              placeholder="Rechercher dans la conversation"
              placeholderTextColor={colors.muted}
              style={styles.messageSearchInput}
            />
            {messageSearch ? (
              <Pressable onPress={() => setMessageSearch('')} style={styles.messageSearchClear}>
                <Text style={styles.messageSearchClearText}>×</Text>
              </Pressable>
            ) : null}
          </View>
          {selectedMessageIds.length ? (
            <View style={styles.selectionBar}>
              <Text style={styles.selectionText}>{selectedMessageIds.length} sélectionné(s)</Text>
              <Pressable style={styles.selectionButton} onPress={() => shareMessages(selectedMessages)}>
                <Text style={styles.selectionButtonText}>Partager</Text>
              </Pressable>
              <Pressable style={styles.selectionButton} onPress={() => beginForward(selectedMessages)}>
                <Text style={styles.selectionButtonText}>Transférer</Text>
              </Pressable>
              <Pressable style={styles.selectionDanger} onPress={deleteSelectedOwnMessages}>
                <Text style={styles.selectionDangerText}>Supprimer</Text>
              </Pressable>
              <Pressable style={styles.selectionClose} onPress={() => setSelectedMessageIds([])}>
                <Text style={styles.selectionCloseText}>×</Text>
              </Pressable>
            </View>
          ) : null}
          {forwardMessages.length ? (
            <View style={styles.forwardPanel}>
              <View style={styles.forwardHead}>
                <Text style={styles.forwardTitle}>Transférer {forwardMessages.length} message(s)</Text>
                <Pressable onPress={() => setForwardMessages([])} style={styles.selectionClose}>
                  <Text style={styles.selectionCloseText}>×</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forwardTargets}>
                {conversations.filter(item => item.id !== selected.id).slice(0, 20).map(conversation => (
                  <Pressable key={conversation.id} style={styles.forwardTarget} onPress={() => forwardToConversation(conversation)}>
                    <Text numberOfLines={1} style={styles.forwardTargetText}>{conversationName(conversation)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <FlatList
            data={visibleMessages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            ListEmptyComponent={messageSearch ? <Text style={styles.emptySearch}>Aucun message trouvé.</Text> : null}
            renderItem={({ item }) => {
              const mine = item.senderId === session.user.id;
              const isVoice = item.type === 'audio' || item.type === 'voice';
              const avatar = mine ? session.user.avatar : item.sender?.avatar;
              const avatarLabel = initials(mine ? session.user.name : item.sender?.name);
              const selectedForAction = selectedMessageIds.includes(item.id);
              return (
                <Pressable
                  onPress={() => selectedMessageIds.length ? toggleMessageSelection(item.id) : undefined}
                  onLongPress={() => openMessageActions(item)}
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, selectedForAction && styles.bubbleSelected]}
                >
                  {item.replyTo ? (
                    <View style={styles.replyPreview}>
                      <Text style={styles.replyPreviewTitle}>{item.replyTo.sender?.name || 'Réponse'}</Text>
                      <Text numberOfLines={1} style={styles.replyPreviewText}>{messagePreview(item.replyTo)}</Text>
                    </View>
                  ) : null}
                  {isVoice ? (
                    <View style={styles.voiceRow}>
                      {!mine ? (
                        <View style={styles.voiceAvatar}>
                          {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.voiceAvatarText}>{avatarLabel}</Text>}
                        </View>
                      ) : null}
                      <ChatMediaMessage message={item} localItem={localMediaByMessageId[item.id]} />
                      {mine ? (
                        <View style={styles.voiceAvatar}>
                          {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.voiceAvatarText}>{avatarLabel}</Text>}
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    item.type === 'text'
                      ? <Text style={styles.bubbleText}>{item.content}</Text>
                      : <ChatMediaMessage message={item} localItem={localMediaByMessageId[item.id]} />
                  )}
                  {item.reactions?.length ? (
                    <Text style={styles.reactionLine}>{item.reactions.map(reaction => reaction.emoji).join(' ')}</Text>
                  ) : null}
                  <Text style={styles.bubbleMeta}>{mine ? 'Moi' : item.sender?.name || 'Contact'} • {item.isEdited ? 'modifié • ' : ''}{item.status || 'sent'}</Text>
                </Pressable>
              );
            }}
          />
          <View style={styles.inputRow}>
            {replyTo || editingMessage ? (
              <View style={styles.composerContext}>
                <View style={styles.composerContextText}>
                  <Text style={styles.composerContextTitle}>{editingMessage ? 'Modifier le message' : 'Répondre'}</Text>
                  <Text numberOfLines={1} style={styles.composerContextPreview}>{messagePreview(editingMessage || replyTo)}</Text>
                </View>
                <Pressable onPress={() => { setReplyTo(null); setEditingMessage(null); setDraft(''); }} style={styles.contextClose}>
                  <Text style={styles.contextCloseText}>×</Text>
                </Pressable>
              </View>
            ) : null}
            {voiceRecording ? (
              <View style={styles.voiceRecordingBar}>
                <View style={styles.recordingDot} />
                <Text style={styles.voiceRecordingText}>
                  Enregistrement vocal{voiceStartedAt ? ` - ${Math.max(0, Math.floor((Date.now() - voiceStartedAt) / 1000))}s` : ''}
                </Text>
                <Pressable onPress={cancelVoiceRecording} style={styles.contextClose}>
                  <Text style={styles.contextCloseText}>×</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable style={styles.attachButton} onPress={attachImage} disabled={busy}>
              <ImageIcon size={19} color={colors.header} />
            </Pressable>
            <Pressable style={styles.attachButton} onPress={attachDocument} disabled={busy}>
              <Paperclip size={19} color={colors.header} />
            </Pressable>
            <Pressable style={[styles.attachButton, voiceRecording && styles.recordingButton]} onPress={toggleVoiceRecording} disabled={busy && !voiceRecording}>
              <Mic size={19} color={voiceRecording ? '#FFFFFF' : colors.header} />
            </Pressable>
            <TextInput value={draft} onChangeText={handleDraftChange} placeholder="Message" placeholderTextColor={colors.muted} style={styles.input} />
            <Pressable style={styles.sendButton} onPress={send}>
              <Send size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.listPanel}>
          <View style={styles.conversationSearchRow}>
            <TextInput
              value={conversationSearch}
              onChangeText={setConversationSearch}
              placeholder="Rechercher une conversation"
              placeholderTextColor={colors.muted}
              style={styles.conversationSearchInput}
            />
            {conversationSearch ? (
              <Pressable onPress={() => setConversationSearch('')} style={styles.messageSearchClear}>
                <Text style={styles.messageSearchClearText}>×</Text>
              </Pressable>
            ) : null}
          </View>
          {busy ? <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} /> : null}
          <FlatList
            data={conversations}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.conversationList}
            ListEmptyComponent={!busy ? <Text style={styles.emptySearch}>{conversationSearch.trim() ? 'Aucune conversation trouvée.' : 'Aucune conversation.'}</Text> : null}
            ListFooterComponent={<Pressable onPress={logout} style={styles.logoutButton}><Text style={styles.logoutText}>Déconnexion</Text></Pressable>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.conversationRow}
                onPress={() => { setActiveTab('chats'); loadMessages(item); }}
                onLongPress={() => openConversationActions(item)}
              >
                <View style={styles.avatar}>
                  {item.avatar ? <Image source={{ uri: item.avatar }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(conversationName(item))}</Text>}
                </View>
                <View style={styles.conversationText}>
                  <Text style={styles.conversationTitle}>{conversationName(item)}</Text>
                  <Text numberOfLines={1} style={styles.conversationPreview}>{messagePreview(item.lastMessage)}</Text>
                </View>
                {item.unreadCount ? <View style={styles.unread}><Text style={styles.unreadText}>{item.unreadCount}</Text></View> : null}
              </Pressable>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.header },
  app: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  loginContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 34 },
  loginHero: { alignItems: 'flex-start', marginBottom: 8 },
  logo: { width: 112, height: 112, borderRadius: 30, backgroundColor: '#10998C', alignItems: 'center', justifyContent: 'center', marginBottom: 30, shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 18, elevation: 8 },
  logoBubble: { width: 66, height: 66, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#0E6F66', fontSize: 38, lineHeight: 43, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: 0, maxWidth: 330 },
  subtitle: { color: 'rgba(255,255,255,0.76)', fontSize: 16, lineHeight: 24, marginTop: 12, fontWeight: '700', maxWidth: 340 },
  heroLine: { width: 54, height: 4, borderRadius: 2, backgroundColor: '#E7C86A', marginTop: 22 },
  notice: { color: '#FEE2E2', fontSize: 13, fontWeight: '800', marginTop: 16, lineHeight: 19 },
  primaryButton: { marginTop: 30, minHeight: 58, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 14, elevation: 5 },
  disabledButton: { opacity: 0.55 },
  googleMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', color: colors.brand, textAlign: 'center', lineHeight: 24, fontSize: 15, fontWeight: '900' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  onboardingSafe: { flex: 1, backgroundColor: colors.surface },
  onboardingContent: { flexGrow: 1, backgroundColor: colors.surface, paddingBottom: 28 },
  onboardingHeader: { backgroundColor: colors.brand, paddingHorizontal: 24, paddingTop: 34, paddingBottom: 54, alignItems: 'center' },
  onboardingEyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  onboardingTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 5 },
  onboardingSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  onboardingAvatarWrap: { width: 104, height: 104, borderRadius: 52, alignSelf: 'center', marginTop: -46 },
  onboardingAvatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.border, borderWidth: 4, borderColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 12, elevation: 5 },
  onboardingAvatarText: { color: colors.muted, fontSize: 40, fontWeight: '900' },
  onboardingCameraBadge: { position: 'absolute', right: 3, bottom: 3, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  onboardingHint: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 9 },
  onboardingError: { marginHorizontal: 20, marginTop: 14, padding: 11, borderRadius: 12, backgroundColor: '#FEF2F2', color: colors.danger, borderWidth: 1, borderColor: '#FECACA', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  onboardingForm: { paddingHorizontal: 20, paddingTop: 18, gap: 12 },
  fieldBlock: { gap: 7 },
  fieldLabel: { color: colors.brand, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  fieldCounter: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  onboardingInput: { minHeight: 50, borderRadius: 16, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, paddingVertical: 11, color: colors.text, fontSize: 15.5, fontWeight: '700' },
  onboardingTextarea: { minHeight: 82, textAlignVertical: 'top' },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  countryButton: { minWidth: 112, minHeight: 50, borderRadius: 15, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  countryFlag: { color: colors.text, fontSize: 13, fontWeight: '900' },
  countryDial: { color: colors.brand, fontSize: 14, fontWeight: '900' },
  countryChevron: { color: colors.muted, fontSize: 16, fontWeight: '900', marginTop: -3 },
  phoneInput: { flex: 1, minWidth: 0, backgroundColor: colors.surface },
  countryPicker: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, overflow: 'hidden' },
  countrySearch: { minHeight: 46, backgroundColor: colors.input, paddingHorizontal: 14, color: colors.text, fontWeight: '800', borderBottomWidth: 1, borderBottomColor: colors.border },
  countryOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  countryOptionFlag: { width: 30, color: colors.text, fontSize: 12, fontWeight: '900' },
  countryOptionName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  countryOptionDial: { color: colors.brand, fontSize: 13, fontWeight: '900' },
  onboardingSubmit: { marginTop: 10, minHeight: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 12, elevation: 4 },
  onboardingSubmitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  onboardingLogout: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  onboardingLogoutText: { color: colors.muted, fontSize: 13, fontWeight: '900' },
  header: { backgroundColor: colors.header, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  headerSubtitle: { color: 'rgba(255,255,255,0.68)', marginTop: 3, fontSize: 12, fontWeight: '700' },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  tabWrap: { backgroundColor: colors.header, paddingBottom: 10 },
  tabBar: { paddingHorizontal: 12, gap: 8 },
  tabItem: { minHeight: 38, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  tabItemActive: { backgroundColor: colors.brand },
  tabText: { color: 'rgba(255,255,255,0.76)', fontSize: 12.5, fontWeight: '900' },
  tabTextActive: { color: '#FFFFFF' },
  banner: { margin: 12, padding: 10, borderRadius: 12, backgroundColor: '#FFF7ED', color: '#9A3412', fontSize: 12.5, fontWeight: '800' },
  listPanel: { flex: 1 },
  conversationSearchRow: { marginHorizontal: 12, marginTop: 12, minHeight: 46, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  conversationSearchInput: { flex: 1, minHeight: 44, color: colors.text, fontWeight: '800', paddingHorizontal: 4 },
  conversationList: { padding: 12, paddingBottom: 24 },
  conversationRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
  avatar: { width: 50, height: 50, borderRadius: 18, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontWeight: '900', fontSize: 16 },
  conversationText: { flex: 1, minWidth: 0, marginLeft: 12 },
  conversationTitle: { color: colors.text, fontSize: 15.5, fontWeight: '900' },
  conversationPreview: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 3 },
  unread: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  unreadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  logoutButton: { marginTop: 8, alignItems: 'center', padding: 14 },
  logoutText: { color: colors.danger, fontWeight: '900' },
  chatPanel: { flex: 1 },
  chatTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 },
  backRow: { paddingHorizontal: 16, paddingVertical: 12 },
  backText: { color: colors.brand, fontWeight: '900' },
  chatPresence: { color: colors.muted, fontSize: 11.5, fontWeight: '800', marginTop: 2 },
  callShortcutRow: { flexDirection: 'row', gap: 8 },
  callShortcut: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  messageSearchRow: { marginHorizontal: 12, marginBottom: 8, minHeight: 44, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  messageSearchInput: { flex: 1, minHeight: 42, color: colors.text, fontWeight: '800', paddingHorizontal: 4 },
  messageSearchClear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  messageSearchClearText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  selectionBar: { marginHorizontal: 12, marginBottom: 8, padding: 8, borderRadius: 16, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  selectionText: { color: colors.header, fontSize: 12.5, fontWeight: '900', marginRight: 4 },
  selectionButton: { minHeight: 32, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  selectionButtonText: { color: colors.header, fontSize: 11.5, fontWeight: '900' },
  selectionDanger: { minHeight: 32, borderRadius: 12, backgroundColor: '#FEE2E2', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  selectionDangerText: { color: colors.danger, fontSize: 11.5, fontWeight: '900' },
  selectionClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(16,42,42,0.10)', alignItems: 'center', justifyContent: 'center' },
  selectionCloseText: { color: colors.header, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  forwardPanel: { marginHorizontal: 12, marginBottom: 8, padding: 10, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8 },
  forwardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  forwardTitle: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '900' },
  forwardTargets: { gap: 8, paddingRight: 4 },
  forwardTarget: { minHeight: 36, maxWidth: 150, borderRadius: 13, backgroundColor: '#EAF4F1', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  forwardTargetText: { color: colors.header, fontSize: 12, fontWeight: '900' },
  messagesList: { padding: 12, gap: 8 },
  bubble: { maxWidth: '82%', borderRadius: 18, padding: 12, marginBottom: 8 },
  bubbleSelected: { borderWidth: 2, borderColor: colors.accent },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#DCFCE7' },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptySearch: { color: colors.muted, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 30 },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  bubbleMeta: { color: colors.muted, fontSize: 10.5, marginTop: 5, fontWeight: '700' },
  replyPreview: { borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 8, marginBottom: 7 },
  replyPreviewTitle: { color: colors.header, fontSize: 11, fontWeight: '900' },
  replyPreviewText: { color: colors.muted, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  reactionLine: { alignSelf: 'flex-start', marginTop: 7, color: colors.header, fontSize: 15, fontWeight: '900' },
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
  voiceRow: { minWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 10 },
  voiceAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  voiceAvatarText: { color: colors.header, fontSize: 12, fontWeight: '900' },
  voiceWave: { flex: 1, minHeight: 38, borderRadius: 19, backgroundColor: 'rgba(16,42,42,0.08)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  voiceText: { color: colors.header, fontWeight: '900', fontSize: 13 },
  inputRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  composerContext: { width: '100%', minHeight: 48, borderRadius: 16, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  composerContextText: { flex: 1, minWidth: 0 },
  composerContextTitle: { color: colors.header, fontSize: 12, fontWeight: '900' },
  composerContextPreview: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  contextClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,42,42,0.10)' },
  contextCloseText: { color: colors.header, fontSize: 21, lineHeight: 24, fontWeight: '900' },
  voiceRecordingBar: { width: '100%', minHeight: 46, borderRadius: 16, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  voiceRecordingText: { flex: 1, color: colors.danger, fontSize: 12.5, fontWeight: '900' },
  attachButton: { width: 44, height: 46, borderRadius: 16, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center' },
  recordingButton: { backgroundColor: colors.danger },
  input: { flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: colors.input, paddingHorizontal: 14, color: colors.text, fontWeight: '700' },
  sendButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  callOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#061514', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 48 },
  remoteVideo: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  callTop: { width: '100%', alignItems: 'center', paddingTop: 12 },
  callTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', textAlign: 'center' },
  callStatus: { color: 'rgba(255,255,255,0.76)', fontSize: 14, fontWeight: '800', marginTop: 6 },
  callNotice: { color: '#FDE68A', fontSize: 12, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  callAvatar: { width: 132, height: 132, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', marginTop: 120 },
  callAvatarText: { color: '#FFFFFF', fontSize: 58, fontWeight: '900' },
  localVideoWrap: { position: 'absolute', right: 18, top: 110, width: 104, height: 144, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: '#111827' },
  localVideo: { width: '100%', height: '100%' },
  localVideoOff: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  callControls: { width: '100%', maxWidth: 430, minHeight: 96, borderRadius: 28, padding: 12, backgroundColor: 'rgba(0,0,0,0.34)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  callButton: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  rejectButton: { backgroundColor: '#EF4444' },
  acceptButton: { backgroundColor: '#22C55E' },
  callControl: { minWidth: 70, minHeight: 62, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, gap: 4 },
  callControlActive: { backgroundColor: 'rgba(18,140,126,0.72)' },
  callControlLabel: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '900', textAlign: 'center' },
});
