import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { api } from '@/services/api';
import type { User } from '@/types/messenger';

export type LocalPhoneContact = {
  id?: string;
  name: string;
  phones: string[];
  emails: string[];
  avatar?: string | null;
};

const CONTACT_CACHE_KEY = 'oracle-native-contacts';
const MANUAL_CONTACT_KEY = 'oracle-native-manual-contacts';
const HIDDEN_CONTACT_KEY = 'oracle-native-hidden-contacts';
const CONTACT_SYNC_META_KEY = 'oracle-native-contacts-sync-meta';
const CONTACT_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const INTERNATIONAL_DIAL_CODES = [
  '225', '237', '221', '223', '226', '224', '228', '229', '227',
  '243', '242', '241', '233', '234', '212', '213', '216',
  '33', '32', '41', '44', '49', '34', '39', '1',
].sort((a, b) => b.length - a.length);

export function analyzePhone(phone = '') {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');
  const hasPlusPrefix = raw.startsWith('+');
  const hasDoubleZeroPrefix = raw.startsWith('00');
  const bareDialCode = !hasPlusPrefix && !hasDoubleZeroPrefix
    ? INTERNATIONAL_DIAL_CODES.find(code => digits.startsWith(code) && digits.length >= code.length + 8)
    : '';
  const internationalDigits = hasPlusPrefix
    ? digits
    : hasDoubleZeroPrefix
      ? digits.slice(2)
      : bareDialCode
        ? digits
        : '';
  const digitsWithoutLeadingZero = digits.replace(/^0+/, '');

  return {
    digits,
    e164: internationalDigits.length >= 8 ? `+${internationalDigits}` : '',
    internationalDigits,
    digitsWithoutLeadingZero,
    suffix8: digits.length >= 8 ? digits.slice(-8) : '',
    suffix9: digits.length >= 9 ? digits.slice(-9) : '',
  };
}

export function phoneCandidates(raw: string) {
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

function contactKey(contact: LocalPhoneContact) {
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

function contactIdentityKey(contact: LocalPhoneContact) {
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

function mergeContacts(base: LocalPhoneContact[], extra: LocalPhoneContact[]) {
  const seen = new Set<string>();
  const merged: LocalPhoneContact[] = [];
  for (const contact of [...base, ...extra]) {
    const key = contactKey(contact);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(contact);
  }
  return merged;
}

function filterHiddenContacts(contacts: LocalPhoneContact[], hiddenKeys: string[]) {
  const hidden = new Set(hiddenKeys);
  return contacts.filter(contact => !hidden.has(contactIdentityKey(contact)));
}

function normalizeDeviceContact(contact: Contacts.Contact): LocalPhoneContact | null {
  const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Inconnu';
  const phones = (contact.phoneNumbers || []).map(item => item.number || '').map(value => value.trim()).filter(Boolean);
  const emails = (contact.emails || []).map(item => item.email || '').map(value => value.trim().toLowerCase()).filter(Boolean);
  const avatar = contact.image?.uri || null;
  if (!phones.length && !emails.length) return null;
  return { id: (contact as { id?: string }).id, name, phones, emails, avatar };
}

async function readStoredContacts(key: string) {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed as LocalPhoneContact[] : [];
  } catch {
    return [];
  }
}

async function writeStoredContacts(key: string, contacts: LocalPhoneContact[]) {
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

function shouldRefreshDeviceContacts(cached: LocalPhoneContact[], meta: { refreshedAt?: number }) {
  if (!cached.length) return true;
  const refreshedAt = Number(meta.refreshedAt || 0);
  return !refreshedAt || Date.now() - refreshedAt > CONTACT_REFRESH_INTERVAL_MS;
}

async function readDeviceContactsIfAllowed() {
  const permission = await Contacts.getPermissionsAsync().catch(() => null);
  if (!permission?.granted) return [];
  const response = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name, Contacts.Fields.Image],
    pageSize: 2000,
  });
  return response.data.map(normalizeDeviceContact).filter(Boolean) as LocalPhoneContact[];
}

async function loadMergedPhoneContacts(userId: string) {
  const cacheKey = `${CONTACT_CACHE_KEY}:${userId}`;
  const manualKey = `${MANUAL_CONTACT_KEY}:${userId}`;
  const hiddenKey = `${HIDDEN_CONTACT_KEY}:${userId}`;
  const [hidden, cached, manual, meta] = await Promise.all([
    readHiddenContactKeys(hiddenKey),
    readStoredContacts(cacheKey),
    readStoredContacts(manualKey),
    readContactSyncMeta(userId),
  ]);

  let visibleDeviceContacts: LocalPhoneContact[] = cached;
  if (shouldRefreshDeviceContacts(cached, meta)) {
    const freshDeviceContacts = await readDeviceContactsIfAllowed();
    if (freshDeviceContacts.length) {
      visibleDeviceContacts = filterHiddenContacts(freshDeviceContacts, hidden);
      await writeStoredContacts(cacheKey, visibleDeviceContacts);
      await writeContactSyncMeta(userId, visibleDeviceContacts.flatMap(contact => contact.phones).length);
    } else if (!cached.length) {
      await writeContactSyncMeta(userId, 0);
    }
  }

  return mergeContacts(
    filterHiddenContacts(visibleDeviceContacts, hidden),
    filterHiddenContacts(manual, hidden),
  );
}

export async function loadLocalPhoneContactsForIdentity(userId: string): Promise<LocalPhoneContact[]> {
  return loadMergedPhoneContacts(userId);
}

export function findLocalPhoneContactForUser(user: Pick<User, 'phone' | 'email'>, localContacts: LocalPhoneContact[]) {
  const userPhoneCandidates = new Set(phoneCandidates(user.phone || ''));
  const userEmail = String(user.email || '').trim().toLowerCase();
  if (!userPhoneCandidates.size && !userEmail) return null;

  return localContacts.find(contact => {
    if (userEmail && contact.emails.some(email => email.trim().toLowerCase() === userEmail)) return true;
    if (!userPhoneCandidates.size) return false;
    return contact.phones.some(phone => phoneCandidates(phone).some(candidate => userPhoneCandidates.has(candidate)));
  }) || null;
}

export function privacyDisplayNameForUser(user: Pick<User, 'phone' | 'email' | 'username' | 'name'>, localContact?: LocalPhoneContact | null) {
  const localName = localContact?.name?.trim();
  if (localName) return localName.replace(/^@+/, '');
  const phone = String(user.phone || '').trim();
  if (phone) return phone;
  return 'Contact Oracle';
}

async function hashPhones(values: string[]) {
  const unique = [...new Set(values.flatMap(phoneCandidates))];
  const hashes = await Promise.all(unique.map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
  return [...new Set(hashes)];
}

export async function loadOracleUsersFromPhoneContacts(token: string, userId: string): Promise<User[]> {
  const localContacts = await loadMergedPhoneContacts(userId);
  const hashes = await hashPhones(localContacts.flatMap(contact => contact.phones));
  if (!hashes.length) return [];
  return api.matchPhoneHashes(token, hashes);
}
