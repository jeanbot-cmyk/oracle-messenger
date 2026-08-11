import { useCallback, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { FRONTEND_URL } from '@/config/env';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { Conversation, User } from '@/types/messenger';
import { AlertText, Loading, PageHeader, PrimaryButton, SecondaryButton, Section, UserRow } from './FeatureUi';

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

function whatsappPhone(raw: string) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeUsername(raw?: string | null) {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase();
}

function inviteLink(user?: User) {
  const username = normalizeUsername(user?.username);
  return username ? `${FRONTEND_URL}/u/${encodeURIComponent(username)}` : `${FRONTEND_URL}/install`;
}

function formatOwnPhone(phone?: string | null) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (cleaned.startsWith('+') && digits.length >= 8) return `+${digits}`;
  return digits.length >= 8 ? digits : '';
}

function invitePhoneStatus(raw: string) {
  const cleaned = String(raw || '').replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8) return { valid: false, phone: '', international: false, e164: '' };
  if (cleaned.startsWith('+')) return { valid: true, phone: digits, international: true, e164: `+${digits}` };
  if (cleaned.startsWith('00') && digits.length > 2) {
    const internationalDigits = digits.replace(/^00/, '');
    return { valid: internationalDigits.length >= 8, phone: internationalDigits, international: internationalDigits.length >= 8, e164: internationalDigits.length >= 8 ? `+${internationalDigits}` : '' };
  }
  return { valid: true, phone: digits, international: false, e164: '' };
}

function inviteMessage(user?: User) {
  const senderName = user?.name?.trim() || 'Un contact';
  const phoneLine = formatOwnPhone(user?.phone) ? `\nMon contact : ${formatOwnPhone(user?.phone)}` : '';
  const link = inviteLink(user);
  const text = `Bonjour !\n${senderName} t'invite à rejoindre Oracle Messenger.${phoneLine}\n\nInstalle l'app :\n${link}`;
  return { link, text };
}

async function hashPhones(values: string[]) {
  const unique = [...new Set(values.flatMap(phoneCandidates))];
  const hashes = await Promise.all(unique.map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
  return [...new Set(hashes)];
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

  const invitePhone = useCallback(async () => {
    const normalized = invitePhoneStatus(phone);
    const { text } = inviteMessage(user);
    try {
      if (normalized.valid) {
        setNotice(normalized.international
          ? `Numéro international confirmé : ${normalized.e164}`
          : `Numéro local sans indicatif conservé tel quel : ${normalized.phone}`);
        await Linking.openURL(`sms:${encodeURIComponent(normalized.international ? normalized.e164 : normalized.phone)}?body=${encodeURIComponent(text)}`);
      } else {
        setNotice('Numéro incomplet. Partage général ouvert sans ajouter d’indicatif.');
        await Share.share({ title: 'Oracle Messenger', message: text, url: inviteLink(user) });
      }
    } catch {
      await Share.share({ title: 'Oracle Messenger', message: text, url: inviteLink(user) });
    }
  }, [phone, user]);

  const inviteWhatsApp = useCallback(async () => {
    const normalized = invitePhoneStatus(phone);
    const digits = whatsappPhone(normalized.phone);
    const { text } = inviteMessage(user);
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
    const { text } = inviteMessage(user);
    await Clipboard.setStringAsync(text);
    setNotice('Lien d’invitation copié.');
  }, [user]);

  const shareMessenger = useCallback(async () => {
    await Share.share({
      title: 'Oracle Messenger',
      message: 'Oracle Messenger: https://messenger.oracle-plus.online',
    });
  }, []);

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
      <PageHeader title="Contacts" />
      <Section title="Retrouver vos proches">
        <Text style={styles.pageCopy}>Importez, invitez et démarrez une discussion sans mélanger les comptes.</Text>
        <View style={styles.actionRow}>
          <PrimaryButton label="Importer mes contacts" onPress={importContacts} disabled={busy} />
          <SecondaryButton label="Partager Oracle Messenger" onPress={shareMessenger} disabled={busy} />
        </View>
        {importedCount ? <Text style={styles.cardMeta}>{importedCount} numéro(s) lus dans le carnet local.</Text> : null}
        <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher par nom, email ou username" placeholderTextColor={colors.muted} style={styles.input} />
        <PrimaryButton label="Rechercher" onPress={search} disabled={busy || !query.trim()} />
        <Loading active={busy} />
        <AlertText text={notice} />
        {results.map(user => <UserRow key={user.id} user={user} actionLabel="Écrire" onPress={() => createConversation(user)} />)}
      </Section>

      <Section title="Invitation">
        <Text style={styles.pageCopy}>Si le numéro n’a pas d’indicatif, Oracle Messenger demande de le compléter avant invitation.</Text>
        <TextInput value={phone} onChangeText={setPhone} placeholder="+225..." placeholderTextColor={colors.muted} keyboardType="phone-pad" style={styles.input} />
        <PrimaryButton label="Vérifier le numéro" onPress={matchPhone} disabled={busy || !phone.trim()} />
        <View style={styles.actionRow}>
          <SecondaryButton label="Inviter par SMS / partage" onPress={invitePhone} disabled={busy || !phone.trim()} />
          <SecondaryButton label="Inviter WhatsApp" onPress={inviteWhatsApp} disabled={busy || !phone.trim()} />
          <SecondaryButton label="Copier le lien" onPress={copyInvite} disabled={busy} />
        </View>
        <Text selectable style={styles.inviteLink}>{inviteLink(user)}</Text>
        {matched ? <UserRow user={matched} actionLabel="Écrire" onPress={() => createConversation(matched)} /> : null}
      </Section>
      <View style={styles.shareCta}>
        <PrimaryButton label="Partager Oracle Messenger" onPress={shareMessenger} disabled={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 96, gap: 0, backgroundColor: colors.background },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  inviteLink: { color: colors.brand, fontSize: 12, lineHeight: 17, fontWeight: '900' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  shareCta: { marginHorizontal: 32, marginTop: 18 },
});
