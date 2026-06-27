'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface LocalContact {
  name: string;
  phones: string[];
  emails: string[];
}

interface AppUser {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  status: string;
}

interface EnrichedContact {
  local: LocalContact;
  appUser: AppUser | null; // null = pas inscrit
}

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token = session?.user?.backendToken ?? '';
  const myName = session?.user?.name ?? 'un ami';

  const [contacts, setContacts] = useState<EnrichedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [inviteContact, setInviteContact] = useState<LocalContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (!mounted || !token) return;
    loadContacts();
  }, [mounted, token]);

  async function loadContacts() {
    setLoading(true);
    try {
      // 1. Charger les contacts locaux (déjà importés)
      const cached: LocalContact[] = JSON.parse(localStorage.getItem('oracle-contacts') ?? '[]');

      if (cached.length === 0) {
        // Pas encore importés → importer maintenant
        await importFromDevice();
        return;
      }

      await matchWithApp(cached);
    } catch {
      setLoading(false);
    }
  }

  async function importFromDevice() {
    setImporting(true);
    try {
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const raw = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple: true });
        const parsed: LocalContact[] = raw.map((c: any) => ({
          name: c.name?.[0] ?? 'Inconnu',
          phones: c.tel ?? [],
          emails: c.email ?? [],
        }));
        localStorage.setItem('oracle-contacts', JSON.stringify(parsed));
        localStorage.setItem('oracle-contacts-imported', new Date().toDateString());
        await matchWithApp(parsed);
      } else {
        // API non supportée → charger depuis le cache ou vide
        const cached: LocalContact[] = JSON.parse(localStorage.getItem('oracle-contacts') ?? '[]');
        await matchWithApp(cached);
      }
    } catch {
      const cached: LocalContact[] = JSON.parse(localStorage.getItem('oracle-contacts') ?? '[]');
      await matchWithApp(cached);
    } finally {
      setImporting(false);
    }
  }

  async function matchWithApp(locals: LocalContact[]) {
    setLoading(true);
    try {
      // Envoyer tous les numéros au backend pour matcher
      const allPhones = locals.flatMap(c => c.phones);
      let matched: AppUser[] = [];
      if (allPhones.length > 0 && token) {
        try {
          matched = await api.users.matchByPhones(allPhones, token);
        } catch {}
      }

      // Enrichir chaque contact local
      const enriched: EnrichedContact[] = locals.map(local => {
        const appUser = matched.find(u =>
          local.phones.some(p => u.name?.toLowerCase().includes(p.slice(-6))) ||
          local.emails.some(e => e === u.username)
        ) ?? null;
        return { local, appUser };
      });

      // Trier : inscrits en premier
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

  async function handleContactTap(c: EnrichedContact) {
    if (c.appUser) {
      // Inscrit → ouvrir/créer conversation
      setCreating(true);
      try {
        const conv = await api.conversations.create(c.appUser.id, token);
        router.push(`/chat?conv=${conv.id}`);
      } catch {
        router.push('/chat');
      } finally {
        setCreating(false);
      }
    } else {
      // Pas inscrit → panel invitation
      setInviteContact(c.local);
    }
  }

  function handleInvite() {
    if (!inviteContact) return;
    const msg = `Salut ${inviteContact.name} ! Je t'invite à rejoindre Oracle Messenger avec moi. Installe l'app ici : https://messenger.oracle-plus.online`;
    if (navigator.share) {
      navigator.share({ title: 'Oracle Messenger', text: msg }).catch(() => {});
    } else {
      navigator.clipboard.writeText(msg).then(() => alert('Lien copié !'));
    }
    setInviteContact(null);
  }

  const filtered = contacts.filter(c =>
    c.local.name.toLowerCase().includes(search.toLowerCase()) ||
    c.local.phones.some(p => p.includes(search))
  );

  const registered = filtered.filter(c => c.appUser);
  const notRegistered = filtered.filter(c => !c.appUser);

  if (!mounted || status === 'loading') return <Spinner />;

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f0f2f5', flexShrink: 0 }}>
        <button onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f0f2f5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111b21', fontSize: 18, flexShrink: 0 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111b21', margin: 0 }}>Contacts</h1>
          {!loading && <p style={{ fontSize: 12, color: '#8696a0', margin: 0 }}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>}
        </div>
        <button onClick={importFromDevice} disabled={importing}
          style={{ background: 'transparent', border: 'none', color: '#00a884', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '6px 10px' }}>
          {importing ? '…' : '↻ Sync'}
        </button>
      </div>

      {/* Recherche */}
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f2f5', borderRadius: 24, padding: '9px 14px' }}>
          <svg width="16" height="16" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un contact…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#111b21' }} />
        </div>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading || importing ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#8696a0' }}>
            <div style={{ width: 36, height: 36, border: '3px solid #e9edef', borderTopColor: '#00a884', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 14 }}>{importing ? 'Importation des contacts…' : 'Chargement…'}</p>
          </div>
        ) : contacts.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 64 }}>👥</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#111b21' }}>Aucun contact</p>
            <p style={{ fontSize: 14, color: '#8696a0', lineHeight: 1.5 }}>
              {('contacts' in navigator) ? 'Appuyez sur "Sync" pour importer vos contacts.' : 'L\'import de contacts n\'est pas disponible sur ce navigateur.'}
            </p>
            <button onClick={importFromDevice}
              style={{ background: '#00a884', color: '#fff', border: 'none', borderRadius: 20, padding: '12px 28px', cursor: 'pointer', fontWeight: 600, fontSize: 15 }}>
              Importer mes contacts
            </button>
          </div>
        ) : (
          <>
            {/* Inscrits sur Oracle */}
            {registered.length > 0 && (
              <>
                <div style={{ padding: '12px 16px 6px', fontSize: 13, fontWeight: 600, color: '#00a884', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Sur Oracle Messenger ({registered.length})
                </div>
                {registered.map((c, i) => (
                  <ContactRow key={i} contact={c} onTap={() => handleContactTap(c)} creating={creating} />
                ))}
              </>
            )}

            {/* Non inscrits */}
            {notRegistered.length > 0 && (
              <>
                <div style={{ padding: '12px 16px 6px', fontSize: 13, fontWeight: 600, color: '#8696a0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Inviter sur Oracle ({notRegistered.length})
                </div>
                {notRegistered.map((c, i) => (
                  <ContactRow key={i} contact={c} onTap={() => handleContactTap(c)} creating={creating} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Panel invitation */}
      {inviteContact && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#fff', borderRadius: '20px 20px 0 0', padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                {inviteContact.name[0]?.toUpperCase()}
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, color: '#111b21', margin: 0 }}>{inviteContact.name}</p>
                <p style={{ fontSize: 13, color: '#8696a0', margin: 0 }}>{inviteContact.phones[0] ?? inviteContact.emails[0] ?? ''}</p>
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#667781', lineHeight: 1.6, marginBottom: 24 }}>
              <strong>{inviteContact.name}</strong> n'est pas encore sur Oracle Messenger.
              Invitez-le à rejoindre <strong>{myName}</strong> sur l'application !
            </p>
            <button onClick={handleInvite}
              style={{ width: '100%', background: '#00a884', color: '#fff', border: 'none', borderRadius: 14, padding: '16px', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              📤 Envoyer l'invitation
            </button>
            <button onClick={() => setInviteContact(null)}
              style={{ width: '100%', background: 'transparent', border: '1px solid #e9edef', borderRadius: 14, padding: '14px', fontSize: 15, color: '#667781', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactRow({ contact, onTap, creating }: { contact: EnrichedContact; onTap: () => void; creating: boolean }) {
  const { local, appUser } = contact;
  return (
    <>
      <button onClick={onTap} disabled={creating}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        {/* Avatar */}
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: appUser ? '#00a884' : '#e9edef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
          {appUser?.avatar ? (
            <img src={appUser.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 22, fontWeight: 700, color: appUser ? '#fff' : '#8696a0' }}>
              {local.name[0]?.toUpperCase()}
            </span>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#111b21', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{local.name}</p>
          <p style={{ fontSize: 13, color: '#8696a0', margin: 0 }}>
            {appUser ? (
              <span style={{ color: '#00a884', fontWeight: 500 }}>● Sur Oracle Messenger</span>
            ) : (
              local.phones[0] ?? local.emails[0] ?? 'Inviter'
            )}
          </p>
        </div>

        {/* Action */}
        <div style={{ flexShrink: 0 }}>
          {appUser ? (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" fill="#00a884" viewBox="0 0 24 24">
                <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
              </svg>
            </div>
          ) : (
            <div style={{ background: '#f0f2f5', borderRadius: 12, padding: '5px 12px', fontSize: 12, color: '#8696a0', fontWeight: 500 }}>
              Inviter
            </div>
          )}
        </div>
      </button>
      <div style={{ height: 1, background: '#f0f2f5', marginLeft: 82 }} />
    </>
  );
}

function Spinner() {
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e9edef', borderTopColor: '#00a884', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
