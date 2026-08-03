'use client';
import { useRef, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ConversationList } from '../chat/ConversationList';
import { ChatWindow } from '../chat/ChatWindow';
import { MenuDots } from './MenuDots';
import { useChatStore } from '../../store/chat';
import { api } from '../../lib/api';

type Tab = 'discussions' | 'appels' | 'actus' | 'outils';

interface Props {
  onStartCall?: (convId: string, userIds: string[], type: 'audio' | 'video') => void;
}

export function MainLayout({ onStartCall }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [tab, setTab]       = useState<Tab>('discussions');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'fav' | 'groups'>('all');
  const [showChat, setShowChat] = useState(false); // mobile: show conversation panel
  const [isMobile, setIsMobile] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoPickerRef = useRef<HTMLInputElement>(null);
  const token = session?.user?.backendToken ?? '';
  const { activeConvId, setActiveConv, removeConversation } = useChatStore();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // When a conversation is activated (e.g. from /contacts), switch to chat view on mobile
  useEffect(() => {
    if (activeConvId && isMobile) setShowChat(true);
  }, [activeConvId, isMobile]);

  function handleSelectConv(convId?: string) {
    if (convId) setActiveConv(convId);
    if (isMobile) setShowChat(true);
  }

  function handleBackToList() {
    setShowChat(false);
    setActiveConv('');
  }

  async function handleDeleteConversation(convId: string, name: string) {
    if (!token) return;
    const ok = confirm(`Supprimer la discussion avec ${name} ?`);
    if (!ok) return;
    removeConversation(convId);
    if (activeConvId === convId && isMobile) setShowChat(false);
    try {
      await api.conversations.delete(convId, token);
    } catch {
      alert('La discussion a été retirée de ce téléphone. La suppression serveur sera à réessayer si elle réapparaît.');
    }
  }

  const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
    {
      id: 'discussions', label: 'Discussions',
      icon: <svg width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 4.5v10.8a2.2 2.2 0 01-2.2 2.2H7.2L3.5 21V4.5a2.2 2.2 0 012.2-2.2h12.1A2.2 2.2 0 0120 4.5z"/></svg>,
    },
    {
      id: 'appels', label: 'Appels',
      icon: <svg width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.1 4.8l1.6 3.6c.2.5.1 1-.3 1.4l-1 1c1.1 2.2 2.8 3.9 5 5l1-1c.4-.4 1-.5 1.4-.3l3.6 1.6c.5.2.8.7.8 1.2v2a1.4 1.4 0 01-1.5 1.4C9.6 20.4 3.6 14.4 3.3 6.3A1.4 1.4 0 014.7 4.8h2.4z"/></svg>,
    },
    {
      id: 'actus', label: 'Actus',
      icon: <svg width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5a4 4 0 110 8 4 4 0 010-8zM4.5 20c.9-3.7 3.4-5.5 7.5-5.5s6.6 1.8 7.5 5.5"/></svg>,
    },
    {
      id: 'outils', label: 'Outils',
      icon: <svg width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M5 12h14M5 17h14"/></svg>,
    },
  ];

  const FILTERS = [
    { id: 'all',    label: 'Toutes' },
    { id: 'unread', label: 'Non lues' },
    { id: 'fav',    label: 'Favoris' },
    { id: 'groups', label: 'Groupes' },
  ];

  function handleFileToStory(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      sessionStorage.setItem('camera-capture', b64);
      router.push('/stories?new=image');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // Retouche photo depuis Outils → ouvre l'éditeur photo (pas stories)
  function handlePhotoEdit(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      sessionStorage.setItem('photo-edit-src', b64);
      router.push('/gallery/edit');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // On mobile: show either list OR chat, never both
  const showList = !isMobile || !showChat;
  const showChatPanel = !isMobile || showChat;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', minHeight: 0 }}>

      {/* ── Panneau gauche (liste) ── */}
      <div style={{ width: isMobile ? '100%' : '100%', maxWidth: isMobile ? '100%' : 420, display: showList ? 'flex' : 'none', flexDirection: 'column', background: 'var(--bg-surface)', borderRight: isMobile ? 'none' : '1px solid var(--border)', height: '100%', minHeight:0, flexShrink: 0, position: 'relative' }}>

        {/* Header */}
        <div style={{ padding: 'calc(14px + env(safe-area-inset-top, 0px)) 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'linear-gradient(180deg, var(--header-bg), #235F58)', borderBottom: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 1px 0 rgba(17,24,28,0.05)' }}>
          <span style={{ fontSize: 24, lineHeight: 1.1, fontWeight: 850, color: '#FFFFFF', letterSpacing: 0 }}>Oracle Messenger</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Bouton caméra → ouvre caméra native */}
            <button
              onClick={() => cameraRef.current?.click()}
              style={{ width: 40, height: 40, minHeight: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.10)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F8FAFC' }}
              title="Prendre une photo"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>
            {/* Input caméra caché */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileToStory} style={{ display: 'none' }} />
            {/* Input galerie caché (Retouche Photo) */}
            <input ref={photoPickerRef} type="file" accept="image/*" onChange={handlePhotoEdit} style={{ display: 'none' }} />
            <MenuDots />
          </div>
        </div>

        {/* Barre de recherche */}
        <div style={{ padding: '12px 16px 10px', flexShrink: 0, background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 22, padding: '9px 14px', minHeight: 44, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)' }}>
            <svg width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth="1.9" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.35 }} />
          </div>
        </div>

        {/* Filtres pills — seulement Discussions */}
        {tab === 'discussions' && (
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', overflowX: 'auto', flexShrink: 0 }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id as any)}
              style={{ flexShrink: 0, minHeight: 36, padding: '8px 15px', borderRadius: 999, border: filter === f.id ? '1px solid transparent' : '1px solid var(--border)', background: filter === f.id ? 'var(--brand-soft)' : '#FFFFFF', color: filter === f.id ? 'var(--brand)' : 'var(--text-secondary)', fontSize: 14, lineHeight: 1.15, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: filter === f.id ? '0 6px 16px rgba(30,97,89,0.08)' : 'none' }}>
                {f.label}
              </button>
            ))}
            <button
              onClick={() => router.push('/contacts')}
              style={{ flexShrink: 0, width: 36, height: 36, minHeight: 36, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--accent-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontSize: 20, fontWeight: 700 }}>
              +
            </button>
          </div>
        )}

        {/* Contenu */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {tab === 'discussions' && (
            <ConversationList
              search={search}
              filter={filter}
              onSelect={(convId) => handleSelectConv(convId)}
              onDelete={handleDeleteConversation}
            />
          )}
          {tab === 'appels'      && <CallsTab />}
          {tab === 'actus'       && <ActusTab />}
          {tab === 'outils'      && <OutilsTab onPickPhoto={() => photoPickerRef.current?.click()} />}
        </div>

        {/* FAB nouveau message → contacts */}
        {tab === 'discussions' && (
          <button
            onClick={() => router.push('/contacts')}
            style={{ position: 'absolute', bottom: 78, right: 18, width: 54, height: 54, minHeight: 54, borderRadius: '18px', background: 'var(--brand)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 26px rgba(30,97,89,0.24)', zIndex: 10 }}
            title="Nouveau message"
          >
            <svg width="23" height="23" fill="none" stroke="#FFFFFF" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        )}

        {/* Tabs bas */}
        <div style={{ display: 'flex', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.96)', flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -8px 24px rgba(17,24,28,0.04)' }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 4px 8px', minHeight: 62, border: 'none', background: 'transparent', cursor: 'pointer', color: tab === tb.id ? 'var(--brand)' : 'var(--text-muted)', fontSize: 12, lineHeight: 1.1, fontWeight: tab === tb.id ? 800 : 600, transition: 'color 0.2s ease, transform 0.2s ease' }}>
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Panneau droit (conversation) ── */}
      <div style={{ flex: 1, display: showChatPanel ? 'flex' : 'none', overflow: 'hidden', flexDirection: 'column', minHeight:0 }}>
        <ChatWindow
          onStartCall={onStartCall}
          onBack={isMobile ? handleBackToList : undefined}
        />
      </div>
    </div>
  );
}

interface CallLogEntry {
  id: string; callId: string; peerId: string; peerName: string;
  type: 'audio'|'video'; direction: 'incoming'|'outgoing'|'missed';
  duration?: number; startedAt: string;
}

function formatDuration(s?: number) {
  if (!s) return '';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}min ${s%60}s`;
}

function CallsTab() {
  const router = useRouter();
  const { data: session } = useSession();
  const token = session?.user?.backendToken ?? '';
  const BASE  = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

  const [log,     setLog]     = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !token) return;
    setLoading(true);
    fetch(`${BASE}/calls/history?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: CallLogEntry[]) => setLog(Array.isArray(data) ? data : []))
      .catch(() => setLog([]))
      .finally(() => setLoading(false));
  }, [mounted, token]);

  async function clearAll() {
    if (!confirm('Effacer tout l\'historique des appels ?')) return;
    await fetch(`${BASE}/calls/history`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    setLog([]);
  }

  async function deleteEntry(id: string) {
    await fetch(`${BASE}/calls/history/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    setLog(prev => prev.filter(e => e.id !== id));
  }

  if (!mounted) return null;

  const ACCENT = 'var(--accent)';

  const dirIcon = (d: string) => {
    if (d === 'missed')   return <span style={{ color:'#dc2626', fontSize:13 }}>↙ Manqué</span>;
    if (d === 'incoming') return <span style={{ color:ACCENT,    fontSize:13, fontWeight:700 }}>↙ Reçu</span>;
    return                       <span style={{ color:'var(--text-muted)', fontSize:13 }}>↗ Émis</span>;
  };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'var(--bg-app)' }}>
      {/* Header */}
      <div style={{ background:'var(--header-bg)', padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, borderBottom:'1px solid rgba(200,168,90,0.22)' }}>
        <h2 style={{ color:'#fff', fontSize:18, fontWeight:800, margin:0 }}>Appels</h2>
        <div style={{ display:'flex', gap:8 }}>
          {log.length > 0 && (
            <button onClick={clearAll}
              style={{ background:'rgba(255,255,255,0.10)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:20, padding:'8px 14px', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              Effacer
            </button>
          )}
          <button onClick={() => router.push('/contacts')}
            style={{ background:'var(--accent)', border:'none', borderRadius:20, padding:'8px 16px', color:'var(--header-bg)', fontWeight:800, fontSize:13, cursor:'pointer' }}>
            + Nouvel appel
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:ACCENT, borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : log.length === 0 ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:'var(--text-muted)', padding:24 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(200,168,90,0.12)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="36" height="36" fill="var(--accent)" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </div>
          <p style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', margin:0 }}>Aucun appel récent</p>
          <p style={{ fontSize:13, textAlign:'center', lineHeight:1.5, margin:0 }}>Vos appels apparaîtront ici</p>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto' }}>
          {log.map(entry => {
            const d = new Date(entry.startedAt);
            const timeStr = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
            const dateStr = d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
            const initials = entry.peerName?.[0]?.toUpperCase() ?? '?';
            return (
              <div key={entry.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'var(--bg-surface)', borderBottom:'1px solid var(--border)' }}>
                {/* Avatar */}
                <div style={{ width:48, height:48, borderRadius:'50%', background: entry.direction==='missed' ? '#fef2f2' : 'rgba(200,168,90,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:20, fontWeight:800, color: entry.direction==='missed' ? '#dc2626' : 'var(--header-bg)' }}>{initials}</span>
                </div>
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', margin:'0 0 3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entry.peerName}</p>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {dirIcon(entry.direction)}
                    {entry.type === 'video'
                      ? <svg width="13" height="13" fill="var(--text-muted)" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
                      : <svg width="13" height="13" fill="var(--text-muted)" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                    }
                    {entry.duration ? <span style={{ fontSize:12, color:'var(--text-muted)' }}>{formatDuration(entry.duration)}</span> : null}
                  </div>
                </div>
                {/* Date + heure + supprimer */}
                <div style={{ textAlign:'right', flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                  <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>{timeStr}</p>
                  <p style={{ fontSize:11, color:'var(--text-muted)', margin:0, opacity:0.7 }}>{dateStr}</p>
                  <button onClick={() => deleteEntry(entry.id)}
                    style={{ border:'none', background:'none', cursor:'pointer', color:'#dc2626', fontSize:11, padding:0, opacity:0.6 }}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActusTab() {
  const router = useRouter();
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)', padding: 24, background: 'var(--bg-app)' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(200,168,90,0.12)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
        <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Stories & Actus</p>
      <p style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>Partagez des moments avec vos contacts</p>
      <button onClick={() => router.push('/stories')}
        style={{ background: 'var(--accent)', color: 'var(--header-bg)', border: 'none', borderRadius: 20, padding: '10px 24px', cursor: 'pointer', fontWeight: 800, fontSize: 14, marginTop: 8 }}>
        Voir les stories
      </button>
    </div>
  );
}

// SVG icons for tools — no emoji
const TOOL_ICONS: Record<string, React.ReactNode> = {
  photo: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>,
  video: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>,
  meeting: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>,
  notes: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M11 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2v-5"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  events: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  crm: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/><path d="M8 12h8M8 16h5"/></svg>,
  contacts: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  settings: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

type ToolItem = { iconKey: string; label: string; sub: string; action: () => void; section?: string };

function OutilsTab({ onPickPhoto }: { onPickPhoto: () => void }) {
  const router = useRouter();

  const sections: { title: string; items: ToolItem[] }[] = [
    {
      title: 'Studio Créatif',
      items: [
        { iconKey: 'photo',   label: 'Retouche Photo',   sub: 'Choisissez une photo depuis votre galerie.', action: onPickPhoto },
        { iconKey: 'meeting', label: 'Ma Galerie',       sub: 'Voir et gérer vos photos retouchées.',                      action: () => router.push('/gallery') },
        { iconKey: 'meeting', label: 'Réunion Vidéo',    sub: 'Démarrez ou rejoignez une réunion instantanément.',         action: () => router.push('/tools') },
      ],
    },
    {
      title: 'Espace Entreprise',
      items: [
        { iconKey: 'crm',      label: 'Mon Entreprise',  sub: 'Gérez vos clients, vos ventes et votre activité.',          action: () => router.push('/business') },
        { iconKey: 'contacts', label: 'Contacts',        sub: 'Importez et invitez vos contacts.',                         action: () => router.push('/contacts') },
      ],
    },
    {
      title: 'Vie Privée & Organisation',
      items: [
        { iconKey: 'notes',  label: 'Mon Journal',       sub: 'Écrivez vos pensées et gardez vos notes en sécurité.',      action: () => router.push('/tools?tab=notes') },
        { iconKey: 'events', label: 'Rappels & Événements', sub: 'Enregistrez vos dates importantes avec alertes auto.',   action: () => router.push('/tools?tab=events') },
      ],
    },
    {
      title: 'Préférences',
      items: [
        { iconKey: 'settings', label: 'Paramètres',      sub: 'Thème, langue et notifications.',                           action: () => router.push('/profile') },
      ],
    },
  ];

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: 'var(--bg-app)' }}>
      {sections.map(section => (
        <div key={section.title}>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', padding: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.8, margin: 0 }}>
            {section.title}
          </p>
          <div style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            {section.items.map((tool, i) => (
              <button key={tool.label} onClick={tool.action}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%', borderBottom: i < section.items.length - 1 ? '1px solid rgba(200,168,90,0.14)' : 'none' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(200,168,90,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  {TOOL_ICONS[tool.iconKey]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{tool.label}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{tool.sub}</p>
                </div>
                <svg style={{ color: '#C4C4C4', flexShrink: 0 }} width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
