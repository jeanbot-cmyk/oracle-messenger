import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { RefreshCw, Search, UserPlus, X } from 'lucide-react-native';
import { FRONTEND_URL } from '@/config/env';
import { NativePhotoViewer } from '@/screens/home/NativePhotoViewer';
import { highQualityImageUri } from '@/screens/home/homeUtils';
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
    contact.appUser?.name,
    contact.appUser?.username,
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

function buildInviteMessage(contact: LocalContact, user: User) {
  const senderName = user.name?.trim() || 'Un contact';
  const phoneLine = formatOwnPhone(user.phone) ? `\nMon contact : ${formatOwnPhone(user.phone)}` : '';
  const link = inviteLink(user);
  const msg = `Salut ${contact.name} !\n${senderName} t'invite à rejoindre Oracle Messenger.${phoneLine}\n\nInstalle l'app :`;
  return { link, msg, text: `${msg}\n${link}` };
}

function LocalContactRow({
  contact,
  creating,
  onPress,
  onAvatarPress,
}: {
  contact: EnrichedContact;
  creating: boolean;
  onPress: () => void;
  onAvatarPress: (preview: { uri?: string | null; name: string }) => void;
}) {
  const { local, appUser } = contact;
  const avatar = highQualityImageUri(appUser?.avatar || local.avatar) || appUser?.avatar || local.avatar;
  const displayName = (local.name.trim() || appUser?.name || 'Contact').replace(/^@+/, '');
  const appUserOnline = String(appUser?.status || '').toLowerCase() === 'online';
  const displaySub = appUser
    ? normalizeUsername(appUser.username) || appUser.phone || appUser.email || 'Envoyez-lui un message'
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
          onAvatarPress({ uri: avatar, name: displayName });
        }}
        hitSlop={8}
        style={styles.localAvatarWrap}
      >
        <View style={styles.localAvatar}>
          {avatar ? <Image source={{ uri: avatar }} style={styles.localAvatarImage} /> : <Text style={styles.localAvatarText}>{initials(displayName)}</Text>}
        </View>
        {appUserOnline ? <View style={styles.onlineDot} /> : null}
      </Pressable>
      <View style={styles.localRowText}>
        <Text numberOfLines={1} style={styles.localRowTitle}>{displayName}</Text>
        <Text numberOfLines={1} style={styles.localRowSub}>{displaySub}</Text>
      </View>
      <Text style={[styles.localRowAction, appUser ? styles.writeAction : styles.inviteAction]}>{appUser ? 'Écrire' : 'Inviter'}</Text>
    </Pressable>
  );
}

export function ContactsPage({
  token,
  user,
  onOpenConversation,
  onRefreshConversations,
  onBack,
}: {
  token: string;
  user: User;
  onOpenConversation: (conversation: Conversation) => void;
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
  const [avatarPreview, setAvatarPreview] = useState<{ uri?: string | null; name: string } | null>(null);

  const cacheKey = `${CONTACT_CACHE_KEY}:${user.id}`;
  const manualKey = `${MANUAL_CONTACT_KEY}:${user.id}`;
  const visibleContacts = useMemo(() => enrichedContacts.filter(contact => matchesContact(contact, query)), [enrichedContacts, query]);
  const oracleContacts = visibleContacts.filter(contact => contact.appUser);
  const inviteContacts = visibleContacts.filter(contact => !contact.appUser);
  const selectedInvitePhone = inviteContact ? invitePhoneStatus(invitePhone) : null;

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
      const cached = await readStoredContacts(cacheKey);
      const manual = await readStoredContacts(manualKey);
      let restored = mergeContacts(cached, manual);
      if (!restored.length) {
        const permission = await Contacts.getPermissionsAsync().catch(() => null);
        if (permission?.granted) {
          const deviceContacts = await readDeviceContacts().catch(() => []);
          restored = mergeContacts(deviceContacts, manual);
          if (deviceContacts.length) await writeStoredContacts(cacheKey, deviceContacts);
        }
      }
      if (!active || !restored.length) return;
      setLocalContacts(restored);
      setEnrichedContacts(localOnlyContacts(restored));
      setImported(true);
      setImportedCount(restored.flatMap(contact => contact.phones).length);
      void matchLocalContacts(restored, true);
    }
    void restoreContacts();
    return () => {
      active = false;
    };
  }, [cacheKey, manualKey, matchLocalContacts]);

  const createConversation = useCallback(async (contact: User) => {
    setBusy(true);
    setNotice('');
    setActionNotice(`Ouverture de la conversation avec ${contact.name || 'ce contact'}...`);
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

  const importContacts = useCallback(async () => {
    setBusy(true);
    setNotice('');
    setActionNotice('Recherche de vos amis sur Oracle Messenger...');
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        setNotice('Autorisez les contacts dans Android pour retrouver automatiquement vos proches inscrits sur Oracle Messenger.');
        return;
      }
      const deviceContacts = await readDeviceContacts();
      const manual = await readStoredContacts(manualKey);
      const all = mergeContacts(deviceContacts, manual);
      setLocalContacts(all);
      setEnrichedContacts(localOnlyContacts(all));
      setImported(Boolean(all.length));
      setImportedCount(deviceContacts.flatMap(contact => contact.phones).length);
      await writeStoredContacts(cacheKey, deviceContacts);
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
  }, [cacheKey, manualKey, matchLocalContacts]);

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
    const nextManual = mergeContacts([contact], manual);
    const nextContacts = mergeContacts(localContacts, nextManual);
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
  }, [createConversation, localContacts, manualKey, matchLocalContacts, newName, newPhone, token]);

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retrouver mes amis"
            onPress={importContacts}
            disabled={busy}
            style={[styles.headerImportButton, busy && styles.disabledButton]}
          >
            <UserPlus size={17} color="#FFFFFF" strokeWidth={2.4} />
            <Text numberOfLines={1} maxFontSizeMultiplier={1.04} style={styles.headerImportText}>Retrouver mes amis</Text>
          </Pressable>
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
            <Text maxFontSizeMultiplier={1.05} style={styles.manualButtonText}>+ Ajouter un contact manuellement</Text>
          </Pressable>
          {importedCount ? <Text style={styles.cardMeta}>{importedCount} numéro(s) lus dans le carnet local.</Text> : null}
        </View>
      ) : null}

      <ScrollView
        style={styles.body}
        contentContainerStyle={!imported ? styles.firstVisitContent : styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {!imported ? (
          <View style={styles.firstVisitWrap}>
            <View style={styles.firstVisitCard}>
              <View style={styles.firstVisitBrand}>
                <Image source={ORACLE_MESSENGER_ICON} style={styles.firstVisitBrandImage} />
              </View>
              <Text maxFontSizeMultiplier={1.05} style={styles.firstVisitTitle}>Oracle Messenger</Text>
              <Text maxFontSizeMultiplier={1.05} style={styles.firstVisitCopy}>Oracle Messenger vérifie et affiche les contacts enregistrés.</Text>
            </View>
            <Pressable onPress={importContacts} disabled={busy} style={[styles.invitePrimaryButton, busy && styles.disabledButton]}>
              <UserPlus size={18} color="#FFFFFF" strokeWidth={2.3} />
              <Text maxFontSizeMultiplier={1.05} style={styles.invitePrimaryText}>Retrouver mes amis</Text>
            </Pressable>
            <Pressable onPress={() => setShowAdd(true)} disabled={busy} style={[styles.inviteSoftButton, busy && styles.disabledButton]}>
              <Text maxFontSizeMultiplier={1.05} style={styles.inviteSoftText}>+ Ajouter un contact manuellement</Text>
            </Pressable>
            <Loading active={busy} />
          </View>
        ) : (
          <>
            <Loading active={busy} />
            {visibleContacts.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.pageCopy}>{query ? `Aucun résultat pour « ${query} »` : 'Aucun contact trouvé.'}</Text>
                <Pressable onPress={() => setShowAdd(true)} disabled={busy} style={[styles.emptyAddButton, busy && styles.disabledButton]}>
                  <Text style={styles.emptyAddText}>+ Ajouter un contact</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.contactListSurface}>
                {oracleContacts.length > 0 ? (
                  <View style={styles.contactGroup}>
                    <Text style={styles.groupTitle}>Déjà sur Oracle Messenger</Text>
                    {oracleContacts.map((contact, index) => (
                      <LocalContactRow key={`oracle-${contactKey(contact.local)}-${index}`} contact={contact} creating={busy} onPress={() => handleLocalContactPress(contact)} onAvatarPress={setAvatarPreview} />
                    ))}
                  </View>
                ) : null}
                {inviteContacts.length > 0 ? (
                  <View style={styles.contactGroup}>
                    <Text style={styles.groupTitle}>À inviter</Text>
                    {inviteContacts.map((contact, index) => (
                      <LocalContactRow key={`invite-${contactKey(contact.local)}-${index}`} contact={contact} creating={busy} onPress={() => handleLocalContactPress(contact)} onAvatarPress={setAvatarPreview} />
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAdd(false)}>
          <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Ajouter un contact</Text>
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
      />
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
  inviteHeaderTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 23, fontWeight: '900' },
  inviteHeaderSubtitle: { color: 'rgba(248,250,252,0.72)', fontSize: 14, lineHeight: 17, fontWeight: '700', marginTop: 2 },
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
  contactListSurface: { backgroundColor: colors.surface },
  contactGroup: { gap: 0 },
  groupTitle: { color: colors.muted, fontSize: 13, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginHorizontal: 20, letterSpacing: 0.4 },
  localRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  oracleLocalRow: { backgroundColor: colors.surface },
  localRowPressed: { backgroundColor: '#EAF4F1' },
  localAvatarWrap: { position: 'relative', flexShrink: 0 },
  localAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  localAvatarImage: { width: '100%', height: '100%' },
  localAvatarText: { color: colors.header, fontWeight: '900', fontSize: 18 },
  onlineDot: { position: 'absolute', right: 1, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.online, borderWidth: 2, borderColor: colors.surface },
  localRowText: { flex: 1, minWidth: 0 },
  localRowTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '800' },
  localRowSub: { color: colors.muted, fontSize: 14, lineHeight: 18, fontWeight: '600', marginTop: 4 },
  localRowAction: { fontSize: 14, lineHeight: 18, fontWeight: '900', flexShrink: 0 },
  writeAction: { color: colors.header },
  inviteAction: { color: colors.brand },
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
