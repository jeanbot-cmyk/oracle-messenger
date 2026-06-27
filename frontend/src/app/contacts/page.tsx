'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface LocalContact { name: string; phones: string[]; emails: string[] }
interface AppUser { id: string; name: string; username: string; avatar?: string }
interface EnrichedContact { local: LocalContact; appUser: AppUser | null }

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token  = session?.user?.backendToken ?? '';
  const myName = session?.user?.name ?? 'un ami';

  const [contacts,  setContacts]  = useState<EnrichedContact[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [invite,    setInvite]    = useState<LocalContact | null>(null);
  const [creating,  setCreating]  = useState(false);
  const [mounted,   setMounted]   = useState(false);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  // Dès que la page est montée et la session prête → import auto
  useEffect(() => {
    if (!mounted || status !== 'authenticated') return;
    importAndMatch();
  }, [mounted, status]);

  async function importAndMatch() {
    setLoading(true);
    let locals: LocalContact[] = [];

    try {
      // 1. Essayer l'API Contacts native (Android Chrome 80+)
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const raw = await (navigator as any).contacts.select(
          ['name', 'tel', 'email'],
          { multiple: true }
        );
        locals = raw.map((c: any) => ({
          name:   c.name?.[0] ?? 'Inconnu',
          phones: c.tel   ?? [],
          emails: c.email ?? [],
        }));
        // Mettre en cache
        localStorage.setItem('oracle-contacts', JSON.stringify(locals));
        localStorage.setItem('oracle-contacts-imported', new Date().toDateString());
      } else {
        // Fallback : utiliser le cache si disponible
        locals = JSON.parse(localStorage.getItem('oracle-contacts') ?? '[]');
      }
    } catch {
      // Refus ou erreur → utiliser le cache
      locals = JSON.parse(localStorage.getItem('oracle-contacts') ?? '[]');
    }

    // 2. Matcher avec le backend
    await matchWithBackend(locals);
  }

  async function matchWithBackend(locals: LocalContact[]) {
    try {
      const allPhones = locals.flatMap(c => c.phones);
      let matched: AppUser[] = [];

      if (allPhones.length > 0 && token) {
        try { matched = await api.users.matchByPhones(allPhones, token); } catch {}
      }

      const enriched: EnrichedContact[] = locals.map(local => ({
        local,
        appUser: matched.find(u =>
          local.phones.some(p => p.replace(/\s/g,'').endsWith(u.username?.slice(-6) ?? '')) ||
          local.emails.some(e => e === u.username)
        ) ?? null,
      }));

      // Inscrits en premier, puis alphabétique
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
        router.push(`/chat?conv=${conv.id}`);
      } catch { router.push('/chat'); }
      finally { setCreating(false); }
    } else {
      setInvite(c.local);
    }
  }

  function handleInvite() {
    if (!invite) return;
    const msg = `Salut ${invite.name} ! Rejoins-moi sur Oracle Messenger 👉 https://messenger.oracle-plus.online`;
    if (navigator.share) {
      navigator.share({ title: 'Oracle Messenger', text: msg }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(msg).then(() => alert('Lien copié !'));
    }
    setInvite(null);
  }

  const filtered = contacts.filter(c =>
    c.local.name.toLowerCase().includes(search.toLowerCase()) ||
    c.local.phones.some(p => p.includes(search))
  );
  const registered    = filtered.filter(c => c.appUser);
  const notRegistered = filtered.filter(c => !c.appUser);

  if (!mounted || status === 'loading') return <Spinner />;

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#fff' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ padding:'14px 16px 10px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid #f0f2f5', flexShrink:0, background:'#fff' }}>
        <button onClick={() => router.back()}
          style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'#f0f2f5', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#111b21', fontSize:18, flexShrink:0 }}>
          ←
        </button>
        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:18, fontWeight:700, color:'#111b21', margin:0 }}>Nouveau message</h1>
          {!loading && <p style={{ fontSize:12, color:'#8696a0', margin:0 }}>{contacts.length} contact{contacts.length!==1?'s':''}</p>}
        </div>
      </div>

      {/* Recherche */}
      <div style={{ padding:'8px 12px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f0f2f5', borderRadius:24, padding:'9px 14px' }}>
          <svg width="16" height="16" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un contact…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:14, color:'#111b21' }}/>
        </div>
      </div>

      {/* Liste */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading ? (
          <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
            <div style={{ width:36, height:36, border:'3px solid #e9edef', borderTopColor:'#00a884', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
            <p style={{ fontSize:14, color:'#8696a0' }}>Chargement des contacts…</p>
          </div>
        ) : contacts.length === 0 ? (
          <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:32, textAlign:'center' }}>
            <div style={{ fontSize:64 }}>👥</div>
            <p style={{ fontSize:16, fontWeight:600, color:'#111b21' }}>Aucun contact trouvé</p>
            <p style={{ fontSize:14, color:'#8696a0', lineHeight:1.5 }}>
              {('contacts' in navigator)
                ? 'Aucun contact importé. Vérifiez les permissions.'
                : 'L\'import automatique n\'est disponible que sur Android Chrome.'}
            </p>
            <button onClick={importAndMatch}
              style={{ background:'#00a884', color:'#fff', border:'none', borderRadius:20, padding:'12px 28px', cursor:'pointer', fontWeight:600, fontSize:15 }}>
              Réessayer
            </button>
          </div>
        ) : (
          <>
            {registered.length > 0 && (
              <>
                <SectionHeader label={`Sur Oracle Messenger (${registered.length})`} color="#00a884"/>
                {registered.map((c,i) => <Row key={i} c={c} onTap={() => handleTap(c)} creating={creating}/>)}
              </>
            )}
            {notRegistered.length > 0 && (
              <>
                <SectionHeader label={`Inviter (${notRegistered.length})`} color="#8696a0"/>
                {notRegistered.map((c,i) => <Row key={i} c={c} onTap={() => handleTap(c)} creating={creating}/>)}
              </>
            )}
          </>
        )}
      </div>

      {/* Panel invitation */}
      {invite && (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end' }}>
          <div style={{ width:'100%', background:'#fff', borderRadius:'20px 20px 0 0', padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
              <div style={{ width:52, height:52, borderRadius:'50%', background:'#f0f2f5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:700, color:'#8696a0', flexShrink:0 }}>
                {invite.name[0]?.toUpperCase()}
              </div>
              <div>
                <p style={{ fontWeight:700, fontSize:17, color:'#111b21', margin:0 }}>{invite.name}</p>
                <p style={{ fontSize:13, color:'#8696a0', margin:0 }}>{invite.phones[0] ?? invite.emails[0] ?? ''}</p>
              </div>
            </div>
            <p style={{ fontSize:14, color:'#667781', lineHeight:1.6, marginBottom:24 }}>
              <strong>{invite.name}</strong> n'est pas encore sur Oracle Messenger.
              Invitez-le à rejoindre <strong>{myName}</strong> !
            </p>
            <button onClick={handleInvite}
              style={{ width:'100%', background:'#00a884', color:'#fff', border:'none', borderRadius:14, padding:16, fontSize:16, fontWeight:700, cursor:'pointer', marginBottom:10 }}>
              📤 Envoyer l'invitation
            </button>
            <button onClick={() => setInvite(null)}
              style={{ width:'100%', background:'transparent', border:'1px solid #e9edef', borderRadius:14, padding:14, fontSize:15, color:'#667781', cursor:'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ padding:'10px 16px 4px', fontSize:12, fontWeight:700, color, textTransform:'uppercase', letterSpacing:0.6 }}>
      {label}
    </div>
  );
}

function Row({ c, onTap, creating }: { c: EnrichedContact; onTap: () => void; creating: boolean }) {
  const { local, appUser } = c;
  return (
    <>
      <button onClick={onTap} disabled={creating}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'10px 16px', border:'none', background:'transparent', cursor:'pointer', textAlign:'left' }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background: appUser ? '#00a884' : '#e9edef', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden' }}>
          {appUser?.avatar
            ? <img src={appUser.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : <span style={{ fontSize:22, fontWeight:700, color: appUser ? '#fff' : '#8696a0' }}>{local.name[0]?.toUpperCase()}</span>
          }
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:600, fontSize:15, color:'#111b21', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{local.name}</p>
          <p style={{ fontSize:13, margin:0, color: appUser ? '#00a884' : '#8696a0' }}>
            {appUser ? '● Sur Oracle Messenger' : (local.phones[0] ?? local.emails[0] ?? 'Inviter')}
          </p>
        </div>
        <div style={{ flexShrink:0 }}>
          {appUser
            ? <div style={{ width:36, height:36, borderRadius:'50%', background:'#f0f2f5', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="18" height="18" fill="#00a884" viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
              </div>
            : <span style={{ background:'#f0f2f5', borderRadius:10, padding:'4px 10px', fontSize:12, color:'#8696a0', fontWeight:500 }}>Inviter</span>
          }
        </div>
      </button>
      <div style={{ height:1, background:'#f0f2f5', marginLeft:82 }}/>
    </>
  );
}

function Spinner() {
  return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
      <div style={{ width:32, height:32, border:'3px solid #e9edef', borderTopColor:'#00a884', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
