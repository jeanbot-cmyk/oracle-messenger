'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useChatStore } from '../../store/chat';

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

function normalizeUsername(value: string) {
  try {
    return decodeURIComponent(value || '').trim().replace(/^@+/, '').toLowerCase();
  } catch {
    return (value || '').trim().replace(/^@+/, '').toLowerCase();
  }
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function phoneHashes(phones: string[]) {
  const variants = new Set<string>();
  for (const phone of phones) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) continue;
    variants.add(`+${digits}`);
    variants.add(digits);
    variants.add(digits.slice(-8));
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

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router     = useRouter();
  const token      = session?.user?.backendToken ?? '';
  const myName     = session?.user?.name ?? 'un ami';
  const myUsername = (session?.user as any)?.username ?? '';

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

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') {
      const params = new URLSearchParams(window.location.search);
      const inviteFrom = normalizeUsername(params.get('from') || '');
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
    if (!mounted || status !== 'authenticated' || !token) return;
    const params = new URLSearchParams(window.location.search);
    const inviteFrom = normalizeUsername(params.get('from') || '');
    if (inviteFrom) { openConvByUsername(inviteFrom); return; }

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

  function mergeContacts(base: LocalContact[], extra: LocalContact[]): LocalContact[] {
    return [...base, ...extra.filter(m => !base.some(b => b.name === m.name))];
  }

  // Fallback iOS/desktop : charger tous les utilisateurs Oracle connus
  async function loadAllOracleUsers() {
    if (!token) return;
    setLoading(true);
    try {
      const users: AppUser[] = await api.users.search('', token).catch(() => []);
      const enriched: EnrichedContact[] = users.map(u => ({
        local: { name: u.name, phones: u.phone ? [u.phone] : [], emails: [], avatar: u.avatar ?? null },
        appUser: u,
      }));
      setContacts(enriched);
    } finally {
      setLoading(false);
    }
  }

  async function openConvByUsername(username: string) {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
      importAndMatch();
      return;
    }
    try {
      const user = await api.users.byUsername(normalizedUsername);
      if (user?.id) {
        const conv = await api.conversations.create(user.id, token);
        sessionStorage.removeItem('oracle-after-login');
        localStorage.removeItem('oracle-after-login');
        router.replace(`/chat?conv=${conv.id}`);
        return;
      }
    } catch {}
    alert('Ce contact Oracle Messenger est introuvable. Importez vos contacts ou demandez-lui de renvoyer son lien.');
    importAndMatch();
  }

  const importAndMatch = useCallback(async () => {
    setLoading(true);
    setPermDenied(false);
    let locals: LocalContact[] = [];
    try {
      if ('contacts' in navigator && 'ContactsManager' in window) {
        // Contact Picker API — le navigateur affiche sa propre UI de sélection
        const raw = await (navigator as any).contacts.select(
          ['name', 'tel', 'email', 'icon'],
          { multiple: true },
        );
        locals = await Promise.all((raw as any[]).map(normalizeNativeContact));
        if (locals.length > 0) {
          localStorage.setItem(CACHE_KEY, JSON.stringify(locals));
        }
      } else {
        locals = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
      }
    } catch (err: any) {
      // L'utilisateur a refusé ou l'API a échoué
      const denied =
        err?.name === 'SecurityError' ||
        err?.name === 'NotAllowedError' ||
        err?.message?.toLowerCase().includes('cancel') ||
        err?.message?.toLowerCase().includes('denied');
      if (denied) setPermDenied(true);
      locals = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
    }
    const manual: LocalContact[] = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '[]');
    const all = mergeContacts(locals, manual);
    setImported(true);
    if (all.length > 0) {
      await matchWithBackend(all);
    } else {
      // Aucun contact local → afficher les utilisateurs Oracle connus
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
          local.phones.some(p => p.replace(/\D/g, '').slice(-8) === u.phone?.replace(/\D/g, '').slice(-8))
        ) ?? null,
      }));
      enriched.sort((a, b) => {
        if (a.appUser && !b.appUser) return -1;
        if (!a.appUser && b.appUser) return 1;
        return a.local.name.localeCompare(b.local.name);
      });
      setContacts(enriched);
    } finally {
      setLoading(false);
    }
  }

  async function handleTap(c: EnrichedContact) {
    if (c.appUser) {
      setCreating(true);
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
        router.push('/chat');
      } catch (err) {
        console.error('handleTap error', err);
        alert('Impossible d\'ouvrir la conversation. Vérifiez votre connexion.');
      } finally {
        setCreating(false);
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

  function shareInvite(contact: LocalContact, selectedPhone = invitePhone) {
    const link = getInviteLink();
    const destination = selectedPhone ? `\nContact : ${selectedPhone}` : '';
    const msg = `Salut ${contact.name} !\n${myName} t'invite à rejoindre Oracle Messenger.${destination}\n\nInstalle l'app :\n${link}`;
    if (navigator.share) {
      navigator.share({ title: 'Oracle Messenger', text: msg }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(msg).then(() => alert('Invitation copiée !'));
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
    setNewName(''); setNewPhone(''); setShowAdd(false);
    importAndMatch();
  }

  const filtered      = contacts.filter(c =>
    c.local.name.toLowerCase().includes(search.toLowerCase()) ||
    c.local.phones.some(p => p.includes(search))
  );
  const oracleContacts = filtered.filter(c => c.appUser);
  const inviteContacts = filtered.filter(c => !c.appUser);
  const hasNative     = typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

  if (!mounted || status === 'loading') return <Spinner />;

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: APP_BG }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{-webkit-tap-highlight-color:transparent}`}</style>

      {/* Header */}
      <div style={{ padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => router.back()}
          className="om-icon-button"
          style={{ flexShrink: 0 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.14 }}>Sélectionner un contact</h1>
          {imported && !loading && (
            <p style={{ fontSize: 15, color: '#3B4A54', margin: '2px 0 0', lineHeight: 1.2 }}>
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
            style={{ minHeight: 42, borderRadius: 999, border: 'none', background: 'var(--brand)', color: '#FFFFFF', cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0 14px', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', boxShadow:'0 8px 18px rgba(30,97,89,0.16)' }}>
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 8v6m3-3h-6"/>
            </svg>
            Importer
          </button>
        </div>
      </div>

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
                    {oracleContacts.map((c, i) => <ContactRow key={`oracle-${c.local.name}-${i}`} c={c} onTap={() => handleTap(c)} creating={creating} />)}
                  </>
                )}
                {inviteContacts.length > 0 && (
                  <>
                    <SectionTitle>Inviter sur Oracle Messenger</SectionTitle>
                    {inviteContacts.map((c, i) => <ContactRow key={`invite-${c.local.name}-${i}`} c={c} onTap={() => handleTap(c)} creating={creating} />)}
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

function ContactRow({ c, onTap, creating }: { c: EnrichedContact; onTap: () => void; creating: boolean }) {
  const { local, appUser } = c;
  return (
    <div style={{ background: '#FFFFFF', overflow: 'hidden' }}>
      <button onClick={onTap} disabled={creating}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', minHeight: 72, border: 'none', background: 'transparent', cursor: creating ? 'wait' : 'pointer', textAlign: 'left' }}>
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
