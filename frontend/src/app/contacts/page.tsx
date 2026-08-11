'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useChatStore } from '../../store/chat';
import { buildChromeIntentUrl, shouldOpenAndroidLinkInChrome } from '../../lib/androidChrome';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { importNativeDeviceContacts, isCapacitorNativeRuntime } from '../../lib/nativeContacts';
import { MediaLightbox } from '../../components/ui/MediaLightbox';
import { matchesSearch } from '../../lib/search';
import { notify } from '../../lib/feedback';

interface LocalContact { name: string; phones: string[]; emails: string[]; avatar?: string | null }
interface AppUser { id: string; name: string; username: string; avatar?: string; phone?: string; email?: string }
interface EnrichedContact { local: LocalContact; appUser: AppUser | null }
interface InvitePhoneStatus { valid: boolean; phone: string; last8: string; international: boolean; e164: string }

const LEGACY_MANUAL_KEY = 'oracle-manual-contacts';
const LEGACY_CACHE_KEY  = 'oracle-contacts';
const ACCENT       = 'var(--accent)';
const ACCENT_TEXT  = 'var(--accent-text)';
const HEADER_BG    = 'var(--header-bg)';
const SURFACE      = 'var(--bg-surface)';
const APP_BG       = 'var(--bg-app)';
const BORDER       = 'var(--border)';
const INTERNATIONAL_DIAL_CODES = [
  '225', '237', '221', '223', '226', '224', '228', '229', '227',
  '243', '242', '241', '233', '234', '212', '213', '216',
  '33', '32', '41', '44', '49', '34', '39', '1',
].sort((a, b) => b.length - a.length);

function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
}

function normalizeUsername(value: string) {
  return decodeSafe(value).trim().replace(/^@+/, '').replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
}

function extractInviteUsername(value: string) {
  let raw = decodeSafe(value).trim();
  if (!raw) return '';

  const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) raw = urlMatch[0];

  try {
    const url = new URL(raw);
    const nestedFrom = url.searchParams.get('from');
    if (nestedFrom) return extractInviteUsername(nestedFrom);
    const parts = url.pathname.split('/').filter(Boolean);
    const uIndex = parts.findIndex(part => part.toLowerCase() === 'u');
    if (uIndex >= 0 && parts[uIndex + 1]) return normalizeUsername(parts[uIndex + 1]);
    if (parts.length === 1 && parts[0] !== 'contacts' && parts[0] !== 'install') return normalizeUsername(parts[0]);
  } catch {}

  const queryMatch = raw.match(/[?&]from=([^&#\s]+)/i);
  if (queryMatch?.[1]) return extractInviteUsername(queryMatch[1]);

  const pathMatch = raw.match(/\/u\/([^/?#\s]+)/i);
  if (pathMatch?.[1]) return normalizeUsername(pathMatch[1]);

  return normalizeUsername(raw.split(/\s+/)[0] || raw);
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
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
  const nationalDigits = hasInternationalPrefix ? '' : digits;
  const digitsWithoutLeadingZero = digits.replace(/^0+/, '');

  return {
    raw,
    digits,
    hasInternationalPrefix,
    bareDialCode: bareDialCode || '',
    e164: internationalDigits.length >= 8 ? `+${internationalDigits}` : '',
    internationalDigits,
    nationalDigits,
    digitsWithoutLeadingZero,
    suffix8: digits.length >= 8 ? digits.slice(-8) : '',
    suffix9: digits.length >= 9 ? digits.slice(-9) : '',
  };
}

async function phoneHashes(phones: string[]) {
  const variants = new Set<string>();
  for (const phone of phones) {
    const parsed = analyzePhone(phone);
    const { digits, digitsWithoutLeadingZero } = parsed;
    if (digits.length < 8) continue;

    if (parsed.e164) variants.add(parsed.e164);
    if (parsed.internationalDigits) variants.add(parsed.internationalDigits);
    variants.add(digits);
    if (parsed.suffix8) variants.add(parsed.suffix8);
    if (parsed.suffix9) variants.add(parsed.suffix9);
    if (digitsWithoutLeadingZero.length >= 8) variants.add(digitsWithoutLeadingZero.slice(-8));
    if (digitsWithoutLeadingZero.length >= 9) variants.add(digitsWithoutLeadingZero.slice(-9));
  }
  return Promise.all([...variants].map(value => sha256(value)));
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

async function normalizeNativeContact(c: any): Promise<LocalContact> {
  const icon = Array.isArray(c.icon) ? c.icon[0] : null;
  const avatar = icon instanceof Blob ? await readBlobAsDataUrl(icon) : null;
  return {
    name: c.name?.[0] ?? 'Inconnu',
    phones: (c.tel ?? []).map((p: string) => p.trim()).filter(Boolean),
    emails: (c.email ?? []).map((e: string) => e.trim()).filter(Boolean),
    avatar: avatar || null,
  };
}

function canUseContactPicker() {
  return typeof navigator !== 'undefined' && typeof (navigator as any).contacts?.select === 'function';
}

function canUseNativeContacts() {
  return isCapacitorNativeRuntime();
}

function scopedStorageKey(base: string, userId?: string) {
  return userId ? `${base}:${userId}` : '';
}

function readLocalContacts(key: string): LocalContact[] {
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalContacts(key: string, contacts: LocalContact[]) {
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(contacts));
}

function phonesMatch(a = '', b = '') {
  return phoneMatchScore(a, b) > 0;
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

function bestAppUserForLocalContact(local: LocalContact, matched: AppUser[]) {
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

  // Les 8/9 derniers chiffres servent uniquement de secours. En cas de collision,
  // on n'associe pas automatiquement le contact à un mauvais compte.
  if (best.score < 80 && sameBest.length > 1) return null;
  return best.user;
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

async function getSupportedContactProps() {
  const manager = (navigator as any).contacts;
  const fallback = ['name', 'tel', 'email'];
  if (typeof manager?.getProperties !== 'function') return fallback;
  try {
    const supported = await manager.getProperties();
    const props = ['name', 'tel', 'email', 'icon'].filter(prop => supported.includes(prop));
    return props.length ? props : fallback;
  } catch {
    return fallback;
  }
}

export default function ContactsPage() {
  const { lang } = useSettings();
  const { data: session, status } = useSession();
  const router     = useRouter();
  const token      = session?.user?.backendToken ?? '';
  const userId     = String((session?.user as any)?.id ?? '');
  const myName     = session?.user?.name ?? 'un ami';
  const myUsername = (session?.user as any)?.username ?? '';
  const myPhone    = (session?.user as any)?.phone ?? '';

  const { setActiveConv, setConversations, conversations } = useChatStore();

  const [contacts, setContacts] = useState<EnrichedContact[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [imported, setImported] = useState(false);
  const [search,   setSearch]   = useState('');
  const [invite,   setInvite]   = useState<LocalContact | null>(null);
  const [invitePhone, setInvitePhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [mounted,  setMounted]  = useState(false);
  const [showAdd,  setShowAdd]  = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [permDenied, setPermDenied] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingInvite, setPendingInvite] = useState('');
  const [inviteUser, setInviteUser] = useState<AppUser | null>(null);
  const [inviteOpening, setInviteOpening] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [photoPreview, setPhotoPreview] = useState<{ src: string; name: string } | null>(null);
  const matchSeqRef = useRef(0);
  const cacheKey = scopedStorageKey(LEGACY_CACHE_KEY, userId);
  const manualKey = scopedStorageKey(LEGACY_MANUAL_KEY, userId);

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const inviteFrom = extractInviteUsername(params.get('from') || '');
    if (status === 'unauthenticated') {
      if (inviteFrom) {
        const next = `/contacts?from=${encodeURIComponent(inviteFrom)}`;
        sessionStorage.setItem('oracle-after-login', next);
        localStorage.setItem('oracle-after-login', next);
        router.replace(`/login?from=${encodeURIComponent(inviteFrom)}`);
        return;
      }
      router.replace('/login');
    }
  }, [status]);

  useEffect(() => {
    if (!mounted || status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const inviteFrom = extractInviteUsername(params.get('from') || '');
    if (inviteFrom) {
      setPendingInvite(inviteFrom);
      if (token) openConvByUsername(inviteFrom);
      return;
    }
    if (!token) return;

    // Nettoyer les anciens caches globaux: ils ne sont pas liés au compte connecté.
    localStorage.removeItem(LEGACY_CACHE_KEY);
    localStorage.removeItem(LEGACY_MANUAL_KEY);

    // Charger uniquement le cache local du compte connecté.
    const cached = readLocalContacts(cacheKey);
    const manual = readLocalContacts(manualKey);
    const all = mergeContacts(cached, manual);

    if (all.length > 0) {
      // Cache existant → afficher immédiatement et re-matcher en arrière-plan.
      setImported(true);
      setContacts(localOnlyContacts(all));
      setLoading(false);
      matchWithBackend(all, { background: true });
      return;
    }

    setImported(false);
  }, [mounted, status, token, cacheKey, manualKey]);

  function mergeContacts(base: LocalContact[], extra: LocalContact[]): LocalContact[] {
    const seen = new Set(base.map(contactKey));
    const merged = [...base];
    for (const contact of extra) {
      const key = contactKey(contact);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(contact);
    }
    return merged;
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

  function localOnlyContacts(locals: LocalContact[]): EnrichedContact[] {
    return [...locals]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(local => ({ local, appUser: null }));
  }

  async function openConvByUsername(username: string) {
    const normalizedUsername = extractInviteUsername(username);
    if (!normalizedUsername) {
      setNotice('Le lien d’invitation est incomplet. Demandez à la personne de renvoyer son lien depuis son profil.');
      return;
    }
    setPendingInvite(normalizedUsername);
    if (!token) {
      setNotice('Votre session n’est pas encore prête. Appuyez sur “Reconnecter” pour continuer.');
      return;
    }
    setInviteOpening(true);
    setPermDenied(false);
    setNotice('Connexion à votre contact Oracle Messenger...');
    setActionNotice('Ouverture de la discussion...');
    let user: AppUser | null = null;
    try {
      user = await api.users.byUsername(normalizedUsername);
      setInviteUser(user);
    } catch {
      setNotice('Connexion impossible pour vérifier ce lien. Réessayez avec une bonne connexion.');
      setActionNotice('');
      setInviteOpening(false);
      return;
    }

    if (!user?.id) {
      setNotice('Ce lien Oracle Messenger est ancien ou incorrect. Demandez à la personne de renvoyer son lien depuis son profil.');
      setActionNotice('');
      setInviteOpening(false);
      return;
    }

    if (user.id === session?.user?.id) {
      setInviteOpening(false);
      router.replace('/chat');
      return;
    }

    try {
      const conv = await api.conversations.create(user.id, token);
      if (!conv?.id) throw new Error('Conversation non créée');
      const normalized = {
        ...conv,
        participants: Array.isArray(conv.participants) ? conv.participants : [user],
        unreadCount: conv.unreadCount ?? 0,
        lastMessage: conv.lastMessage ?? null,
      };
      const existing = useChatStore.getState().conversations;
      if (!existing.find(x => x.id === conv.id)) {
        setConversations([normalized, ...existing]);
      }
      setActiveConv(conv.id);
      sessionStorage.removeItem('oracle-after-login');
      localStorage.removeItem('oracle-after-login');
      setPendingInvite('');
      setNotice('');
      router.replace(`/chat?conv=${conv.id}`);
      return;
    } catch {
      setNotice('Le contact est trouvé, mais la conversation ne peut pas encore s’ouvrir. Vérifiez votre connexion puis réessayez.');
      setActionNotice('');
    } finally {
      setInviteOpening(false);
    }
  }

  const importAndMatch = useCallback(async () => {
    if (!token) {
      setNotice('Votre session n’est pas encore prête. Appuyez sur “Reconnecter” pour continuer.');
      return;
    }
    setLoading(true);
    setPermDenied(false);
    setNotice('');
    setActionNotice(canUseNativeContacts()
      ? 'Recherche de vos amis sur Oracle Messenger...'
      : canUseContactPicker()
        ? 'Ouverture du sélecteur de contacts...'
        : 'Ce navigateur ne donne pas accès aux contacts.'
    );
    let locals: LocalContact[] = [];
    try {
      const nativeImport = await importNativeDeviceContacts();
      if (nativeImport.supported) {
        if (nativeImport.denied) {
          setPermDenied(true);
          setNotice('Autorisez les contacts dans Android pour retrouver automatiquement vos proches inscrits sur Oracle Messenger.');
        }
        locals = nativeImport.contacts;
        if (locals.length > 0) {
          writeLocalContacts(cacheKey, locals);
          setNotice('Contacts synchronisés. Oracle Messenger affiche seulement ceux qui sont dans votre téléphone.');
        } else if (!nativeImport.denied) {
          setNotice('Aucun contact avec numéro ou email n’a été trouvé dans ce téléphone.');
        }
      } else if (canUseContactPicker()) {
        // Contact Picker API — le navigateur affiche sa propre UI de sélection
        const props = await getSupportedContactProps();
        const raw = await (navigator as any).contacts.select(props, { multiple: true });
        locals = await Promise.all((raw as any[]).map(normalizeNativeContact));
        if (locals.length > 0) {
          writeLocalContacts(cacheKey, locals);
        } else {
          setNotice('Aucun contact sélectionné. Appuyez sur “Ajouter un contact” pour continuer manuellement.');
        }
      } else {
        locals = readLocalContacts(cacheKey);
        if (locals.length === 0) {
          setNotice('Ce navigateur ne permet pas l’import automatique des contacts. Utilisez Chrome Android ou ajoutez un contact manuellement.');
          setActionNotice('');
        }
      }
    } catch (err: any) {
      // L'utilisateur a refusé ou l'API a échoué
      const denied =
        err?.name === 'SecurityError' ||
        err?.name === 'NotAllowedError' ||
        err?.message?.toLowerCase().includes('cancel') ||
        err?.message?.toLowerCase().includes('denied');
      if (denied) setPermDenied(true);
      setNotice('L’import des contacts n’a pas pu s’ouvrir. Autorisez les contacts ou ajoutez un contact manuellement.');
      locals = readLocalContacts(cacheKey);
    }
    const manual = readLocalContacts(manualKey);
    const all = mergeContacts(locals, manual);
    setImported(true);
    if (all.length > 0) {
      setContacts(localOnlyContacts(all));
      setLoading(false);
      setActionNotice('Contacts affichés. Vérification Oracle Messenger en arrière-plan...');
      matchWithBackend(all, { background: true });
    } else {
      setLoading(false);
      setImported(false);
      setActionNotice('');
      setNotice('Aucun contact local sélectionné. Ajoutez un contact manuellement ou ouvrez un lien d’invitation.');
    }
  }, [token, cacheKey, manualKey]);

  async function matchWithBackend(locals: LocalContact[], options: { background?: boolean } = {}) {
    const seq = ++matchSeqRef.current;
    try {
      const allPhones = locals.flatMap(c => c.phones);
      let matched: AppUser[] = [];
      if (token) {
        try { matched = await api.users.matchByPhoneHashes(await phoneHashes(allPhones), token); } catch {}
        matched = matched.filter((u, i, a) => a.findIndex(x => x.id === u.id) === i);
      }
      if (seq !== matchSeqRef.current) return;
      const enriched: EnrichedContact[] = locals.map(local => ({
        local,
        appUser: bestAppUserForLocalContact(local, matched),
      }));
      enriched.sort((a, b) => {
        if (a.appUser && !b.appUser) return -1;
        if (!a.appUser && b.appUser) return 1;
        return a.local.name.localeCompare(b.local.name);
      });
      setContacts(enriched);
      if (enriched.length === 0) {
        setNotice('Aucun contact importé n’est encore inscrit sur Oracle Messenger. Vous pouvez ajouter un contact manuellement ou inviter vos contacts.');
      }
      if (options.background) setActionNotice('');
    } finally {
      if (seq === matchSeqRef.current) setLoading(false);
    }
  }

  async function handleTap(c: EnrichedContact) {
    if (c.appUser) {
      setCreating(true);
      setActionNotice(`Ouverture de la conversation avec ${c.local.name}...`);
      try {
        const conv = await api.conversations.create(c.appUser.id, token);
        if (!conv?.id) throw new Error('no conv id');

        // Ensure participants is always an array (backend now returns filtered list)
        const normalized = {
          ...conv,
          participants: Array.isArray(conv.participants) ? conv.participants : [c.appUser],
          unreadCount: conv.unreadCount ?? 0,
          lastMessage: conv.lastMessage ?? null,
        };

        // Add to store if not already present, then activate
        const existing = useChatStore.getState().conversations;
        if (!existing.find(x => x.id === conv.id)) {
          setConversations([normalized, ...existing]);
        }
        setActiveConv(conv.id);
        router.push(`/chat?conv=${conv.id}`);
      } catch (err) {
        console.error('handleTap error', err);
        notify('Impossible d’ouvrir la conversation. Vérifiez votre connexion.', 'error');
      } finally {
        setCreating(false);
        setActionNotice('');
      }
    } else {
      startInvite(c.local);
    }
  }

  async function startInvite(contact: LocalContact) {
    if (contact.phones.length > 0) {
      const completePhone = contact.phones.find(phone => normalizeInviteDestinationPhone(phone).international);
      if (completePhone) {
        openWhatsAppInvite(contact, normalizeInviteDestinationPhone(completePhone));
        return;
      }
      openInviteSheet(contact);
      setActionNotice('Numéro incomplet. Ajoutez le code pays au numéro de votre contact avant de continuer.');
      return;
    }
    setActionNotice('Ouverture du partage...');
    const shared = await shareInvite(contact);
    if (!shared) openInviteSheet(contact);
  }

  function openInviteSheet(contact: LocalContact) {
    setInvite(contact);
    setInvitePhone(contact.phones[0] ?? contact.emails[0] ?? '');
    setActionNotice('');
  }

  function getInviteLink() {
    const base = 'https://messenger.oracle-plus.online';
    const username = normalizeUsername(myUsername);
    return username ? `${base}/u/${encodeURIComponent(username)}` : `${base}/install`;
  }

  function formatOwnPhoneForInvite(phone = '') {
    const parsed = analyzePhone(phone);
    if (parsed.e164) return parsed.e164;
    if (parsed.digits.length < 8) return '';
    return parsed.digits;
  }

  function normalizeInviteDestinationPhone(phone = ''): InvitePhoneStatus {
    const parsed = analyzePhone(phone);
    const { digits } = parsed;
    if (digits.length < 8) return { valid: false, phone: '', last8: '', international: false, e164: '' };

    if (parsed.hasInternationalPrefix && parsed.internationalDigits.length >= 8) {
      return { valid: true, phone: parsed.internationalDigits, last8: parsed.suffix8, international: true, e164: `+${parsed.internationalDigits}` };
    }

    return { valid: true, phone: digits, last8: parsed.suffix8, international: false, e164: '' };
  }

  function buildInviteMessage(contact: LocalContact) {
    const link = getInviteLink();
    const senderPhone = formatOwnPhoneForInvite(myPhone);
    const phoneLine = senderPhone ? `\nMon contact : ${senderPhone}` : '';
    const msg = `Salut ${contact.name} !\n${myName} t'invite à rejoindre Oracle Messenger.${phoneLine}\n\nInstalle l'app :`;
    return { link, msg, text: `${msg}\n${link}` };
  }

  async function shareInvite(contact: LocalContact) {
    const { link, msg } = buildInviteMessage(contact);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Oracle Messenger', text: msg, url: link });
        setActionNotice('Invitation envoyée.');
        setTimeout(() => setActionNotice(''), 2500);
        setInvite(null);
        return true;
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setActionNotice('Choisissez WhatsApp, SMS ou Copier le lien.');
          return false;
        }
        setActionNotice('');
        return true;
      }
    }
    setActionNotice('Choisissez WhatsApp, SMS ou Copier le lien.');
    return false;
  }

  function handleInvite() {
    if (!invite) return;
    shareInvite(invite);
  }

  function openWhatsAppInvite(contact: LocalContact, normalized: InvitePhoneStatus) {
    const { text } = buildInviteMessage(contact);
    const encodedText = encodeURIComponent(text);
    const nativeUrl = `whatsapp://send?phone=${normalized.phone}&text=${encodedText}`;
    const webUrl = `https://wa.me/${normalized.phone}?text=${encodedText}`;
    setActionNotice(`Ouverture de WhatsApp pour ${normalized.e164}...`);
    window.location.href = nativeUrl;
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        window.location.href = webUrl;
      }
    }, 900);
  }

  function inviteByWhatsApp() {
    if (!invite) return;
    const normalized = normalizeInviteDestinationPhone(invitePhone);
    if (!normalized.valid) {
      setActionNotice('Sélectionnez un numéro valide pour WhatsApp.');
      return;
    }
    if (!normalized.international) {
      setActionNotice('Numéro incomplet. Ajoutez le code pays au numéro de votre contact avant de continuer. Exemple : +225 XX XX XX XX XX.');
      return;
    }
    openWhatsAppInvite(invite, normalized);
    setInvite(null);
  }

  function inviteBySms() {
    if (!invite) return;
    const normalized = normalizeInviteDestinationPhone(invitePhone);
    if (!normalized.valid) {
      setActionNotice('Sélectionnez un numéro valide pour SMS.');
      return;
    }
    const { text } = buildInviteMessage(invite);
    setActionNotice(normalized.international
      ? `Numéro international confirmé : ${normalized.phone}`
      : `Numéro local sans indicatif conservé tel quel : ${normalized.phone}`);
    window.location.href = `sms:${encodeURIComponent(normalized.international ? `+${normalized.phone}` : normalized.phone)}?body=${encodeURIComponent(text)}`;
    setInvite(null);
  }

  async function copyInvite() {
    if (!invite) return;
    const { text } = buildInviteMessage(invite);
    await navigator.clipboard?.writeText(text);
    setActionNotice('Lien d’invitation copié.');
    setTimeout(() => setActionNotice(''), 2500);
    setInvite(null);
  }

  async function addManualContact() {
    const typed = newPhone.trim();
    const email = normalizeManualEmail(typed);
    const phone = email ? '' : normalizeManualPhone(typed);
    if (!newName.trim() && !typed) return;
    if (typed && !email && !phone) {
      setActionNotice('Entrez un numéro de téléphone ou une adresse email valide.');
      return;
    }

    const c: LocalContact = {
      name: newName.trim() || typed,
      phones: phone ? [phone] : [],
      emails: email ? [email] : [],
      avatar: null,
    };
    const manual = readLocalContacts(manualKey);
    const exists = manual.some(item => contactKey(item) === contactKey(c));
    const nextManual = exists ? manual : [c, ...manual];
    writeLocalContacts(manualKey, nextManual);
    setActionNotice('Vérification du contact Oracle Messenger...');
    setNewName('');
    setNewPhone('');
    setShowAdd(false);
    setImported(true);
    setLoading(true);

    let matchedUser: AppUser | null = null;
    if (token) {
      try {
        matchedUser = await api.users.matchContact({
          hashes: phone ? await phoneHashes([phone]) : [],
          phone: phone || undefined,
          email: email || undefined,
        }, token);
      } catch {}
    }

    if (matchedUser?.id) {
      setLoading(false);
      setContacts(current => {
        const next = [{ local: c, appUser: matchedUser }, ...current.filter(item => contactKey(item.local) !== contactKey(c))];
        return next;
      });
      setActionNotice('Contact trouvé. Ouverture de la conversation...');
      await handleTap({ local: c, appUser: matchedUser });
      return;
    }

    setActionNotice('Aucun compte trouvé pour ce contact. Vous pouvez l’inviter.');
    setTimeout(() => setActionNotice(''), 3500);
    await matchWithBackend(mergeContacts(readLocalContacts(cacheKey), nextManual));
  }

  const filtered      = contacts.filter(c => matchesSearch([
    c.local.name,
    ...c.local.phones,
    ...c.local.emails,
    c.appUser?.name,
    c.appUser?.username,
    c.appUser?.phone,
  ], search));
  const oracleContacts = filtered.filter(c => c.appUser);
  const inviteContacts = filtered.filter(c => !c.appUser);
  const isNativeApp   = canUseNativeContacts();
  const hasNative     = isNativeApp || canUseContactPicker();
  const invitePhoneStatus = invite ? normalizeInviteDestinationPhone(invitePhone) : null;

  if (!mounted || status === 'loading') return <Spinner />;

  function reconnect() {
    const current = `${window.location.pathname}${window.location.search || ''}`;
    sessionStorage.setItem('oracle-after-login', current);
    localStorage.setItem('oracle-after-login', current);
    router.replace('/login');
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: APP_BG }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{-webkit-tap-highlight-color:transparent}`}</style>

      {/* Header */}
      <div style={{ padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: 'var(--header-bg)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
        <button onClick={() => router.back()}
          className="om-icon-button"
          style={{ flexShrink: 0, background:'rgba(255,255,255,0.10)', borderColor:'rgba(255,255,255,0.16)', color:'#FFFFFF' }}>
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: 0, lineHeight: 1.14 }}>Sélectionner un contact</h1>
          {imported && !loading && (
            <p style={{ fontSize: 15, color: 'rgba(248,250,252,0.72)', margin: '2px 0 0', lineHeight: 1.2 }}>
              {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {imported && (
            <button onClick={importAndMatch} disabled={loading} title="Rafraîchir"
              className="om-icon-button"
              style={{ opacity: loading ? 0.5 : 1 }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          )}
          <button onClick={importAndMatch} disabled={loading}
            style={{ minHeight: 42, borderRadius: 999, border: 'none', background: 'var(--brand)', color: 'var(--accent-text)', cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0 14px', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', boxShadow:'0 8px 18px rgba(16,42,42,0.14)' }}>
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 8v6m3-3h-6"/>
            </svg>
              Retrouver mes amis
          </button>
        </div>
      </div>

      {(!token || notice || pendingInvite) && (
        <div style={{ flexShrink: 0, margin: '10px 14px 0', background: pendingInvite ? '#ecfdf5' : '#EAF4F1', border: `1px solid ${pendingInvite ? '#a7f3d0' : 'rgba(16,42,42,0.14)'}`, borderRadius: 14, padding: '12px 14px', color: pendingInvite ? '#065f46' : '#102A2A' }}>
          {inviteUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar name={inviteUser.name} avatar={inviteUser.avatar} size={42} onOpen={inviteUser.avatar ? () => setPhotoPreview({ src: inviteUser.avatar!, name: inviteUser.name }) : undefined} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.25, fontWeight: 900, color: '#064e3b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inviteUser.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, lineHeight: 1.25, fontWeight: 700, color: '#047857', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{inviteUser.username}</p>
              </div>
            </div>
          )}
          {pendingInvite && (
            <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.45, fontWeight: 800 }}>
              Invitation reçue : @{pendingInvite}
            </p>
          )}
          {notice && (
            <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.45, fontWeight: 650 }}>{notice}</p>
          )}
          {!token ? (
            <button onClick={reconnect}
              style={{ border: 'none', borderRadius: 999, background: 'var(--brand)', color: 'var(--accent-text)', padding: '9px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
              Reconnecter
            </button>
          ) : pendingInvite ? (
            <button onClick={() => openConvByUsername(pendingInvite)} disabled={inviteOpening}
              style={{ border: 'none', borderRadius: 999, background: 'var(--brand)', color: 'var(--accent-text)', padding: '9px 14px', fontSize: 13, fontWeight: 900, cursor: inviteOpening ? 'wait' : 'pointer', opacity: inviteOpening ? 0.72 : 1 }}>
              {inviteOpening ? 'Ouverture...' : 'Ouvrir la conversation'}
            </button>
          ) : null}
        </div>
      )}

      {(actionNotice || shouldOpenAndroidLinkInChrome()) && (
        <div style={{ flexShrink: 0, margin: '10px 14px 0', background: shouldOpenAndroidLinkInChrome() ? '#EAF4F1' : '#ecfdf5', border: `1px solid ${shouldOpenAndroidLinkInChrome() ? 'rgba(16,42,42,0.14)' : '#a7f3d0'}`, borderRadius: 14, padding: '11px 13px', color: shouldOpenAndroidLinkInChrome() ? '#102A2A' : '#065f46', display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ flex: 1, margin: 0, fontSize: 13, lineHeight: 1.4, fontWeight: 750 }}>
            {shouldOpenAndroidLinkInChrome() ? 'Pour importer les contacts correctement, ouvre cette page dans Chrome Android.' : actionNotice}
          </p>
          {shouldOpenAndroidLinkInChrome() && (
            <button onClick={() => { window.location.href = buildChromeIntentUrl(); }}
              style={{ border: 'none', borderRadius: 999, background: 'var(--header-bg)', color: '#fff', padding: '8px 11px', fontSize: 12, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Chrome
            </button>
          )}
        </div>
      )}

      {/* Search */}
      {imported && (
        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: SURFACE, borderRadius: 24, padding: '9px 14px', border: `1px solid ${BORDER}`, boxShadow: 'var(--shadow)' }}>
            <svg width="16" height="16" fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un contact…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary)' }}/>
            {search && (
              <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 0 }}>✕</button>
            )}
          </div>
          <button onClick={() => setShowAdd(true)}
            style={{ marginTop: 10, width: '100%', minHeight: 42, borderRadius: 14, border: '1px solid var(--border)', background: '#FFFFFF', color: 'var(--brand)', cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
            + Ajouter un contact manuellement
          </button>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Bandeau permission refusée */}
        {permDenied && (
          <div style={{ margin: '12px 16px 0', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#856404', margin: '0 0 4px' }}>Accès aux contacts refusé</p>
              <p style={{ fontSize: 12, color: '#856404', margin: '0 0 8px', lineHeight: 1.5 }}>
                Android contrôle cette autorisation. Oracle Messenger affiche ensuite vos contacts ici sans cases de sélection.
              </p>
              <button onClick={importAndMatch}
                style={{ background: '#ffc107', color: '#212529', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {t(lang, 'contacts.retry')}
              </button>
            </div>
            <button onClick={() => setPermDenied(false)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#856404', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Empty state — first visit */}
        {!imported && !loading && (
          <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 14, padding: 20 }}>
            <div style={{ background: SURFACE, border:`1px solid ${BORDER}`, borderRadius:22, padding:22, boxShadow:'var(--shadow)', textAlign:'center' }}>
              <div style={{ width: 82, height: 82, borderRadius: '50%', background: 'linear-gradient(145deg, rgba(16,42,42,0.12), rgba(18,140,126,0.08))', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin:'0 auto 16px' }}>
                <svg width="40" height="40" fill="none" stroke="var(--header-bg)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>Retrouver mes amis sur Oracle Messenger</p>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.52, margin: 0, fontWeight: 650 }}>
                {isNativeApp
                  ? 'Oracle Messenger vérifie votre carnet pour afficher uniquement les proches déjà inscrits. Rien n’est publié.'
                  : hasNative
                    ? t(lang, 'contacts.importNativeHelp')
                    : t(lang, 'contacts.manualHelp')}
              </p>
            </div>
            {hasNative && (
              <button onClick={importAndMatch}
                style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 18, padding: '15px 18px', cursor: 'pointer', fontWeight: 900, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent:'center', gap: 10, boxShadow:'var(--shadow)' }}>
                <svg width="18" height="18" fill="none" stroke="var(--accent-text)" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                Retrouver mes amis
              </button>
            )}
            <button onClick={() => setShowAdd(true)}
              style={{ background: SURFACE, color: ACCENT_TEXT, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '13px 18px', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
              + {t(lang, 'contacts.addManual')}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && contacts.length === 0 && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t(lang, 'contacts.loading')}</p>
          </div>
        )}

        {/* Contact list */}
        {imported && (!loading || contacts.length > 0) && (
          <>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>{search ? `Aucun résultat pour « ${search} »` : 'Aucun contact trouvé.'}</p>
                <button onClick={() => setShowAdd(true)}
                  style={{ marginTop: 16, background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 20, padding: '12px 28px', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                  + Ajouter un contact
                </button>
              </div>
            ) : (
              <div style={{ padding: '8px 0 18px', background: '#FFFFFF' }}>
                {oracleContacts.length > 0 && (
                  <>
                    <SectionTitle>Déjà sur Oracle Messenger</SectionTitle>
                    {oracleContacts.map((c, i) => <ContactRow key={`oracle-${c.local.name}-${i}`} c={c} onTap={() => handleTap(c)} creating={creating} onAvatarOpen={(src, name) => setPhotoPreview({ src, name })} />)}
                  </>
                )}
                {inviteContacts.length > 0 && (
                  <>
                    <SectionTitle>À inviter</SectionTitle>
                    {inviteContacts.map((c, i) => <ContactRow key={`invite-${c.local.name}-${i}`} c={c} onTap={() => handleTap(c)} creating={creating} onAvatarOpen={(src, name) => setPhotoPreview({ src, name })} />)}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Invitation sheet */}
      {invite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.36)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '18px 14px' }}
          onClick={e => { if (e.target === e.currentTarget) setInvite(null); }}>
          <div style={{ width: 'min(480px, 100%)', maxHeight: 'min(86dvh, 680px)', overflowY: 'auto', background: 'var(--bg-surface)', borderRadius: '24px 24px 18px 18px', padding: '22px 20px calc(18px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 18px 45px rgba(0,0,0,0.24)' }}>
            <div style={{ width: 44, height: 4, borderRadius: 999, background: 'var(--border)', margin: '0 auto 18px' }} />
            <h3 style={{ fontSize: 22, lineHeight: 1.18, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Inviter sur Oracle Messenger
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.45, fontWeight: 650, margin: '0 0 18px' }}>
              Envoyez une invitation claire à {invite.name}. Le contact reçoit votre lien et peut vous retrouver directement.
            </p>
            {(invite.phones.length ? invite.phones : invite.emails).map((value, index) => (
              <label key={`${value}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', cursor: 'pointer' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${invitePhone === value ? 'var(--brand)' : 'var(--text-secondary)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {invitePhone === value && <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--brand)' }} />}
                </span>
                <input
                  type="radio"
                  name="invite-destination"
                  value={value}
                  checked={invitePhone === value}
                  onChange={() => setInvitePhone(value)}
                  style={{ display: 'none' }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.25, fontWeight: 800 }}>{invite.phones.length ? 'Numéro à inviter' : 'Adresse à inviter'}</span>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.25, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                </span>
              </label>
            ))}
            {invite.phones.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.3, fontWeight: 900, marginBottom: 7 }}>
                  Numéro WhatsApp
                </label>
                <input
                  value={invitePhone}
                  onChange={event => setInvitePhone(event.target.value)}
                  placeholder="+225 XX XX XX XX XX"
                  type="tel"
                  inputMode="tel"
                  style={{ width:'100%', boxSizing:'border-box', border:'1.5px solid var(--border)', borderRadius:14, padding:'13px 14px', fontSize:15, fontWeight:750, outline:'none', background:'#fff', color:'var(--text-primary)' }}
                />
                {invitePhoneStatus?.valid && !invitePhoneStatus.international && (
                  <div style={{ marginTop: 10, border:'1px solid #F59E0B', background:'#FFFBEB', color:'#92400E', borderRadius:14, padding:'11px 12px' }}>
                    <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:900, lineHeight:1.25 }}>Numéro incomplet</p>
                    <p style={{ margin:0, fontSize:12.5, fontWeight:700, lineHeight:1.4 }}>
                      Ajoutez le code pays au numéro de votre contact avant de continuer. Exemple : +225 XX XX XX XX XX pour la Côte d’Ivoire.
                    </p>
                  </div>
                )}
                {invitePhoneStatus?.valid && invitePhoneStatus.international && (
                  <div style={{ marginTop: 9, color:'#047857', fontSize:12.5, fontWeight:850, lineHeight:1.35 }}>
                    Numéro international prêt : {invitePhoneStatus.e164}
                  </div>
                )}
              </div>
            )}
            {!invite.phones.length && !invite.emails.length && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>
                Ce contact n'a pas de numéro. Vous pouvez quand même partager votre lien Oracle Messenger.
              </p>
            )}
            <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
              <button onClick={handleInvite}
                style={{ width: '100%', border: 'none', borderRadius: 16, background: 'var(--brand)', color: 'var(--accent-text)', padding: '14px 16px', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}>
                Partager l’invitation
              </button>
              {invite.phones.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button onClick={inviteByWhatsApp}
                    style={{ border: '1px solid rgba(18,140,126,.18)', borderRadius: 16, background: invitePhoneStatus?.international ? '#E7F8F1' : '#F3F4F6', color: invitePhoneStatus?.international ? '#075E54' : '#6B7280', padding: '13px 12px', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
                    Inviter sur WhatsApp
                  </button>
                  <button onClick={inviteBySms}
                    style={{ border: '1px solid var(--border)', borderRadius: 16, background: '#FFFFFF', color: 'var(--text-primary)', padding: '13px 12px', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
                    SMS
                  </button>
                </div>
              )}
              <button onClick={copyInvite}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 16, background: '#FFFFFF', color: 'var(--brand)', padding: '13px 16px', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>
                Copier le lien
              </button>
              <button onClick={() => setInvite(null)}
                style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 850, cursor: 'pointer', padding: '8px 0' }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add contact sheet */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div style={{ width: '100%', maxHeight: 'calc(100dvh - 18px)', overflowY: 'auto', background: 'var(--bg-surface)', borderRadius: '20px 20px 0 0', padding: '24px 24px calc(24px + env(safe-area-inset-bottom, 0px))' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>Ajouter un contact</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom (optionnel)"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 15, outline: 'none', marginBottom: 12, boxSizing: 'border-box', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}/>
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone avec indicatif ou email" type="text" inputMode="email"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 15, outline: 'none', marginBottom: 8, boxSizing: 'border-box', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}/>
            <p style={{ margin: '0 0 18px', fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)', fontWeight: 650 }}>
              Oracle Messenger vérifie immédiatement si ce contact possède déjà un compte.
            </p>
            <button onClick={addManualContact} disabled={!newName.trim() && !newPhone.trim()}
              style={{ width: '100%', background: (newName.trim() || newPhone.trim()) ? ACCENT : 'var(--border)', color: (newName.trim() || newPhone.trim()) ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: (newName.trim() || newPhone.trim()) ? 'pointer' : 'default', marginBottom: 10 }}>
              Vérifier et ajouter
            </button>
            <button onClick={() => setShowAdd(false)}
              style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', borderRadius: 14, padding: 14, fontSize: 15, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {photoPreview && (
        <MediaLightbox
          src={photoPreview.src}
          type="image"
          title={photoPreview.name}
          subtitle="Photo de profil"
          qualityMode="profile"
          onClose={() => setPhotoPreview(null)}
        />
      )}
    </div>
  );
}

function Avatar({ name, avatar, size = 48, onOpen }: { name: string; avatar?: string | null; size?: number; onOpen?: () => void }) {
  const content = (
    <>
      {avatar
        ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        : <span style={{ fontSize: size * 0.42, fontWeight: 900, color: 'var(--accent-text)' }}>{name[0]?.toUpperCase()}</span>
      }
    </>
  );
  if (avatar && onOpen) {
    return (
      <button
        type="button"
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`Voir la photo de ${name}`}
        style={{ width: size, height: size, minHeight: size, borderRadius: '50%', background: 'transparent', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', padding: 0, cursor: 'zoom-in' }}
      >
        {content}
      </button>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatar ? 'transparent' : 'rgba(16,42,42,0.08)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {content}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: '20px 20px 8px', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.2, fontWeight: 800, textTransform:'uppercase', letterSpacing:.4 }}>
      {children}
    </p>
  );
}

function ContactRow({ c, onTap, creating, onAvatarOpen }: { c: EnrichedContact; onTap: () => void; creating: boolean; onAvatarOpen: (src: string, name: string) => void }) {
  const { local, appUser } = c;
  const avatar = appUser?.avatar ?? local.avatar;
  return (
    <div style={{ background: '#FFFFFF', overflow: 'hidden', display:'flex', alignItems:'center' }}>
      <button onClick={onTap} disabled={creating}
        style={{ flex:1, minWidth:0, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', minHeight: 72, border: 'none', background: 'transparent', cursor: creating ? 'wait' : 'pointer', textAlign: 'left' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={local.name} avatar={avatar} size={52} onOpen={avatar ? () => onAvatarOpen(avatar, local.name) : undefined} />
          {appUser && (
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: '50%', background: 'var(--online-dot)', border: '2px solid var(--bg-surface)' }}/>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 750, fontSize: 16, lineHeight: 1.24, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {local.name}
          </p>
          {appUser ? (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '4px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {appUser.username ? `@${appUser.username}` : 'Envoyez-lui un message'}
            </p>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '4px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {local.phones.join(', ') || local.emails[0] || 'Pas encore inscrit'}
            </p>
          )}
        </div>
        {!appUser && <span style={{ color: 'var(--brand)', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>Inviter</span>}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
