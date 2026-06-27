'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

interface LocalContact { name: string; phones: string[]; emails: string[] }
interface AppUser { id: string; name: string; username: string; avatar?: string }
interface EnrichedContact { local: LocalContact; appUser: AppUser | null }

// Contacts saisis manuellement (fallback universel)
const MANUAL_KEY = 'oracle-manual-contacts';

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token  = session?.user?.backendToken ?? '';
  const myName = session?.user?.name ?? 'un ami';
  const myUsername = (session?.user as any)?.username ?? '';

  const [contacts,  setContacts]  = useState<EnrichedContact[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [invite,    setInvite]    = useState<LocalContact | null>(null);
  const [creating,  setCreating]  = useState(false);
  const [mounted,   setMounted]   = useState(false);
  const [showAdd,   setShowAdd]   = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newPhone,  setNewPhone]  = useState('');

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (!mounted || status !== 'authenticated') return;
    // Vérifier si lien d'invitation avec conv cible
    const params = new URLSearchParams(window.location.search);
    const inviteFrom = params.get('from');
    if (inviteFrom && token) {
      openConvByUsername(inviteFrom);
      return;
    }
    importAndMatch();
  }, [mounted, status]);

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

  async function importAndMatch() {
    setLoading(true);
    let locals: LocalContact[] = [];

    try {
      // Contacts API native (Android Chrome 80+)
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const raw = await (navigator as any).contacts.select(['name','tel','email'], { multiple: true });
        locals = raw.map((c: any) => ({
          name:   c.name?.[0] ?? 'Inconnu',
          phones: c.tel   ?? [],
          emails: c.email ?? [],
        }));
        localStorage.setItem('oracle-contacts', JSON.stringify(locals));
        localStorage.setItem('oracle-contacts-imported', new Date().toDateString());
      } else {
        // Fallback : cache localStorage
        locals = JSON.parse(localStorage.getItem('oracle-contacts') ?? '[]');
      }
    } catch {
      locals = JSON.parse(localStorage.getItem('oracle-contacts') ?? '[]');
    }

    // Ajouter les contacts manuels
    const manual: LocalContact[] = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '[]');
    const all = [...locals, ...manual.filter(m => !locals.some(l => l.name === m.name))];

    await matchWithBackend(all);
  }

  async function matchWithBackend(locals: LocalContact[]) {
    try {
      const allPhones = locals.flatMap(c => c.phones);
      let matched: AppUser[] = [];
      if (token) {
        try { matched = await api.users.matchByPhones(allPhones, token); } catch {}
        // Aussi chercher par nom
        for (const local of locals) {
          try {
            const found = await api.users.search(local.name, token);
            if (found?.length) matched.push(...found);
          } catch {}
        }
        // Dédupliquer
        matched = matched.filter((u, i, a) => a.findIndex(x => x.id === u.id) === i);
      }

      const enriched: EnrichedContact[] = locals.map(local => ({
        local,
        appUser: matched.find(u =>
          local.phones.some(p => p.replace(/\s/g,'').slice(-6) === u.username?.slice(-6)) ||
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

  // Tap direct : ouvre conv si inscrit, sinon panel invitation
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

  // Lien d'invitation personnalisé → redirige vers la conv quand installé
  function getInviteLink() {
    const base = 'https://messenger.oracle-plus.online';
    return myUsername ? `${base}/contacts?from=${myUsername}` : `${base}/install`;
  }

  function handleInvite() {
    if (!invite) return;
    const link = getInviteLink();
    const msg = `Salut ${invite.name} ! 👋\n${myName} t'invite à rejoindre Oracle Messenger.\n\nInstalle l'app et on pourra discuter directement :\n${link}`;
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

  const filtered = contacts.filter(c =>
    c.local.name.toLowerCase().includes(search.toLowerCase()) ||
    c.local.phones.some(p => p.includes(search))
  );
  const registered    = filtered.filter(c => c.appUser);
  const notRegistered = filtered.filter(c => !c.appUser);
  const hasNativeContacts = typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

  if (!mounted || status === 'loading') return <Spinner />;

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#fff' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ padding:'14px 16px 10px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid #f0f2f5', flexShrink:0 }}>
        <button onClick={() => router.back()}
          style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'#f0f2f5', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#111b21', fontSize:18, flexShrink:0 }}>←</button>
        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:18, fontWeight:700, color:'#111b21', margin:0 }}>Nouveau message</h1>
          {!loading && <p style={{ fontSize:12, color:'#8696a0', margin:0 }}>{contacts.length} contact{contacts.length!==1?'s':''}</p>}
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'#f0f2f5', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#00a884', fontSize:22, fontWeight:300 }}>+</button>
      </div>

      {/* Recherche */}
      <div style={{ padding:'8px 12px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f0f2f5', borderRadius:24, padding:'9px 14px' }}>
          <svg width="16" height="16" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:14, color:'#111b21' }}/>
        </div>
      </div>

      {/* Avertissement si pas Chrome */}
      {!hasNativeContacts && contacts.length === 0 && !loading && (
        <div style={{ margin:'0 12px 8px', padding:'10px 14px', background:'#fff8e1', borderRadius:12, border:'1px solid #ffe082', fontSize:13, color:'#7c5c00', lineHeight:1.5 }}>
          ⚠️ L'import automatique n'est disponible que sur <strong>Android Chrome</strong>. Ajoutez vos contacts manuellement avec le bouton <strong>+</strong>.
        </div>
      )}

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
            <p style={{ fontSize:16, fontWeight:600, color:'#111b21' }}>Aucun contact</p>
            <p style={{ fontSize:14, color:'#8696a0', lineHeight:1.5 }}>Ajoutez un contact manuellement avec le bouton +</p>
            <button onClick={() => setShowAdd(true)}
              style={{ background:'#00a884', color:'#fff', border:'none', borderRadius:20, padding:'12px 28px', cursor:'pointer', fontWeight:600, fontSize:15 }}>
              + Ajouter un contact
            </button>
          </div>
        ) : (
          <>
            {registered.length > 0 && (
              <>
                <div style={{ padding:'10px 16px 4px', fontSize:12, fontWeight:700, color:'#00a884', textTransform:'uppercase', letterSpacing:0.6 }}>
                  Sur Oracle Messenger ({registered.length})
                </div>
                {registered.map((c,i) => <Row key={i} c={c} onTap={() => handleTap(c)} creating={creating}/>)}
              </>
            )}
            {notRegistered.length > 0 && (
              <>
                <div style={{ padding:'10px 16px 4px', fontSize:12, fontWeight:700, color:'#8696a0', textTransform:'uppercase', letterSpacing:0.6 }}>
                  Inviter ({notRegistered.length})
                </div>
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
                <p style={{ fontSize:13, color:'#8696a0', margin:0 }}>{invite.phones[0] ?? invite.emails[0] ?? 'Pas encore inscrit'}</p>
              </div>
            </div>
            <p style={{ fontSize:14, color:'#667781', lineHeight:1.6, marginBottom:8 }}>
              <strong>{invite.name}</strong> n'est pas encore sur Oracle Messenger.
            </p>
            <div style={{ background:'#f0f2f5', borderRadius:12, padding:'10px 14px', marginBottom:20, fontSize:13, color:'#111b21', wordBreak:'break-all' }}>
              🔗 {getInviteLink()}
            </div>
            <p style={{ fontSize:12, color:'#8696a0', marginBottom:20, lineHeight:1.5 }}>
              Quand {invite.name} cliquera sur ce lien et installera l'app, il sera directement redirigé vers votre conversation.
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

      {/* Modal ajout manuel */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end' }}>
          <div style={{ width:'100%', background:'#fff', borderRadius:'20px 20px 0 0', padding:28 }}>
            <h3 style={{ fontSize:18, fontWeight:700, color:'#111b21', margin:'0 0 20px' }}>Ajouter un contact</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom *"
              style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid #e9edef', fontSize:15, outline:'none', marginBottom:12, boxSizing:'border-box' }}/>
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Téléphone (optionnel)" type="tel"
              style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid #e9edef', fontSize:15, outline:'none', marginBottom:20, boxSizing:'border-box' }}/>
            <button onClick={addManualContact}
              style={{ width:'100%', background:'#00a884', color:'#fff', border:'none', borderRadius:14, padding:16, fontSize:16, fontWeight:700, cursor:'pointer', marginBottom:10 }}>
              Ajouter
            </button>
            <button onClick={() => setShowAdd(false)}
              style={{ width:'100%', background:'transparent', border:'1px solid #e9edef', borderRadius:14, padding:14, fontSize:15, color:'#667781', cursor:'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}
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
            {appUser ? '● Sur Oracle Messenger' : (local.phones[0] ?? local.emails[0] ?? 'Appuyer pour inviter')}
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
