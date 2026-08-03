'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useChatStore } from '../../store/chat';
import { buildChromeIntentUrl, openCurrentAndroidLinkInChrome, shouldOpenAndroidLinkInChrome } from '../../lib/androidChrome';

interface LocalContact { name: string; phones: string[]; emails: string[]; avatar?: string | null }
interface AppUser { id: string; name: string; username: string; avatar?: string; phone?: string }
interface EnrichedContact { local: LocalContact; appUser: AppUser | null }

const MANUAL_KEY   = 'oracle-manual-contacts';
const CACHE_KEY    = 'oracle-contacts';
const ACCENT       = 'var(--accent)';
const ACCENT_TEXT  = 'var(--accent-text)';
const HEADER_BG    = 'var(--header-bg)';
const SURFACE      = 'var(--bg-surface)';
const APP_BG       = 'var(--bg-app)';
const BORDER       = 'var(--border)';
const PROBABLE_DIAL_CODES = [
  '225', '237', '221', '223', '226', '224', '228', '229', '227',
  '243', '242', '241', '233', '234', '212', '213', '216',
  '33', '32', '41', '1', '44',
];

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

async function phoneHashes(phones: string[]) {
  const variants = new Set<string>();
  for (const phone of phones) {
    const hasExplicitCountryCode = phone.trim().startsWith('+') || phone.trim().startsWith('00');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) continue;
    const localWithoutLeadingZero = digits.replace(/^0+/, '');
    variants.add(`+${digits}`);
    variants.add(digits);
    variants.add(digits.slice(-8));
    if (digits.length >= 9) variants.add(digits.slice(-9));
    if (!hasExplicitCountryCode) {
      for (const dial of PROBABLE_DIAL_CODES) {
        variants.add(`+${dial}${digits}`);
        variants.add(`${dial}${digits}`);
        if (localWithoutLeadingZero.length >= 8) {
          variants.add(`+${dial}${localWithoutLeadingZero}`);
          variants.add(`${dial}${localWithoutLeadingZero}`);
        }
      }
    }
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

function isPhoneSearch(value: string) {
  return value.replace(/\D/g, '').length >= 6;
}

function phonesMatch(a = '', b = '') {
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  if (da.length < 6 || db.length < 6) return false;
  const localA = da.replace(/^0+/, '');
  return da === db ||
    da.endsWith(db) ||
    db.endsWith(da) ||
    (da.length >= 8 && db.endsWith(da.slice(-8))) ||
    (db.length >= 8 && da.endsWith(db.slice(-8))) ||
    (da.length >= 9 && db.endsWith(da.slice(-9))) ||
    (db.length >= 9 && da.endsWith(db.slice(-9))) ||
    PROBABLE_DIAL_CODES.some(dial =>
      db === `${dial}${da}` ||
      db === `${dial}${localA}` ||
      db.endsWith(`${dial}${localA}`)
    );
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
  const { data: session, status } = useSession();
  const router     = useRouter();
  const token      = session?.user?.backendToken ?? '';
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

  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const inviteFrom = extractInviteUsername(params.get('from') || '');
    if (inviteFrom && openCurrentAndroidLinkInChrome()) return;
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

    // 1. Charger depuis le cache local (contacts importés précédemment)
    const cached: LocalContact[] = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
    const manual: LocalContact[] = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '[]');
    const all = mergeContacts(cached, manual);

    if (all.length > 0) {
      // Cache existant → afficher immédiatement et re-matcher en arrière-plan
      setImported(true);
      matchWithBackend(all);
      return;
    }

    setImported(false);
  }, [mounted, status, token]);

  useEffect(() => {
    if (!token || !isPhoneSearch(search)) return;
    const timer = setTimeout(async () => {
      try {
        const users: AppUser[] = await api.users.search(search, token);
        if (!users.length) return;
        setContacts(current => {
          const additions = users
            .filter(user => !current.some(c => c.appUser?.id === user.id))
            .map(user => ({
              local: { name: user.name, phones: user.phone ? [user.phone] : [], emails: [], avatar: user.avatar ?? null },
              appUser: user,
            }));
          return additions.length ? [...additions, ...current] : current;
        });
        setImported(true);
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [search, token]);

  useEffect(() => {
    if (!token || !isPhoneSearch(newPhone)) return;
    const timer = setTimeout(async () => {
      try {
        const users: AppUser[] = await api.users.search(newPhone, token);
        if (!users.length) return;
        const user = users[0];
        setNewName(name => name.trim() ? name : user.name);
        setContacts(current => {
          if (current.some(c => c.appUser?.id === user.id)) return current;
          return [{
            local: { name: user.name, phones: user.phone ? [user.phone] : [newPhone], emails: [], avatar: user.avatar ?? null },
            appUser: user,
          }, ...current];
        });
        setImported(true);
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [newPhone, token]);

  function mergeContacts(base: LocalContact[], extra: LocalContact[]): LocalContact[] {
    return [...base, ...extra.filter(m => !base.some(b => b.name === m.name))];
  }

  function contactKey(contact: LocalContact) {
    return `${contact.name.trim().toLowerCase()}|${contact.phones.join(',')}|${contact.emails.join(',')}`;
  }

  function removeContact(contact: LocalContact) {
    const key = contactKey(contact);
    const removeFrom = (storageKey: string) => {
      const existing: LocalContact[] = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      const next = existing.filter(item => contactKey(item) !== key);
      localStorage.setItem(storageKey, JSON.stringify(next));
    };
    removeFrom(CACHE_KEY);
    removeFrom(MANUAL_KEY);
    setContacts(current => current.filter(item => contactKey(item.local) !== key));
    setNotice('Contact retiré de cette liste.');
  }

  // Fallback iOS/desktop : charger tous les utilisateurs Oracle connus
  async function loadAllOracleUsers() {
    if (!token) {
      setNotice('Votre session n’est pas encore prête. Appuyez sur “Reconnecter” pour continuer.');
      return;
    }
    setLoading(true);
    setNotice('');
    setActionNotice('Recherche des comptes Oracle Messenger...');
    try {
      const users: AppUser[] = await api.users.search('', token).catch(() => []);
      const enriched: EnrichedContact[] = users.map(u => ({
        local: { name: u.name, phones: u.phone ? [u.phone] : [], emails: [], avatar: u.avatar ?? null },
        appUser: u,
      }));
      setContacts(enriched);
      setImported(true);
      if (enriched.length === 0) {
        setNotice('Aucun utilisateur Oracle Messenger trouvé pour le moment. Vous pouvez ajouter un contact manuellement.');
      }
    } catch {
      setNotice('Impossible de charger les contacts Oracle. Vérifiez votre connexion puis réessayez.');
    } finally {
      setLoading(false);
      setActionNotice('');
    }
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
    setActionNotice(canUseContactPicker() ? 'Ouverture du sélecteur de contacts...' : 'Ce navigateur ne donne pas accès aux contacts.');
    let locals: LocalContact[] = [];
    try {
      if (canUseContactPicker()) {
        // Contact Picker API — le navigateur affiche sa propre UI de sélection
        const props = await getSupportedContactProps();
        const raw = await (navigator as any).contacts.select(props, { multiple: true });
        locals = await Promise.all((raw as any[]).map(normalizeNativeContact));
        if (locals.length > 0) {
          localStorage.setItem(CACHE_KEY, JSON.stringify(locals));
        } else {
          setNotice('Aucun contact sélectionné. Appuyez sur “Ajouter un contact” pour continuer manuellement.');
        }
      } else {
        locals = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
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
      locals = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
    }
    const manual: LocalContact[] = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '[]');
    const all = mergeContacts(locals, manual);
    setImported(true);
    if (all.length > 0) {
      await matchWithBackend(all);
      setActionNotice('');
    } else {
      // Aucun contact local → afficher les utilisateurs Oracle connus et garder une action manuelle visible.
      await loadAllOracleUsers();
    }
  }, [token]);

  async function matchWithBackend(locals: LocalContact[]) {
    try {
      const allPhones = locals.flatMap(c => c.phones);
      let matched: AppUser[] = [];
      if (token) {
        try { matched = await api.users.matchByPhoneHashes(await phoneHashes(allPhones), token); } catch {}
        matched = matched.filter((u, i, a) => a.findIndex(x => x.id === u.id) === i);
      }
      const enriched: EnrichedContact[] = locals.map(local => ({
        local,
        appUser: matched.find(u =>
          local.phones.some(p => phonesMatch(p, u.phone ?? ''))
        ) ?? null,
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
    } finally {
      setLoading(false);
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
        alert('Impossible d\'ouvrir la conversation. Vérifiez votre connexion.');
      } finally {
        setCreating(false);
        setActionNotice('');
      }
    } else {
      openInviteSheet(c.local);
    }
  }

  function openInviteSheet(contact: LocalContact) {
    setInvite(contact);
    setInvitePhone(contact.phones[0] ?? contact.emails[0] ?? '');
  }

  function getInviteLink() {
    const base = 'https://messenger.oracle-plus.online';
    const username = normalizeUsername(myUsername);
    return username ? `${base}/u/${encodeURIComponent(username)}` : `${base}/install`;
  }

  function normalizeInternationalPhone(phone = '') {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : '';
  }

  function shareInvite(contact: LocalContact, selectedPhone = invitePhone) {
    const link = getInviteLink();
    const senderPhone = normalizeInternationalPhone(myPhone);
    const phoneLine = senderPhone ? `\nMon contact : ${senderPhone}` : '';
    const msg = `Salut ${contact.name} !\n${myName} t'invite à rejoindre Oracle Messenger.${phoneLine}\n\nInstalle l'app :\n${link}`;
    if (navigator.share) {
      navigator.share({ title: 'Oracle Messenger', text: msg }).then(() => {
        setActionNotice('Invitation envoyée.');
        setTimeout(() => setActionNotice(''), 2500);
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(msg).then(() => {
        setActionNotice('Invitation copiée. Collez-la dans WhatsApp, SMS ou un réseau social.');
        setTimeout(() => setActionNotice(''), 3500);
      });
    }
  }

  function handleInvite() {
    if (!invite) return;
    shareInvite(invite, invitePhone);
    setInvite(null);
  }

  function addManualContact() {
    if (!newName.trim()) return;
    const c: LocalContact = { name: newName.trim(), phones: newPhone ? [newPhone.trim()] : [], emails: [], avatar: null };
    const manual: LocalContact[] = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '[]');
    manual.push(c);
    localStorage.setItem(MANUAL_KEY, JSON.stringify(manual));
    setActionNotice('Contact ajouté. Oracle Messenger vérifie s’il est déjà inscrit.');
    setTimeout(() => setActionNotice(''), 3000);
    setNewName(''); setNewPhone(''); setShowAdd(false);
    importAndMatch();
  }

  const filtered      = contacts.filter(c =>
    c.local.name.toLowerCase().includes(search.toLowerCase()) ||
    c.local.phones.some(p => p.includes(search))
  );
  const oracleContacts = filtered.filter(c => c.appUser);
  const inviteContacts = filtered.filter(c => !c.appUser);
  const hasNative     = canUseContactPicker();

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
      <div style={{ padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: 'var(--header-bg)', borderBottom: '1px solid rgba(214,178,94,0.22)' }}>
        <button onClick={() => router.back()}
          className="om-icon-button"
          style={{ flexShrink: 0, background:'rgba(255,255,255,0.10)', borderColor:'rgba(255,255,255,0.16)', color:'#FFFFFF' }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
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
          <button onClick={hasNative ? importAndMatch : loadAllOracleUsers} disabled={loading}
            style={{ minHeight: 42, borderRadius: 999, border: 'none', background: 'var(--brand)', color: 'var(--accent-text)', cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0 14px', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', boxShadow:'0 8px 18px rgba(201,168,76,0.16)' }}>
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 8v6m3-3h-6"/>
            </svg>
            {hasNative ? 'Importer' : 'Chercher'}
          </button>
        </div>
      </div>

      {(!token || notice || pendingInvite) && (
        <div style={{ flexShrink: 0, margin: '10px 14px 0', background: pendingInvite ? '#ecfdf5' : '#fff8e1', border: `1px solid ${pendingInvite ? '#a7f3d0' : '#f3d58b'}`, borderRadius: 14, padding: '12px 14px', color: pendingInvite ? '#065f46' : '#5f4a13' }}>
          {inviteUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar name={inviteUser.name} avatar={inviteUser.avatar} size={42} />
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
        <div style={{ flexShrink: 0, margin: '10px 14px 0', background: shouldOpenAndroidLinkInChrome() ? '#fff8e1' : '#ecfdf5', border: `1px solid ${shouldOpenAndroidLinkInChrome() ? '#f3d58b' : '#a7f3d0'}`, borderRadius: 14, padding: '11px 13px', color: shouldOpenAndroidLinkInChrome() ? '#5f4a13' : '#065f46', display: 'flex', alignItems: 'center', gap: 10 }}>
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
                Réessayer
              </button>
            </div>
            <button onClick={() => setPermDenied(false)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#856404', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Empty state — first visit */}
        {!imported && !loading && (
          <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 18, padding: 20 }}>
            <div style={{ background: SURFACE, border:`1px solid ${BORDER}`, borderRadius:22, padding:22, boxShadow:'var(--shadow)', textAlign:'center' }}>
            <div style={{ width: 82, height: 82, borderRadius: '50%', background: 'rgba(200,168,90,0.16)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin:'0 auto 16px' }}>
              <svg width="40" height="40" fill="none" stroke="var(--accent-text)" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
              <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>Importer vos contacts</p>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, fontWeight: 650 }}>
                {hasNative
                  ? 'Appuyer sur importer vos contacts votre téléphone vas ouvrir son écran de sélection des contacts. Cochez les contacts à importer, puis appuyez sur OK. Ensuite Oracle Messenger vas detecter ceux qui sont deja inscrit sur oracle.'
                  : 'Ajoutez un contact pour ouvrir une conversation ou partager une invitation.'}
              </p>
            </div>
            {hasNative && (
              <button onClick={importAndMatch}
                style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 18, padding: '15px 18px', cursor: 'pointer', fontWeight: 900, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent:'center', gap: 10, boxShadow:'var(--shadow)' }}>
                <svg width="18" height="18" fill="none" stroke="var(--accent-text)" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                Importer mes contacts
              </button>
            )}
            {!hasNative && (
              <button onClick={loadAllOracleUsers}
                style={{ background: ACCENT, color: ACCENT_TEXT, border: 'none', borderRadius: 18, padding: '15px 18px', cursor: 'pointer', fontWeight: 900, fontSize: 15, boxShadow:'var(--shadow)' }}>
                Voir les utilisateurs Oracle
              </button>
            )}
            <button onClick={() => setShowAdd(true)}
              style={{ background: SURFACE, color: ACCENT_TEXT, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '13px 18px', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
              + Ajouter manuellement
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Chargement des contacts…</p>
          </div>
        )}

        {/* Contact list */}
        {imported && !loading && (
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
                    <SectionTitle>Contacts sur Oracle Messenger</SectionTitle>
                    {oracleContacts.map((c, i) => <ContactRow key={`oracle-${c.local.name}-${i}`} c={c} onTap={() => handleTap(c)} onRemove={() => removeContact(c.local)} creating={creating} />)}
                  </>
                )}
                {inviteContacts.length > 0 && (
                  <>
                    <SectionTitle>Inviter sur Oracle Messenger</SectionTitle>
                    {inviteContacts.map((c, i) => <ContactRow key={`invite-${c.local.name}-${i}`} c={c} onTap={() => handleTap(c)} onRemove={() => removeContact(c.local)} creating={creating} />)}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Invitation sheet */}
      {invite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.36)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setInvite(null); }}>
          <div style={{ width: 'min(420px, 100%)', background: '#fff', borderRadius: 28, padding: '28px 30px 22px', boxShadow: '0 18px 45px rgba(0,0,0,0.24)' }}>
            <h3 style={{ fontSize: 24, lineHeight: 1.2, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 22px' }}>
              Envoyer un message à<br />{invite.name}
            </h3>
            {(invite.phones.length ? invite.phones : invite.emails).map((value, index) => (
              <label key={`${value}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '13px 0', cursor: 'pointer' }}>
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
                  <span style={{ display: 'block', color: 'var(--text-primary)', fontSize: 16, lineHeight: 1.25, fontWeight:700 }}>Mobile</span>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.25, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                </span>
              </label>
            ))}
            {!invite.phones.length && !invite.emails.length && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1.5, margin: 0 }}>
                Ce contact n'a pas de numéro. Vous pouvez quand même partager votre lien Oracle Messenger.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 28, marginTop: 28 }}>
              <button onClick={() => setInvite(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 16, fontWeight: 800, cursor: 'pointer', padding: '10px 0' }}>
                Annuler
              </button>
              <button onClick={handleInvite}
                style={{ background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 16, fontWeight: 800, cursor: 'pointer', padding: '10px 0' }}>
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add contact sheet */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div style={{ width: '100%', background: '#fff', borderRadius: '20px 20px 0 0', padding: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>Ajouter un contact</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom *"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 15, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}/>
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone (optionnel)" type="tel"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 15, outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}/>
            <button onClick={addManualContact} disabled={!newName.trim()}
              style={{ width: '100%', background: newName.trim() ? ACCENT : 'var(--border)', color: newName.trim() ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'default', marginBottom: 10 }}>
              Ajouter
            </button>
            <button onClick={() => setShowAdd(false)}
              style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', borderRadius: 14, padding: 14, fontSize: 15, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, avatar, size = 48 }: { name: string; avatar?: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatar ? 'transparent' : 'rgba(200,168,90,0.18)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {avatar
        ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        : <span style={{ fontSize: size * 0.42, fontWeight: 900, color: 'var(--accent-text)' }}>{name[0]?.toUpperCase()}</span>
      }
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

function ContactRow({ c, onTap, onRemove, creating }: { c: EnrichedContact; onTap: () => void; onRemove: () => void; creating: boolean }) {
  const { local, appUser } = c;
  return (
    <div style={{ background: '#FFFFFF', overflow: 'hidden', display:'flex', alignItems:'center', paddingRight:10 }}>
      <button onClick={onTap} disabled={creating}
        style={{ flex:1, minWidth:0, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 10px 12px 18px', minHeight: 72, border: 'none', background: 'transparent', cursor: creating ? 'wait' : 'pointer', textAlign: 'left' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={local.name} avatar={appUser?.avatar ?? local.avatar} size={52} />
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
      <button
        onClick={() => {
          if (confirm(`Retirer ${local.name} de cette liste ?`)) onRemove();
        }}
        aria-label={`Retirer ${local.name}`}
        style={{ width:38, height:38, minHeight:38, borderRadius:'50%', border:'1px solid var(--border)', background:'#FFFFFF', color:'#B42318', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
      >
        <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>
        </svg>
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
