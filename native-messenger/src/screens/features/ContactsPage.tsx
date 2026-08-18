import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, InteractionManager, Linking, Modal, Pressable, ScrollView, SectionList, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { MessageCircle, Phone, RefreshCw, Search, Trash2, UserPlus, Video, X } from 'lucide-react-native';
import { FRONTEND_URL } from '@/config/env';
import { NativePhotoViewer } from '@/screens/home/NativePhotoViewer';
import { fastAvatarUri, highQualityImageUri } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { Conversation, User } from '@/types/messenger';
import { Loading } from './FeatureUi';

type LocalContact = {
  id?: string;
  name: string;
  phones: string[];
  emails: string[];
  avatar?: string | null;
};

type EnrichedContact = {
  local: LocalContact;
  appUser: User | null;
};

type InvitePhoneStatus = {
  valid: boolean;
  phone: string;
  last8: string;
  international: boolean;
  e164: string;
};

const CONTACT_CACHE_KEY = 'oracle-native-contacts';
const MANUAL_CONTACT_KEY = 'oracle-native-manual-contacts';
const HIDDEN_CONTACT_KEY = 'oracle-native-hidden-contacts';
const CONTACT_SYNC_META_KEY = 'oracle-native-contacts-sync-meta';
const CONTACT_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const ORACLE_MESSENGER_ICON = require('../../../assets/icon.png');
const INTERNATIONAL_DIAL_CODES = [
  '225', '237', '221', '223', '226', '224', '228', '229', '227',
  '243', '242', '241', '233', '234', '212', '213', '216',
  '33', '32', '41', '44', '49', '34', '39', '1',
].sort((a, b) => b.length - a.length);

function initials(name?: string | null) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

function normalizeUsername(raw?: string | null) {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase();
}

function inviteLink(user?: User) {
  const username = normalizeUsername(user?.username);
  return username ? `${FRONTEND_URL}/u/${encodeURIComponent(username)}` : `${FRONTEND_URL}/install`;
}

function analyzePhone(phone = '') {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');
  const hasPlusPrefix = raw.startsWith('+');
  const hasDoubleZeroPrefix = raw.startsWith('00');
  const bareDialCode = !hasPlusPrefix && !hasDoubleZeroPrefix
    ? INTERNATIONAL_DIAL_CODES.find(code => digits.startsWith(code) && digits.length >= code.length + 8)
    : '';
  const hasInternationalPrefix = hasPlusPrefix || hasDoubleZeroPrefix || Boolean(bareDialCode);
  const internationalDigits = hasPlusPrefix
    ? digits
    : hasDoubleZeroPrefix
      ? digits.slice(2)
      : bareDialCode
        ? digits
        : '';
  const digitsWithoutLeadingZero = digits.replace(/^0+/, '');

  return {
    raw,
    digits,
    hasInternationalPrefix,
    e164: internationalDigits.length >= 8 ? `+${internationalDigits}` : '',
    internationalDigits,
    digitsWithoutLeadingZero,
    suffix8: digits.length >= 8 ? digits.slice(-8) : '',
    suffix9: digits.length >= 9 ? digits.slice(-9) : '',
  };
}

function phoneMatchScore(localPhone = '', userPhone = '') {
  const local = analyzePhone(localPhone);
  const user = analyzePhone(userPhone);
  if (local.digits.length < 8 || user.digits.length < 8) return 0;

  if (local.e164 && user.e164 && local.e164 === user.e164) return 100;
  if (local.digits === user.digits) return 96;
  if (local.hasInternationalPrefix && local.internationalDigits && user.digits.endsWith(local.internationalDigits)) return 92;
  if (user.hasInternationalPrefix && user.internationalDigits && local.digits.endsWith(user.internationalDigits)) return 88;
  if (local.suffix9 && local.suffix9 === user.suffix9) return 64;
  if (local.suffix8 && local.suffix8 === user.suffix8) return 58;
  if (local.digitsWithoutLeadingZero.length >= 8 && user.digitsWithoutLeadingZero.endsWith(local.digitsWithoutLeadingZero.slice(-8))) return 54;
  return 0;
}

function phoneCandidates(raw: string) {
  const parsed = analyzePhone(raw);
  if (parsed.digits.length < 8) return [];
  const variants = new Set<string>();
  if (parsed.e164) variants.add(parsed.e164);
  if (parsed.internationalDigits) variants.add(parsed.internationalDigits);
  variants.add(parsed.digits);
  if (parsed.suffix8) variants.add(parsed.suffix8);
  if (parsed.suffix9) variants.add(parsed.suffix9);
  if (parsed.digitsWithoutLeadingZero.length >= 8) variants.add(parsed.digitsWithoutLeadingZero.slice(-8));
  if (parsed.digitsWithoutLeadingZero.length >= 9) variants.add(parsed.digitsWithoutLeadingZero.slice(-9));
  return [...variants];
}

function normalizeManualPhone(value = '') {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8) return '';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (trimmed.startsWith('00')) return `+${digits.slice(2)}`;
  return digits;
}

function normalizeManualEmail(value = '') {
  const trimmed = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : '';
}

function invitePhoneStatus(raw: string): InvitePhoneStatus {
  const parsed = analyzePhone(raw);
  if (parsed.digits.length < 8) return { valid: false, phone: '', last8: '', international: false, e164: '' };
  if (parsed.hasInternationalPrefix && parsed.internationalDigits.length >= 8) {
    return { valid: true, phone: parsed.internationalDigits, last8: parsed.suffix8, international: true, e164: `+${parsed.internationalDigits}` };
  }
  return { valid: true, phone: parsed.digits, last8: parsed.suffix8, international: false, e164: '' };
}

function whatsappPhone(raw: string) {
  return String(raw || '').replace(/\D/g, '');
}

function formatOwnPhone(phone?: string | null) {
  const parsed = analyzePhone(phone || '');
  if (parsed.e164) return parsed.e164;
  return parsed.digits.length >= 8 ? parsed.digits : '';
}

function contactKey(contact: LocalContact) {
  const phones = contact.phones
    .map(phone => {
      const parsed = analyzePhone(phone);
      return parsed.e164 || parsed.digits;
    })
    .filter(Boolean)
    .sort()
    .join(',');
  const emails = contact.emails.map(email => email.trim().toLowerCase()).filter(Boolean).sort().join(',');
  return `${contact.name.trim().toLowerCase()}|${phones}|${emails}`;
}

function contactIdentityKey(contact: LocalContact) {
  const phones = contact.phones
    .map(phone => {
      const parsed = analyzePhone(phone);
      return parsed.e164 || parsed.digits || parsed.suffix9 || parsed.suffix8;
    })
    .filter(Boolean)
    .sort()
    .join(',');
  const emails = contact.emails.map(email => email.trim().toLowerCase()).filter(Boolean).sort().join(',');
  const identity = `${phones}|${emails}`;
  return identity !== '|' ? identity : contactKey(contact);
}

function mergeContacts(base: LocalContact[], extra: LocalContact[]) {
  const seen = new Set<string>();
  const merged: LocalContact[] = [];
  for (const contact of [...base, ...extra]) {
    const key = contactKey(contact);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(contact);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

function localOnlyContacts(locals: LocalContact[]): EnrichedContact[] {
  return locals.map(local => ({ local, appUser: null }));
}

async function readDeviceContacts() {
  const response = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name, Contacts.Fields.Image],
    pageSize: 2000,
  });
  return response.data.map(normalizeDeviceContact).filter(Boolean) as LocalContact[];
}

function bestAppUserForLocalContact(local: LocalContact, matched: User[]) {
  const byEmail = local.emails
    .map(email => matched.find(user => user.email?.toLowerCase() === email.toLowerCase()))
    .find(Boolean);
  if (byEmail) return byEmail;

  const scored = matched
    .map(user => ({
      user,
      score: Math.max(0, ...local.phones.map(phone => phoneMatchScore(phone, user.phone ?? ''))),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  const best = scored[0];
  const sameBest = scored.filter(item => item.score === best.score);
  if (best.score < 80 && sameBest.length > 1) return null;
  return best.user;
}

function enrichContacts(locals: LocalContact[], matched: User[]) {
  return locals
    .map(local => ({ local, appUser: bestAppUserForLocalContact(local, matched) }))
    .sort((a, b) => {
      if (a.appUser && !b.appUser) return -1;
      if (!a.appUser && b.appUser) return 1;
      return a.local.name.localeCompare(b.local.name);
    });
}

function matchesContact(contact: EnrichedContact, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    contact.local.name,
    ...contact.local.phones,
    ...contact.local.emails,
    contact.appUser?.phone,
    contact.appUser?.email,
  ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
}

function normalizeDeviceContact(contact: Contacts.Contact): LocalContact | null {
  const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Inconnu';
  const phones = (contact.phoneNumbers || []).map(item => item.number || '').map(value => value.trim()).filter(Boolean);
  const emails = (contact.emails || []).map(item => item.email || '').map(value => value.trim().toLowerCase()).filter(Boolean);
  const avatar = contact.image?.uri || null;
  if (!phones.length && !emails.length) return null;
  return { id: (contact as { id?: string }).id, name, phones, emails, avatar };
}

async function hashPhones(values: string[]) {
  const unique = [...new Set(values.flatMap(phoneCandidates))];
  const hashes = await Promise.all(unique.map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
  return [...new Set(hashes)];
}

async function readStoredContacts(key: string) {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed as LocalContact[] : [];
  } catch {
    return [];
  }
}

async function writeStoredContacts(key: string, contacts: LocalContact[]) {
  await AsyncStorage.setItem(key, JSON.stringify(contacts));
}

async function readHiddenContactKeys(key: string) {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function writeHiddenContactKeys(key: string, values: string[]) {
  await AsyncStorage.setItem(key, JSON.stringify([...new Set(values.filter(Boolean))]));
}

async function readContactSyncMeta(userId: string) {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(`${CONTACT_SYNC_META_KEY}:${userId}`) || '{}');
    return typeof parsed === 'object' && parsed ? parsed as { refreshedAt?: number; importedCount?: number } : {};
  } catch {
    return {};
  }
}

async function writeContactSyncMeta(userId: string, importedCount: number) {
  await AsyncStorage.setItem(`${CONTACT_SYNC_META_KEY}:${userId}`, JSON.stringify({
    refreshedAt: Date.now(),
    importedCount,
  }));
}

function shouldRefreshDeviceContacts(meta: { refreshedAt?: number }) {
  const refreshedAt = Number(meta.refreshedAt || 0);
  return !refreshedAt || Date.now() - refreshedAt > CONTACT_REFRESH_INTERVAL_MS;
}

function filterHiddenContacts(contacts: LocalContact[], hiddenKeys: string[]) {
  const hidden = new Set(hiddenKeys);
  return contacts.filter(contact => !hidden.has(contactIdentityKey(contact)));
}

function buildInviteMessage(contact: LocalContact, user: User) {
  const senderName = user.name?.trim() || 'Un contact';
  const phoneLine = formatOwnPhone(user.phone) ? `\nMon contact : ${formatOwnPhone(user.phone)}` : '';
  const link = inviteLink(user);
  const msg = `Salut ${contact.name} !\n${senderName} t'invite à rejoindre Oracle Messenger.${phoneLine}\n\nInstalle l'app :`;
  return { link, msg, text: `${msg}\n${link}` };
}

function isRealtimeOnlineUser(user?: User | null) {
  return String(user?.status || '').toLowerCase() === 'online';
}

function LocalContactRow({
  contact,
  creating,
  onPress,
  onStartCall,
  onDelete,
  onAvatarPress,
}: {
  contact: EnrichedContact;
  creating: boolean;
  onPress: () => void;
  onStartCall?: (type: 'audio' | 'video') => void;
  onDelete: (contact: EnrichedContact) => void;
  onAvatarPress: (preview: { uri?: string | null; name: string; contact: EnrichedContact }) => void;
}) {
  const { local, appUser } = contact;
  const avatarSource = appUser?.avatar || local.avatar;
  const avatar = fastAvatarUri(avatarSource) || avatarSource;
  const previewAvatar = highQualityImageUri(avatarSource) || avatarSource;
  const displayName = (local.name.trim() || appUser?.name || 'Contact').replace(/^@+/, '');
  const appUserOnline = isRealtimeOnlineUser(appUser);
  const displaySub = appUser
    ? local.phones.join(', ') || local.emails[0] || 'Contact Oracle Messenger'
    : local.phones.join(', ') || local.emails[0] || 'Pas encore inscrit';
  return (
    <Pressable
      onPress={onPress}
      disabled={creating}
      android_ripple={{ color: appUser ? 'rgba(16,42,42,0.08)' : 'rgba(37,99,235,0.08)' }}
      style={({ pressed }) => [styles.localRow, appUser && styles.oracleLocalRow, pressed && styles.localRowPressed]}
    >
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Photo de ${displayName}`}
        onPress={event => {
          event.stopPropagation();
          onAvatarPress({ uri: previewAvatar, name: displayName, contact });
        }}
        hitSlop={8}
        style={styles.localAvatarWrap}
      >
        <View style={styles.localAvatar}>
          {avatar ? <Image source={{ uri: avatar, cache: 'force-cache' }} style={styles.localAvatarImage} resizeMode="cover" /> : <Text style={styles.localAvatarText}>{initials(displayName)}</Text>}
        </View>
        {appUserOnline ? <View style={styles.onlineDot} /> : null}
      </Pressable>
      <View style={styles.localRowText}>
        <Text numberOfLines={1} style={styles.localRowTitle}>{displayName}</Text>
        <Text numberOfLines={1} style={styles.localRowSub}>{displaySub}</Text>
      </View>
      {appUser && onStartCall ? (
        <View style={styles.localCallActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Appel audio avec ${displayName}`}
            disabled={creating}
            onPress={event => {
              event.stopPropagation();
              onStartCall('audio');
            }}
            hitSlop={8}
            style={[styles.localCallButton, creating && styles.disabledButton]}
          >
            <Phone size={17} color={colors.header} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Appel vidéo avec ${displayName}`}
            disabled={creating}
            onPress={event => {
              event.stopPropagation();
              onStartCall('video');
            }}
            hitSlop={8}
            style={[styles.localCallButton, creating && styles.disabledButton]}
          >
            <Video size={17} color={colors.header} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.localRowAction, appUser ? styles.writeAction : styles.inviteAction]}>{appUser ? 'Écrire' : 'Inviter'}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Supprimer ${displayName}`}
        disabled={creating}
        onPress={event => {
          event.stopPropagation();
          onDelete(contact);
        }}
        hitSlop={8}
        style={[styles.localDeleteButton, creating && styles.disabledButton]}
      >
        <Trash2 size={17} color={colors.danger} strokeWidth={2.4} />
      </Pressable>
    </Pressable>
  );
}

export function ContactsPage({
  token,
  user,
  initialAutoImportKey,
  onOpenConversation,
  onStartCallFromPeer,
  onRefreshConversations,
  onBack,
}: {
  token: string;
  user: User;
  initialAutoImportKey?: number;
  onOpenConversation: (conversation: Conversation) => void;
  onStartCallFromPeer?: (peerId: string, type: 'audio' | 'video') => Promise<void>;
  onRefreshConversations: () => Promise<void>;
  onBack?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [localContacts, setLocalContacts] = useState<LocalContact[]>([]);
  const [enrichedContacts, setEnrichedContacts] = useState<EnrichedContact[]>([]);
  const [imported, setImported] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [inviteContact, setInviteContact] = useState<LocalContact | null>(null);
  const [invitePhone, setInvitePhone] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<{ uri?: string | null; name: string; contact: EnrichedContact } | null>(null);
  const [contactsRestored, setContactsRestored] = useState(false);
  const lastAutoImportKeyRef = useRef(0);

  const cacheKey = `${CONTACT_CACHE_KEY}:${user.id}`;
  const manualKey = `${MANUAL_CONTACT_KEY}:${user.id}`;
  const hiddenKey = `${HIDDEN_CONTACT_KEY}:${user.id}`;
  const visibleContacts = useMemo(() => enrichedContacts.filter(contact => matchesContact(contact, query)), [enrichedContacts, query]);
  const oracleContactCount = useMemo(() => enrichedContacts.filter(contact => contact.appUser).length, [enrichedContacts]);
  const inviteContactCount = useMemo(() => enrichedContacts.filter(contact => !contact.appUser).length, [enrichedContacts]);
  const contactSections = useMemo(() => {
    const oracleContacts = visibleContacts.filter(contact => contact.appUser);
    const inviteContacts = visibleContacts.filter(contact => !contact.appUser);
    return [
      ...(oracleContacts.length ? [{ title: 'Contacts sur Oracle', data: oracleContacts }] : []),
      ...(inviteContacts.length ? [{ title: 'Contacts à inviter', data: inviteContacts }] : []),
    ];
  }, [visibleContacts]);
  const selectedInvitePhone = inviteContact ? invitePhoneStatus(invitePhone) : null;
  const firstVisitGreeting = useMemo(() => {
    const name = (user.name || user.username || '').replace(/^@+/, '').trim();
    return name ? `Bonjour ${name}` : 'Bienvenue';
  }, [user.name, user.username]);

  const matchLocalContacts = useCallback(async (locals: LocalContact[], background = false) => {
    if (!token || !locals.length) return;
    if (!background) setBusy(true);
    try {
      const hashes = await hashPhones(locals.flatMap(contact => contact.phones));
      const matchedUsers = hashes.length ? await api.matchPhoneHashes(token, hashes) : [];
      setEnrichedContacts(enrichContacts(locals, matchedUsers));
      if (!background) {
        setActionNotice(matchedUsers.length
          ? `${matchedUsers.length} contact(s) Oracle Messenger trouvé(s).`
          : 'Aucun contact Oracle Messenger trouvé. Vous pouvez inviter vos contacts.');
      }
    } catch (error) {
      if (!background) setNotice(error instanceof Error ? error.message : 'Vérification contacts impossible.');
    } finally {
      if (!background) setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    async function restoreContacts() {
      setContactsRestored(false);
      try {
        const [cached, manual, hidden, meta] = await Promise.all([
          readStoredContacts(cacheKey),
          readStoredContacts(manualKey),
          readHiddenContactKeys(hiddenKey),
          readContactSyncMeta(user.id),
        ]);
        let restored = mergeContacts(filterHiddenContacts(cached, hidden), filterHiddenContacts(manual, hidden));
        if (!restored.length && shouldRefreshDeviceContacts(meta)) {
          const permission = await Contacts.getPermissionsAsync().catch(() => null);
          if (permission?.granted) {
            const deviceContacts = await readDeviceContacts().catch(() => []);
            const visibleDeviceContacts = filterHiddenContacts(deviceContacts, hidden);
            restored = mergeContacts(visibleDeviceContacts, filterHiddenContacts(manual, hidden));
            if (deviceContacts.length) {
              await writeStoredContacts(cacheKey, visibleDeviceContacts);
              await writeContactSyncMeta(user.id, visibleDeviceContacts.flatMap(contact => contact.phones).length);
            }
          }
        }
        if (!active) return;
        if (!restored.length && meta.refreshedAt) {
          setImported(true);
          setImportedCount(Number(meta.importedCount || 0));
          return;
        }
        if (!restored.length) return;
        setLocalContacts(restored);
        setEnrichedContacts(localOnlyContacts(restored));
        setImported(true);
        setImportedCount(restored.flatMap(contact => contact.phones).length);
        void matchLocalContacts(restored, true);
      } finally {
        if (active) setContactsRestored(true);
      }
    }
    void restoreContacts();
    return () => {
      active = false;
    };
  }, [cacheKey, hiddenKey, manualKey, matchLocalContacts, user.id]);

  const createConversation = useCallback(async (contact: User) => {
    setBusy(true);
    setNotice('');
    setActionNotice('Ouverture de la conversation...');
    try {
      const conversation = await api.createConversation(contact.id, token);
      await onRefreshConversations();
      onOpenConversation(conversation);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Conversation impossible.');
    } finally {
      setActionNotice('');
      setBusy(false);
    }
  }, [onOpenConversation, onRefreshConversations, token]);

  const importContacts = useCallback(async (options?: { requestPermission?: boolean } | unknown) => {
    const requestPermission = Boolean(
      !options ||
      typeof options !== 'object' ||
      !('requestPermission' in options) ||
      (options as { requestPermission?: boolean }).requestPermission !== false,
    );
    setBusy(true);
    setNotice('');
    setActionNotice('Recherche de vos amis sur Oracle Messenger...');
    try {
      const currentPermission = await Contacts.getPermissionsAsync().catch(() => null);
      const permission = currentPermission?.granted
        ? currentPermission
        : requestPermission && currentPermission?.canAskAgain !== false
          ? await Contacts.requestPermissionsAsync()
          : currentPermission;
      if (!permission?.granted) {
        setImported(true);
        setImportedCount(0);
        await writeContactSyncMeta(user.id, 0);
        setNotice('Autorisez les contacts dans Android pour retrouver automatiquement vos proches inscrits sur Oracle Messenger.');
        return;
      }
      const deviceContacts = await readDeviceContacts();
      const hidden = await readHiddenContactKeys(hiddenKey);
      const manual = filterHiddenContacts(await readStoredContacts(manualKey), hidden);
      const visibleDeviceContacts = filterHiddenContacts(deviceContacts, hidden);
      const all = mergeContacts(visibleDeviceContacts, manual);
      setLocalContacts(all);
      setEnrichedContacts(localOnlyContacts(all));
      setImported(true);
      setImportedCount(visibleDeviceContacts.flatMap(contact => contact.phones).length);
      await writeStoredContacts(cacheKey, visibleDeviceContacts);
      await writeContactSyncMeta(user.id, visibleDeviceContacts.flatMap(contact => contact.phones).length);
      if (!all.length) {
        setActionNotice('');
        setNotice('Aucun contact avec numéro ou email n’a été trouvé dans ce téléphone.');
        return;
      }
      await matchLocalContacts(all);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Import contacts impossible.');
    } finally {
      setActionNotice('');
      setBusy(false);
    }
  }, [cacheKey, hiddenKey, manualKey, matchLocalContacts, user.id]);

  useEffect(() => {
    if (!contactsRestored) return;
    if (!initialAutoImportKey || lastAutoImportKeyRef.current === initialAutoImportKey) return;
    lastAutoImportKeyRef.current = initialAutoImportKey;
    if (imported) {
      setActionNotice(localContacts.length ? 'Contacts déjà importés. Synchronisation discrète en arrière-plan.' : '');
      if (localContacts.length) void matchLocalContacts(localContacts, true);
      return;
    }
    void importContacts();
  }, [contactsRestored, importContacts, imported, initialAutoImportKey, localContacts, matchLocalContacts]);

  useEffect(() => {
    if (!visibleContacts.length) return undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      visibleContacts
        .slice(0, 48)
        .map(contact => fastAvatarUri(contact.appUser?.avatar || contact.local.avatar))
        .filter((uri): uri is string => Boolean(uri))
        .forEach(uri => {
          Image.prefetch(uri).catch(() => undefined);
        });
    });
    return () => task.cancel();
  }, [visibleContacts]);

  const startInvite = useCallback((contact: LocalContact) => {
    setInviteContact(contact);
    setInvitePhone(contact.phones[0] || contact.emails[0] || '');
    setActionNotice('Choisissez WhatsApp, SMS ou partage pour envoyer l’invitation.');
  }, []);

  const handleLocalContactPress = useCallback(async (contact: EnrichedContact) => {
    if (contact.appUser) {
      await createConversation(contact.appUser);
      return;
    }
    startInvite(contact.local);
    if (contact.local.phones.length && !contact.local.phones.some(value => invitePhoneStatus(value).international)) {
      setActionNotice('Numéro incomplet. Ajoutez le code pays au numéro de votre contact avant de continuer.');
    }
  }, [createConversation, startInvite]);

  const handleLocalContactCall = useCallback(async (contact: EnrichedContact, type: 'audio' | 'video') => {
    if (!contact.appUser?.id || !onStartCallFromPeer) return;
    setBusy(true);
    setNotice('');
    setActionNotice(`Appel ${type === 'video' ? 'vidéo' : 'audio'} vers ${contact.local.name || 'ce contact'}...`);
    try {
      await onStartCallFromPeer(contact.appUser.id, type);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Appel impossible.');
    } finally {
      setActionNotice('');
      setBusy(false);
    }
  }, [onStartCallFromPeer]);

  const handlePhoneCallFromPreview = useCallback((contact: EnrichedContact) => {
    const phone = contact.local.phones[0]?.replace(/[^\d+]/g, '');
    if (!phone) {
      setNotice('Aucun numéro disponible pour ce contact.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => setNotice('Appel téléphone impossible.'));
  }, []);

  const closeAvatarAndMessage = useCallback((contact: EnrichedContact) => {
    setAvatarPreview(null);
    requestAnimationFrame(() => {
      void handleLocalContactPress(contact);
    });
  }, [handleLocalContactPress]);

  const closeAvatarAndCall = useCallback((contact: EnrichedContact, type: 'audio' | 'video') => {
    setAvatarPreview(null);
    requestAnimationFrame(() => {
      if (contact.appUser) {
        void handleLocalContactCall(contact, type);
        return;
      }
      handlePhoneCallFromPreview(contact);
    });
  }, [handleLocalContactCall, handlePhoneCallFromPreview]);

  const addManualContact = useCallback(async () => {
    const typed = newPhone.trim();
    const email = normalizeManualEmail(typed);
    const normalizedPhone = email ? '' : normalizeManualPhone(typed);
    if (!newName.trim() && !typed) return;
    if (typed && !email && !normalizedPhone) {
      setActionNotice('Entrez un numéro de téléphone ou une adresse email valide.');
      return;
    }

    const contact: LocalContact = {
      name: newName.trim() || typed,
      phones: normalizedPhone ? [normalizedPhone] : [],
      emails: email ? [email] : [],
      avatar: null,
    };
    const manual = await readStoredContacts(manualKey);
    const hidden = await readHiddenContactKeys(hiddenKey);
    const nextHidden = hidden.filter(key => key !== contactIdentityKey(contact));
    const nextManual = mergeContacts([contact], manual);
    const nextContacts = mergeContacts(localContacts, nextManual);
    await writeHiddenContactKeys(hiddenKey, nextHidden);
    await writeStoredContacts(manualKey, nextManual);
    setLocalContacts(nextContacts);
    setEnrichedContacts(localOnlyContacts(nextContacts));
    setImported(true);
    setShowAdd(false);
    setNewName('');
    setNewPhone('');
    setBusy(true);
    setActionNotice('Vérification du contact Oracle Messenger...');
    try {
      const matchedUser = await api.matchContact(token, {
        hashes: normalizedPhone ? await hashPhones([normalizedPhone]) : [],
        phone: normalizedPhone || undefined,
        email: email || undefined,
      });
      if (matchedUser?.id) {
        const enriched = enrichContacts(nextContacts, [matchedUser]);
        setEnrichedContacts(enriched);
        await createConversation(matchedUser);
        return;
      }
      setInviteContact(contact);
      setInvitePhone(contact.phones[0] || contact.emails[0] || '');
      setActionNotice('Aucun compte trouvé pour ce contact. Vous pouvez l’inviter.');
      await matchLocalContacts(nextContacts, true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ajout manuel impossible.');
    } finally {
      setBusy(false);
    }
  }, [createConversation, hiddenKey, localContacts, manualKey, matchLocalContacts, newName, newPhone, token]);

  const deleteLocalContact = useCallback((contact: EnrichedContact) => {
    const displayName = contact.local.name.trim() || contact.appUser?.name || 'ce contact';
    Alert.alert(
      'Supprimer le contact',
      `Retirer ${displayName} de vos contacts Oracle Messenger ? Les conversations et fichiers existants ne seront pas supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              setNotice('');
              setActionNotice('');
              try {
                const key = contactIdentityKey(contact.local);
                const hidden = await readHiddenContactKeys(hiddenKey);
                const cached = await readStoredContacts(cacheKey);
                const manual = await readStoredContacts(manualKey);
                const nextHidden = [...new Set([...hidden, key])];
                const nextCached = cached.filter(item => contactIdentityKey(item) !== key);
                const nextManual = manual.filter(item => contactIdentityKey(item) !== key);
                await Promise.all([
                  writeHiddenContactKeys(hiddenKey, nextHidden),
                  writeStoredContacts(cacheKey, nextCached),
                  writeStoredContacts(manualKey, nextManual),
                  writeContactSyncMeta(user.id, nextCached.flatMap(item => item.phones).length),
                  contact.appUser?.id ? api.deleteContact(contact.appUser.id, token).catch(() => null) : Promise.resolve(null),
                ]);
                const nextContacts = mergeContacts(nextCached, nextManual);
                setLocalContacts(nextContacts);
                setEnrichedContacts(localOnlyContacts(nextContacts));
                setImported(true);
                setImportedCount(nextContacts.flatMap(item => item.phones).length);
                if (nextContacts.length) void matchLocalContacts(nextContacts, true);
                setActionNotice('Contact supprimé de ce compte.');
              } catch (error) {
                setNotice(error instanceof Error ? error.message : 'Suppression du contact impossible.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [cacheKey, hiddenKey, manualKey, matchLocalContacts, token, user.id]);

  const shareInvite = useCallback(async () => {
    if (!inviteContact) return;
    const { link, msg } = buildInviteMessage(inviteContact, user);
    await Share.share({ title: 'Oracle Messenger', message: msg, url: link });
    setInviteContact(null);
    setActionNotice('Invitation envoyée.');
  }, [inviteContact, user]);

  const inviteBySms = useCallback(async () => {
    if (!inviteContact) return;
    const normalized = invitePhoneStatus(invitePhone);
    if (!normalized.valid) {
      setActionNotice('Sélectionnez un numéro valide pour SMS.');
      return;
    }
    const { text } = buildInviteMessage(inviteContact, user);
    setActionNotice(normalized.international
      ? `Numéro international confirmé : ${normalized.e164}`
      : `Numéro local sans indicatif conservé tel quel : ${normalized.phone}`);
    await Linking.openURL(`sms:${encodeURIComponent(normalized.international ? normalized.e164 : normalized.phone)}?body=${encodeURIComponent(text)}`).catch(async () => {
      await Share.share({ title: 'Oracle Messenger', message: text, url: inviteLink(user) });
    });
    setInviteContact(null);
  }, [inviteContact, invitePhone, user]);

  const inviteByWhatsApp = useCallback(async () => {
    if (!inviteContact) return;
    const normalized = invitePhoneStatus(invitePhone);
    if (!normalized.valid || !normalized.international) {
      setActionNotice('Numéro incomplet. Ajoutez le code pays au numéro de votre contact avant de continuer. Exemple : +225 XX XX XX XX XX.');
      return;
    }
    const { text } = buildInviteMessage(inviteContact, user);
    const digits = whatsappPhone(normalized.phone);
    await Linking.openURL(`whatsapp://send?phone=${digits}&text=${encodeURIComponent(text)}`).catch(async () => {
      await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`).catch(async () => {
        await Share.share({ title: 'Oracle Messenger', message: text, url: inviteLink(user) });
      });
    });
    setInviteContact(null);
  }, [inviteContact, invitePhone, user]);

  const copyContactInvite = useCallback(async () => {
    if (!inviteContact) return;
    const { text } = buildInviteMessage(inviteContact, user);
    await Clipboard.setStringAsync(text);
    setInviteContact(null);
    setActionNotice('Lien d’invitation copié.');
  }, [inviteContact, user]);

  return (
    <View style={styles.screen}>
      <View style={styles.inviteHeader}>
        <View style={styles.inviteHeaderRow}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Retour aux discussions" onPress={onBack} style={styles.inviteBackButton}>
              <Text style={styles.inviteBackText}>←</Text>
            </Pressable>
          ) : null}
          <View style={styles.inviteHeaderCopy}>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.04} style={styles.inviteHeaderTitle}>Sélectionner un contact</Text>
            {imported ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.04} style={styles.inviteHeaderSubtitle}>
                {localContacts.length} contact{localContacts.length !== 1 ? 's' : ''}
                {localContacts.length ? ` · ${oracleContactCount} sur Oracle · ${inviteContactCount} à inviter` : ''}
              </Text>
            ) : null}
          </View>
          {imported ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rafraîchir les contacts"
              onPress={importContacts}
              disabled={busy}
              style={[styles.headerRefreshButton, busy && styles.disabledButton]}
            >
              <RefreshCw size={18} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
          ) : null}
          {!imported ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={imported ? 'Synchroniser les contacts' : 'Importer mes contacts'}
              onPress={importContacts}
              disabled={busy}
              style={[styles.headerImportButton, busy && styles.disabledButton]}
            >
              <UserPlus size={17} color="#FFFFFF" strokeWidth={2.4} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.04} style={styles.headerImportText}>{imported ? 'Synchroniser' : 'Importer mes contacts'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {notice || actionNotice ? (
        <Text style={styles.inviteNotice}>{notice || actionNotice}</Text>
      ) : null}

      {imported ? (
        <View style={styles.searchArea}>
          <View style={styles.searchBox}>
            <Search size={16} color={colors.muted} strokeWidth={2.1} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un contact..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => setQuery('')} hitSlop={8}>
                <X size={16} color={colors.muted} strokeWidth={2.3} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={() => setShowAdd(true)} disabled={busy} style={[styles.manualButton, busy && styles.disabledButton]}>
            <Text maxFontSizeMultiplier={1.05} style={styles.manualButtonText}>+ Ajouter manuellement</Text>
          </Pressable>
          <Text style={styles.cardMeta}>
            {importedCount
              ? `${importedCount} numéro(s) lus · ${oracleContactCount} contact(s) sur Oracle · ${inviteContactCount} à inviter`
              : 'Les nouveaux contacts ajoutés au téléphone seront synchronisés automatiquement ou avec le bouton Synchroniser.'}
          </Text>
        </View>
      ) : null}

      {!imported ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.firstVisitContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.firstVisitWrap}>
            <View style={styles.firstVisitCard}>
              <View style={styles.firstVisitBrand}>
                <Image source={ORACLE_MESSENGER_ICON} style={styles.firstVisitBrandImage} />
              </View>
              <Text maxFontSizeMultiplier={1.05} style={styles.firstVisitTitle}>{firstVisitGreeting}</Text>
              <Text maxFontSizeMultiplier={1.05} style={styles.firstVisitCopy}>Importez vos contacts une seule fois. Ensuite Oracle Messenger synchronise discrètement les nouveaux contacts ajoutés au téléphone.</Text>
            </View>
            <Pressable onPress={importContacts} disabled={busy} style={[styles.invitePrimaryButton, busy && styles.disabledButton]}>
              <UserPlus size={18} color="#FFFFFF" strokeWidth={2.3} />
              <Text maxFontSizeMultiplier={1.05} style={styles.invitePrimaryText}>Importer mes contacts</Text>
            </Pressable>
            <Pressable onPress={() => setShowAdd(true)} disabled={busy} style={[styles.inviteSoftButton, busy && styles.disabledButton]}>
              <Text maxFontSizeMultiplier={1.05} style={styles.inviteSoftText}>+ Ajouter manuellement</Text>
            </Pressable>
            <Loading active={busy} />
          </View>
        </ScrollView>
      ) : (
        <SectionList
          style={styles.body}
          contentContainerStyle={styles.listContent}
          sections={contactSections}
          keyExtractor={(contact, index) => `${contact.appUser ? 'oracle' : 'invite'}-${contactIdentityKey(contact.local)}-${index}`}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          initialNumToRender={18}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={48}
          windowSize={8}
          removeClippedSubviews
          ListHeaderComponent={<Loading active={busy} />}
          ListEmptyComponent={(
            <View style={styles.emptyBlock}>
              <Text style={styles.pageCopy}>{query ? `Aucun résultat pour « ${query} »` : 'Aucun contact trouvé.'}</Text>
              <Pressable onPress={importContacts} disabled={busy} style={[styles.emptyAddButton, busy && styles.disabledButton]}>
                <Text style={styles.emptyAddText}>Synchroniser les contacts</Text>
              </Pressable>
              <Pressable onPress={() => setShowAdd(true)} disabled={busy} style={[styles.emptyManualButton, busy && styles.disabledButton]}>
                <Text style={styles.emptyManualText}>+ Ajouter manuellement</Text>
              </Pressable>
            </View>
          )}
          renderSectionHeader={({ section }) => (
            <Text style={styles.groupTitle}>{section.title}</Text>
          )}
          renderItem={({ item: contact }) => (
            <LocalContactRow
              contact={contact}
              creating={busy}
              onPress={() => handleLocalContactPress(contact)}
              onStartCall={contact.appUser ? type => void handleLocalContactCall(contact, type) : undefined}
              onDelete={deleteLocalContact}
              onAvatarPress={setAvatarPreview}
            />
          )}
        />
      )}

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAdd(false)}>
          <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Ajouter manuellement</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="Nom (optionnel)" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput value={newPhone} onChangeText={setNewPhone} placeholder="Téléphone avec indicatif ou email" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.input} />
            <Text style={styles.pageCopy}>Oracle Messenger vérifie immédiatement si ce contact possède déjà un compte.</Text>
            <Pressable
              onPress={addManualContact}
              disabled={busy || (!newName.trim() && !newPhone.trim())}
              style={[styles.sheetPrimaryButton, (busy || (!newName.trim() && !newPhone.trim())) && styles.disabledButton]}
            >
              <Text style={styles.sheetPrimaryText}>Vérifier et ajouter</Text>
            </Pressable>
            <Pressable onPress={() => setShowAdd(false)} disabled={busy} style={[styles.sheetSecondaryButton, busy && styles.disabledButton]}>
              <Text style={styles.sheetSecondaryText}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(inviteContact)} transparent animationType="slide" onRequestClose={() => setInviteContact(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setInviteContact(null)}>
          <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Inviter sur Oracle Messenger</Text>
            <Text style={styles.pageCopy}>Envoyez une invitation claire à {inviteContact?.name}. Le contact reçoit votre lien et peut vous retrouver directement.</Text>
            {(inviteContact?.phones.length ? inviteContact.phones : inviteContact?.emails || []).map(value => (
              <Pressable key={value} style={styles.radioRow} onPress={() => setInvitePhone(value)}>
                <View style={[styles.radioOuter, invitePhone === value && styles.radioOuterActive]}>
                  {invitePhone === value ? <View style={styles.radioInner} /> : null}
                </View>
                <View style={styles.radioCopy}>
                  <Text style={styles.radioTitle}>{inviteContact?.phones.length ? 'Numéro à inviter' : 'Adresse à inviter'}</Text>
                  <Text numberOfLines={1} style={styles.radioValue}>{value}</Text>
                </View>
              </Pressable>
            ))}
            {inviteContact?.phones.length ? (
              <>
                <TextInput value={invitePhone} onChangeText={setInvitePhone} placeholder="+225 XX XX XX XX XX" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={styles.input} />
                {selectedInvitePhone?.valid && !selectedInvitePhone.international ? (
                  <Text style={styles.warningText}>Numéro incomplet. Ajoutez le code pays au numéro de votre contact avant WhatsApp.</Text>
                ) : null}
                {selectedInvitePhone?.valid && selectedInvitePhone.international ? (
                  <Text style={styles.successText}>Numéro international prêt : {selectedInvitePhone.e164}</Text>
                ) : null}
              </>
            ) : null}
            <Pressable onPress={shareInvite} disabled={busy} style={[styles.sheetPrimaryButton, busy && styles.disabledButton]}>
              <Text style={styles.sheetPrimaryText}>Partager l’invitation</Text>
            </Pressable>
            {inviteContact?.phones.length ? (
              <View style={styles.sheetSplitRow}>
                <Pressable onPress={inviteByWhatsApp} disabled={busy} style={[styles.sheetSecondaryButton, styles.sheetSplitButton, busy && styles.disabledButton]}>
                  <Text style={styles.sheetSecondaryText}>Inviter sur WhatsApp</Text>
                </Pressable>
                <Pressable onPress={inviteBySms} disabled={busy} style={[styles.sheetSecondaryButton, styles.sheetSplitButton, busy && styles.disabledButton]}>
                  <Text style={styles.sheetSecondaryText}>SMS</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable onPress={copyContactInvite} disabled={busy} style={[styles.sheetSecondaryButton, busy && styles.disabledButton]}>
              <Text style={styles.sheetSecondaryText}>Copier le lien</Text>
            </Pressable>
            <Pressable onPress={() => setInviteContact(null)} disabled={busy} style={[styles.sheetCancelButton, busy && styles.disabledButton]}>
              <Text style={styles.sheetCancelText}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <NativePhotoViewer
        visible={Boolean(avatarPreview)}
        uri={avatarPreview?.uri}
        title={avatarPreview?.name}
        fallbackText={initials(avatarPreview?.name)}
        onClose={() => setAvatarPreview(null)}
      >
        {avatarPreview?.contact ? (
          <View style={styles.avatarPreviewActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Envoyer un message à ${avatarPreview.name}`}
              onPress={() => closeAvatarAndMessage(avatarPreview.contact)}
              style={styles.avatarPreviewPrimary}
            >
              <MessageCircle size={19} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.avatarPreviewPrimaryText}>Message</Text>
            </Pressable>
            <View style={styles.avatarPreviewCallRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Appeler ${avatarPreview.name}`}
                onPress={() => closeAvatarAndCall(avatarPreview.contact, 'audio')}
                style={styles.avatarPreviewSecondary}
              >
                <Phone size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.avatarPreviewSecondaryText}>Appel</Text>
              </Pressable>
              {avatarPreview.contact.appUser ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Appel vidéo avec ${avatarPreview.name}`}
                  onPress={() => closeAvatarAndCall(avatarPreview.contact, 'video')}
                  style={styles.avatarPreviewSecondary}
                >
                  <Video size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.avatarPreviewSecondaryText}>Vidéo</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </NativePhotoViewer>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  inviteHeader: { minHeight: 66, backgroundColor: colors.header, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)' },
  inviteHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteBackButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  inviteBackText: { color: '#FFFFFF', fontSize: 22, lineHeight: 24, fontWeight: '800' },
  inviteHeaderCopy: { flex: 1, minWidth: 0 },
  inviteHeaderTitle: { color: colors.onHeader, fontSize: 20, lineHeight: 23, fontWeight: '900' },
  inviteHeaderSubtitle: { color: colors.onHeaderMuted, fontSize: 14, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  headerRefreshButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  headerImportButton: { minHeight: 42, borderRadius: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 13, backgroundColor: colors.brand, shadowColor: colors.header, shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  headerImportText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  inviteNotice: { marginHorizontal: 14, marginTop: 10, borderRadius: 14, backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.14)', color: colors.header, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  searchArea: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, backgroundColor: colors.background },
  searchBox: { minHeight: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, minHeight: 42, color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '700', paddingVertical: 0 },
  manualButton: { marginTop: 10, minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  manualButtonText: { color: colors.brand, fontSize: 14, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  cardMeta: { color: colors.muted, fontSize: 12.5, lineHeight: 17, fontWeight: '700', marginTop: 7, marginLeft: 2 },
  body: { flex: 1 },
  firstVisitContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 20, paddingBottom: 104 },
  listContent: { paddingTop: 8, paddingBottom: 104 },
  firstVisitWrap: { gap: 14 },
  pageCopy: { color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  firstVisitCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 22, alignItems: 'center', gap: 12, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  firstVisitBrand: { width: 82, height: 82, borderRadius: 24, backgroundColor: colors.header, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 2, overflow: 'hidden', shadowColor: colors.header, shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  firstVisitBrandImage: { width: '100%', height: '100%' },
  firstVisitTitle: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  firstVisitCopy: { color: colors.secondary, fontSize: 15, lineHeight: 22, fontWeight: '800', textAlign: 'center' },
  invitePrimaryButton: { minHeight: 52, borderRadius: 18, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 18, shadowColor: colors.header, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  invitePrimaryText: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  inviteSoftButton: { minHeight: 48, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  inviteSoftText: { color: colors.header, fontSize: 14, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  disabledButton: { opacity: 0.55 },
  emptyBlock: { gap: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 44 },
  emptyAddButton: { minHeight: 44, borderRadius: 22, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyAddText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  emptyManualButton: { minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border },
  emptyManualText: { color: colors.header, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  contactListSurface: { backgroundColor: colors.surface },
  contactGroup: { gap: 0 },
  groupTitle: { color: colors.muted, fontSize: 13, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginHorizontal: 20, letterSpacing: 0 },
  localRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  oracleLocalRow: { backgroundColor: colors.surface },
  localRowPressed: { backgroundColor: '#EAF4F1' },
  localAvatarWrap: { position: 'relative', flexShrink: 0 },
  localAvatar: { width: 52, height: 52, borderRadius: 15, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  localAvatarImage: { width: '100%', height: '100%' },
  localAvatarText: { color: colors.header, fontWeight: '900', fontSize: 18 },
  onlineDot: { position: 'absolute', right: 1, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.online, borderWidth: 2, borderColor: colors.surface },
  localRowText: { flex: 1, minWidth: 0 },
  localRowTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '800' },
  localRowSub: { color: colors.muted, fontSize: 14, lineHeight: 18, fontWeight: '600', marginTop: 4 },
  localRowAction: { fontSize: 14, lineHeight: 18, fontWeight: '900', flexShrink: 0 },
  writeAction: { color: colors.header },
  inviteAction: { color: colors.brand },
  localCallActions: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  localCallButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF4F1', borderWidth: 1, borderColor: 'rgba(16,42,42,0.14)' },
  localDeleteButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  avatarPreviewActions: { width: '100%', maxWidth: 360, paddingHorizontal: 16, gap: 10 },
  avatarPreviewPrimary: { minHeight: 50, borderRadius: 25, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18 },
  avatarPreviewPrimaryText: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900' },
  avatarPreviewCallRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatarPreviewSecondary: { flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  avatarPreviewSecondaryText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)', paddingHorizontal: 14, paddingBottom: 14 },
  sheet: { width: '100%', maxHeight: '88%', borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18, gap: 12 },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: 6 },
  sheetTitle: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  input: { minHeight: 48, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontWeight: '700', borderWidth: 1.5, borderColor: colors.border },
  sheetPrimaryButton: { minHeight: 48, borderRadius: 16, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  sheetPrimaryText: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  sheetSecondaryButton: { minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  sheetSecondaryText: { color: colors.header, fontSize: 14, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  sheetSplitRow: { flexDirection: 'row', gap: 10 },
  sheetSplitButton: { flex: 1 },
  sheetCancelButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  sheetCancelText: { color: colors.muted, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  radioOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.brand },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand },
  radioCopy: { flex: 1, minWidth: 0 },
  radioTitle: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  radioValue: { color: colors.muted, fontSize: 15, lineHeight: 19, fontWeight: '700', marginTop: 4 },
  warningText: { color: '#92400E', backgroundColor: '#FFFBEB', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 14, padding: 11, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  successText: { color: '#047857', fontSize: 13, lineHeight: 18, fontWeight: '900' },
});
