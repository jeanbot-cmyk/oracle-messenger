import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { FRONTEND_URL } from '@/config/env';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { Conversation, User } from '@/types/messenger';
import { AlertText, Loading, PageHeader, PrimaryButton, SecondaryButton, Section, UserRow } from './FeatureUi';

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
}: {
  contact: EnrichedContact;
  creating: boolean;
  onPress: () => void;
}) {
  const { local, appUser } = contact;
  const avatar = appUser?.avatar || local.avatar;
  return (
    <Pressable onPress={onPress} disabled={creating} style={styles.localRow}>
      <View style={styles.localAvatarWrap}>
        <View style={styles.localAvatar}>
          {avatar ? <Image source={{ uri: avatar }} style={styles.localAvatarImage} /> : <Text style={styles.localAvatarText}>{initials(local.name)}</Text>}
        </View>
        {appUser ? <View style={styles.onlineDot} /> : null}
      </View>
      <View style={styles.localRowText}>
        <Text numberOfLines={1} style={styles.localRowTitle}>{local.name}</Text>
        <Text numberOfLines={1} style={styles.localRowSub}>
          {appUser
            ? appUser.username ? `@${appUser.username}` : 'Envoyez-lui un message'
            : local.phones.join(', ') || local.emails[0] || 'Pas encore inscrit'}
        </Text>
      </View>
      <Text style={[styles.localRowAction, !appUser && styles.inviteAction]}>{appUser ? 'Écrire' : 'Inviter'}</Text>
    </Pressable>
  );
}

export function ContactsPage({
  token,
  user,
  onOpenConversation,
  onRefreshConversations,
}: {
  token: string;
  user: User;
  onOpenConversation: (conversation: Conversation) => void;
  onRefreshConversations: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [matched, setMatched] = useState<User | null>(null);
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
      const restored = mergeContacts(cached, manual);
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

  const importContacts = useCallback(async () => {
    setBusy(true);
    setNotice('');
    setActionNotice('Recherche de vos amis sur Oracle Messenger...');
    setMatched(null);
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        setNotice('Autorisez les contacts dans Android pour retrouver automatiquement vos proches inscrits sur Oracle Messenger.');
        return;
      }
      const response = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name, Contacts.Fields.Image],
        pageSize: 2000,
      });
      const deviceContacts = response.data.map(normalizeDeviceContact).filter(Boolean) as LocalContact[];
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

  const startInvite = useCallback((contact: LocalContact) => {
    setInviteContact(contact);
    setInvitePhone(contact.phones[0] || contact.emails[0] || '');
    setActionNotice('');
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

  const shareMessenger = useCallback(async () => {
    await Share.share({
      title: 'Oracle Messenger',
      message: 'Oracle Messenger: https://messenger.oracle-plus.online',
    });
  }, []);

  const invitePhoneDirect = useCallback(async () => {
    const normalized = invitePhoneStatus(phone);
    const link = inviteLink(user);
    const senderName = user.name?.trim() || 'Un contact';
    const phoneLine = formatOwnPhone(user.phone) ? `\nMon contact : ${formatOwnPhone(user.phone)}` : '';
    const text = `Bonjour !\n${senderName} t'invite à rejoindre Oracle Messenger.${phoneLine}\n\nInstalle l'app :\n${link}`;
    try {
      if (normalized.valid) {
        setNotice(normalized.international
          ? `Numéro international confirmé : ${normalized.e164}`
          : `Numéro local sans indicatif conservé tel quel : ${normalized.phone}`);
        await Linking.openURL(`sms:${encodeURIComponent(normalized.international ? normalized.e164 : normalized.phone)}?body=${encodeURIComponent(text)}`);
      } else {
        setNotice('Numéro incomplet. Partage général ouvert sans ajouter d’indicatif.');
        await Share.share({ title: 'Oracle Messenger', message: text, url: link });
      }
    } catch {
      await Share.share({ title: 'Oracle Messenger', message: text, url: link });
    }
  }, [phone, user]);

  const inviteWhatsAppDirect = useCallback(async () => {
    const normalized = invitePhoneStatus(phone);
    const digits = whatsappPhone(normalized.phone);
    const senderName = user.name?.trim() || 'Un contact';
    const text = `Bonjour !\n${senderName} t'invite à rejoindre Oracle Messenger.\n\nInstalle l'app :\n${inviteLink(user)}`;
    if (!digits || !normalized.international) {
      setNotice('WhatsApp demande un numéro avec indicatif, exemple +225...');
      return;
    }
    try {
      await Linking.openURL(`whatsapp://send?phone=${digits}&text=${encodeURIComponent(text)}`);
    } catch {
      await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`).catch(async () => {
        await Share.share({ title: 'Oracle Messenger', message: text, url: inviteLink(user) });
      });
    }
  }, [phone, user]);

  const copyInvite = useCallback(async () => {
    const senderName = user.name?.trim() || 'Un contact';
    const text = `Bonjour !\n${senderName} t'invite à rejoindre Oracle Messenger.\n\nInstalle l'app :\n${inviteLink(user)}`;
    await Clipboard.setStringAsync(text);
    setNotice('Lien d’invitation copié.');
  }, [user]);

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
    <ScrollView contentContainerStyle={styles.page}>
      <PageHeader
        title="Sélectionner un contact"
        subtitle={imported ? `${localContacts.length} contact${localContacts.length !== 1 ? 's' : ''}` : 'Retrouver mes amis sur Oracle Messenger'}
      />
      <AlertText text={notice || actionNotice} />

      {!imported ? (
        <Section title="Retrouver mes amis">
          <View style={styles.firstVisitCard}>
            <View style={styles.firstVisitIcon}><Text style={styles.firstVisitIconText}>👥</Text></View>
            <Text style={styles.firstVisitTitle}>Retrouver mes amis sur Oracle Messenger</Text>
            <Text style={styles.pageCopy}>Oracle Messenger vérifie votre carnet pour afficher uniquement les proches déjà inscrits. Rien n’est publié.</Text>
          </View>
          <PrimaryButton label="Retrouver mes amis" onPress={importContacts} disabled={busy} />
          <SecondaryButton label="+ Ajouter un contact manuellement" onPress={() => setShowAdd(true)} disabled={busy} />
          <SecondaryButton label="Partager Oracle Messenger" onPress={shareMessenger} disabled={busy} />
        </Section>
      ) : (
        <Section
          title="Contacts"
          right={<SecondaryButton label="Rafraîchir" onPress={importContacts} disabled={busy} />}
        >
          <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher un contact..." placeholderTextColor={colors.muted} style={styles.input} />
          <SecondaryButton label="+ Ajouter un contact manuellement" onPress={() => setShowAdd(true)} disabled={busy} />
          {importedCount ? <Text style={styles.cardMeta}>{importedCount} numéro(s) lus dans le carnet local.</Text> : null}
          <Loading active={busy} />
          {visibleContacts.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.pageCopy}>{query ? `Aucun résultat pour « ${query} »` : 'Aucun contact trouvé.'}</Text>
              <PrimaryButton label="+ Ajouter un contact" onPress={() => setShowAdd(true)} disabled={busy} />
            </View>
          ) : (
            <>
              {oracleContacts.length > 0 ? (
                <View style={styles.contactGroup}>
                  <Text style={styles.groupTitle}>Déjà sur Oracle Messenger</Text>
                  {oracleContacts.map((contact, index) => (
                    <LocalContactRow key={`oracle-${contactKey(contact.local)}-${index}`} contact={contact} creating={busy} onPress={() => handleLocalContactPress(contact)} />
                  ))}
                </View>
              ) : null}
              {inviteContacts.length > 0 ? (
                <View style={styles.contactGroup}>
                  <Text style={styles.groupTitle}>À inviter</Text>
                  {inviteContacts.map((contact, index) => (
                    <LocalContactRow key={`invite-${contactKey(contact.local)}-${index}`} contact={contact} creating={busy} onPress={() => handleLocalContactPress(contact)} />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </Section>
      )}

      <Section title="Recherche Oracle Messenger">
        <Text style={styles.pageCopy}>Rechercher directement par nom, email ou username.</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher par nom, email ou username" placeholderTextColor={colors.muted} style={styles.input} />
        <PrimaryButton label="Rechercher" onPress={search} disabled={busy || !query.trim()} />
        {results.map(item => <UserRow key={item.id} user={item} actionLabel="Écrire" onPress={() => createConversation(item)} />)}
      </Section>

      <Section title="Invitation">
        <Text style={styles.pageCopy}>Si le numéro n’a pas d’indicatif, Oracle Messenger le conserve tel quel et demande de le compléter avant WhatsApp.</Text>
        <TextInput value={phone} onChangeText={setPhone} placeholder="+225..." placeholderTextColor={colors.muted} keyboardType="phone-pad" style={styles.input} />
        <PrimaryButton label="Vérifier le numéro" onPress={matchPhone} disabled={busy || !phone.trim()} />
        <View style={styles.actionRow}>
          <SecondaryButton label="Inviter par SMS / partage" onPress={invitePhoneDirect} disabled={busy || !phone.trim()} />
          <SecondaryButton label="Inviter WhatsApp" onPress={inviteWhatsAppDirect} disabled={busy || !phone.trim()} />
          <SecondaryButton label="Copier le lien" onPress={copyInvite} disabled={busy} />
        </View>
        <Text selectable style={styles.inviteLink}>{inviteLink(user)}</Text>
        {matched ? <UserRow user={matched} actionLabel="Écrire" onPress={() => createConversation(matched)} /> : null}
      </Section>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAdd(false)}>
          <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Ajouter un contact</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="Nom (optionnel)" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput value={newPhone} onChangeText={setNewPhone} placeholder="Téléphone avec indicatif ou email" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.input} />
            <Text style={styles.pageCopy}>Oracle Messenger vérifie immédiatement si ce contact possède déjà un compte.</Text>
            <PrimaryButton label="Vérifier et ajouter" onPress={addManualContact} disabled={busy || (!newName.trim() && !newPhone.trim())} />
            <SecondaryButton label="Annuler" onPress={() => setShowAdd(false)} disabled={busy} />
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
            <PrimaryButton label="Partager l’invitation" onPress={shareInvite} disabled={busy} />
            {inviteContact?.phones.length ? (
              <View style={styles.actionRow}>
                <SecondaryButton label="Inviter sur WhatsApp" onPress={inviteByWhatsApp} disabled={busy} />
                <SecondaryButton label="SMS" onPress={inviteBySms} disabled={busy} />
              </View>
            ) : null}
            <SecondaryButton label="Copier le lien" onPress={copyContactInvite} disabled={busy} />
            <SecondaryButton label="Annuler" onPress={() => setInviteContact(null)} disabled={busy} />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 96, gap: 0, backgroundColor: colors.background },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  firstVisitCard: { alignItems: 'center', gap: 10, paddingVertical: 10 },
  firstVisitIcon: { width: 82, height: 82, borderRadius: 41, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  firstVisitIconText: { fontSize: 34 },
  firstVisitTitle: { color: colors.text, fontSize: 20, lineHeight: 24, fontWeight: '900', textAlign: 'center' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  inviteLink: { color: colors.brand, fontSize: 12, lineHeight: 17, fontWeight: '900' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  emptyBlock: { gap: 12, alignItems: 'center', paddingVertical: 16 },
  contactGroup: { gap: 0 },
  groupTitle: { color: colors.muted, fontSize: 12.5, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  localRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  localAvatarWrap: { position: 'relative', flexShrink: 0 },
  localAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  localAvatarImage: { width: '100%', height: '100%' },
  localAvatarText: { color: colors.header, fontWeight: '900', fontSize: 15 },
  onlineDot: { position: 'absolute', right: 1, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.online, borderWidth: 2, borderColor: colors.surface },
  localRowText: { flex: 1, minWidth: 0 },
  localRowTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '800' },
  localRowSub: { color: colors.muted, fontSize: 13.5, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  localRowAction: { color: colors.header, fontSize: 13, fontWeight: '900' },
  inviteAction: { color: colors.brand },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)', paddingHorizontal: 14, paddingBottom: 14 },
  sheet: { width: '100%', maxHeight: '88%', borderRadius: 24, backgroundColor: colors.surface, padding: 20, gap: 12 },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  radioOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.brand },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand },
  radioCopy: { flex: 1, minWidth: 0 },
  radioTitle: { color: colors.text, fontSize: 13.5, fontWeight: '900' },
  radioValue: { color: colors.muted, fontSize: 14, fontWeight: '700', marginTop: 2 },
  warningText: { color: '#92400E', backgroundColor: '#FFFBEB', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 12.5, lineHeight: 18, fontWeight: '800' },
  successText: { color: '#047857', fontSize: 12.5, lineHeight: 18, fontWeight: '900' },
});
