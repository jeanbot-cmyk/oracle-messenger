'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useChatStore } from '../../store/chat';

interface LocalContact { name: string; phones: string[]; emails: string[] }
interface AppUser { id: string; name: string; username: string; avatar?: string; phone?: string }
interface EnrichedContact { local: LocalContact; appUser: AppUser | null }

const MANUAL_KEY   = 'oracle-manual-contacts';
const CACHE_KEY    = 'oracle-contacts';
const ACCENT       = '#128C7E';
const ACCENT_LIGHT = '#e8f5f3';

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
  const [creating, setCreating] = useState(false);
  const [mounted,  setMounted]  = useState(false);
  const [showAdd,  setShowAdd]  = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (!mounted || status !== 'authenticated' || !token) return;
    const params = new URLSearchParams(window.location.search);
    const inviteFrom = params.get('from');
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

    // 2. Pas de cache → tenter l'import automatique
    const hasNativeApi = 'contacts' in navigator && 'ContactsManager' in window;
    if (hasNativeApi) {
      // Android Chrome : import auto sans demander (déjà demandé au premier lancement)
      importAndMatch();
    } else {
      // iOS / desktop : pas d'API native → charger tous les utilisateurs Oracle connus
      // pour que l'utilisateur puisse au moins voir qui est sur l'app
      setImported(true);
      loadAllOracleUsers();
    }
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
        local: { name: u.name, phones: u.phone ? [u.phone] : [], emails: [] },
        appUser: u,
      }));
      setContacts(enriched);
    } finally {
      setLoading(false);
    }
  }

  async function openConvByUsername(username: string) {
    try {
      const user = await api.users.byUsername(username);
      if (user?.id) {
        const conv = await api.conversations.create(user.id, token);
        router.replace(`/chat?conv=${conv.id}`);
        return;
      }
    } catch {}
    importAndMatch();
  }

  const importAndMatch = useCallback(async () => {
    setLoading(true);
    let locals: LocalContact[] = [];
    try {
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const raw = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple: true });
        locals = raw.map((c: any) => ({
          name:   c.name?.[0] ?? 'Inconnu',
          phones: c.tel   ?? [],
          emails: c.email ?? [],
        }));
        localStorage.setItem(CACHE_KEY, JSON.stringify(locals));
      } else {
        locals = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
      }
    } catch {
      locals = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]');
    }
    const manual: LocalContact[] = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '[]');
    setImported(true);
    await matchWithBackend(mergeContacts(locals, manual));
  }, [token]);

  async function matchWithBackend(locals: LocalContact[]) {
    try {
      const allPhones = locals.flatMap(c => c.phones);
      let matched: AppUser[] = [];
      if (token) {
        try { matched = await api.users.matchByPhones(allPhones, token); } catch {}
        for (const local of locals) {
          if (local.phones.length === 0 && local.name.length > 2) {
            try {
              const found = await api.users.search(local.name, token);
              if (found?.length) matched.push(...found);
            } catch {}
          }
        }
        matched = matched.filter((u, i, a) => a.findIndex(x => x.id === u.id) === i);
      }
      const enriched: EnrichedContact[] = locals.map(local => ({
        local,
        appUser: matched.find(u =>
          local.phones.some(p => p.replace(/\D/g, '').slice(-8) === u.phone?.replace(/\D/g, '').slice(-8)) ||
          local.emails.some(e => e === u.username) ||
          local.name.toLowerCase() === u.name?.toLowerCase()
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
      setInvite(c.local);
    }
  }

  function getInviteLink() {
    const base = 'https://messenger.oracle-plus.online';
    return myUsername ? `${base}/contacts?from=${myUsername}` : `${base}/install`;
  }

  function handleInvite() {
    if (!invite) return;
    const link = getInviteLink();
    const msg = `Salut ${invite.name} !\n${myName} t'invite à rejoindre Oracle Messenger.\n\nInstalle l'app :\n${link}`;
    if (navigator.share) {
      navigator.share({ title: 'Oracle Messenger', text: msg, url: link }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(msg).then(() => alert('Invitation copiée !'));
    }
    setInvite(null);
  }

  function addManualContact() {
    if (!newName.trim()) return;
    const c: LocalContact = { name: newName.trim(), phones: newPhone ? [newPhone.trim()] : [], emails: [] };
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
  const registered    = filtered.filter(c => c.appUser);
  const notRegistered = filtered.filter(c => !c.appUser);
  const hasNative     = typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

  if (!mounted || status === 'loading') return <Spinner />;

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} button:active{opacity:.75} *{-webkit-tap-highlight-color:transparent}`}</style>

      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f0f2f5', flexShrink: 0 }}>
        <button onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f0f2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#111b21', flexShrink: 0 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111b21', margin: 0 }}>Nouveau message</h1>
          {imported && !loading && (
            <p style={{ fontSize: 12, color: '#8696a0', margin: 0 }}>
              {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
              {registered.length > 0 && ` · ${registered.length} sur Oracle`}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {imported && (
            <button onClick={importAndMatch} disabled={loading} title="Rafraîchir"
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f0f2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.5 : 1 }}>
              <svg width="16" height="16" fill="none" stroke={ACCENT} strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          )}
          <button onClick={() => setShowAdd(true)}
            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f0f2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, fontSize: 22, fontWeight: 300 }}>
            +
          </button>
        </div>
      </div>

      {/* Search */}
      {imported && (
        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f2f5', borderRadius: 24, padding: '9px 14px' }}>
            <svg width="16" height="16" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un contact…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#111b21' }}/>
            {search && (
              <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8696a0', fontSize: 16, padding: 0 }}>✕</button>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Empty state — first visit */}
        {!imported && !loading && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: ACCENT_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" fill="none" stroke={ACCENT} strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 17, fontWeight: 700, color: '#111b21', margin: '0 0 8px' }}>Vos contacts</p>
              <p style={{ fontSize: 14, color: '#8696a0', lineHeight: 1.6, margin: 0 }}>
                {hasNative
                  ? 'Importez vos contacts pour voir qui utilise déjà Oracle Messenger.'
                  : 'Ajoutez des contacts manuellement pour démarrer une conversation.'}
              </p>
            </div>
            {hasNative && (
              <button onClick={importAndMatch}
                style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 24, padding: '14px 32px', cursor: 'pointer', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                Importer mes contacts
              </button>
            )}
            <button onClick={() => setShowAdd(true)}
              style={{ background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 24, padding: '12px 28px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              + Ajouter manuellement
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 36, height: 36, border: '3px solid #e9edef', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
            <p style={{ fontSize: 14, color: '#8696a0' }}>Chargement des contacts…</p>
          </div>
        )}

        {/* Contact list */}
        {imported && !loading && (
          <>
            {contacts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <p style={{ fontSize: 15, color: '#8696a0' }}>Aucun contact trouvé.</p>
                <button onClick={() => setShowAdd(true)}
                  style={{ marginTop: 16, background: ACCENT, color: '#fff', border: 'none', borderRadius: 20, padding: '12px 28px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                  + Ajouter un contact
                </button>
              </div>
            ) : (
              <>
                {registered.length > 0 && (
                  <>
                    <SectionHeader label="Sur Oracle Messenger" count={registered.length} color={ACCENT} />
                    {registered.map((c, i) => <ContactRow key={i} c={c} onTap={() => handleTap(c)} creating={creating} accent={ACCENT} />)}
                  </>
                )}
                {notRegistered.length > 0 && (
                  <>
                    <SectionHeader label="Inviter sur Oracle" count={notRegistered.length} color="#8696a0" />
                    {notRegistered.map((c, i) => <ContactRow key={i} c={c} onTap={() => handleTap(c)} creating={creating} accent={ACCENT} />)}
                  </>
                )}
                {search && filtered.length === 0 && (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8696a0', fontSize: 14 }}>
                    Aucun résultat pour « {search} »
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Invitation sheet */}
      {invite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setInvite(null); }}>
          <div style={{ width: '100%', background: '#fff', borderRadius: '20px 20px 0 0', padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <Avatar name={invite.name} size={52} />
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, color: '#111b21', margin: 0 }}>{invite.name}</p>
                <p style={{ fontSize: 13, color: '#8696a0', margin: 0 }}>{invite.phones[0] ?? invite.emails[0] ?? 'Pas encore inscrit'}</p>
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#667781', lineHeight: 1.6, marginBottom: 8 }}>
              <strong>{invite.name}</strong> n'est pas encore sur Oracle Messenger.
            </p>
            <div style={{ background: '#f0f2f5', borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#111b21', wordBreak: 'break-all' }}>
              🔗 {getInviteLink()}
            </div>
            <button onClick={handleInvite}
              style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              📤 Envoyer l'invitation
            </button>
            <button onClick={() => setInvite(null)}
              style={{ width: '100%', background: 'transparent', border: '1px solid #e9edef', borderRadius: 14, padding: 14, fontSize: 15, color: '#667781', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Add contact sheet */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div style={{ width: '100%', background: '#fff', borderRadius: '20px 20px 0 0', padding: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111b21', margin: '0 0 20px' }}>Ajouter un contact</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom *"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e9edef', fontSize: 15, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}/>
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone (optionnel)" type="tel"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e9edef', fontSize: 15, outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}/>
            <button onClick={addManualContact} disabled={!newName.trim()}
              style={{ width: '100%', background: newName.trim() ? ACCENT : '#e9edef', color: newName.trim() ? '#fff' : '#8696a0', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'default', marginBottom: 10 }}>
              Ajouter
            </button>
            <button onClick={() => setShowAdd(false)}
              style={{ width: '100%', background: 'transparent', border: '1px solid #e9edef', borderRadius: 14, padding: 14, fontSize: 15, color: '#667781', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ padding: '10px 16px 4px', fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.6 }}>
      {label} ({count})
    </div>
  );
}

function Avatar({ name, avatar, size = 48 }: { name: string; avatar?: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: avatar ? 'transparent' : '#e9edef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {avatar
        ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        : <span style={{ fontSize: size * 0.42, fontWeight: 700, color: '#8696a0' }}>{name[0]?.toUpperCase()}</span>
      }
    </div>
  );
}

function ContactRow({ c, onTap, creating, accent }: { c: EnrichedContact; onTap: () => void; creating: boolean; accent: string }) {
  const { local, appUser } = c;
  return (
    <>
      <button onClick={onTap} disabled={creating}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', border: 'none', background: 'transparent', cursor: creating ? 'wait' : 'pointer', textAlign: 'left' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={local.name} avatar={appUser?.avatar} size={50} />
          {appUser && (
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: '50%', background: accent, border: '2px solid #fff' }}/>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 17, color: '#111b21', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {local.name}
          </p>
        </div>
        <div style={{ flexShrink: 0 }}>
          {appUser ? (
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e8f5f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" fill={accent} viewBox="0 0 24 24">
                <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/>
              </svg>
            </div>
          ) : (
            <span style={{ background: '#f0f2f5', borderRadius: 10, padding: '4px 10px', fontSize: 12, color: '#8696a0', fontWeight: 500 }}>
              Inviter
            </span>
          )}
        </div>
      </button>
      <div style={{ height: 1, background: '#f0f2f5', marginLeft: 80 }}/>
    </>
  );
}

function Spinner() {
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e9edef', borderTopColor: '#128C7E', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
