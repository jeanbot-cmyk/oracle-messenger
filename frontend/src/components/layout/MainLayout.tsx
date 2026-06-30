'use client';
import { useRef, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ConversationList } from '../chat/ConversationList';
import { ChatWindow } from '../chat/ChatWindow';
import { MenuDots } from './MenuDots';
import { useChatStore } from '../../store/chat';

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
  const { activeConvId, setActiveConv } = useChatStore();

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

  const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
    {
      id: 'discussions', label: 'Discussions',
      icon: <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>,
    },
    {
      id: 'appels', label: 'Appels',
      icon: <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>,
    },
    {
      id: 'actus', label: 'Actus',
      icon: <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M12 14c-5 0-8 2.5-8 4v1h16v-1c0-1.5-3-4-8-4z" opacity=".5"/></svg>,
    },
    {
      id: 'outils', label: 'Outils',
      icon: <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>,
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
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>

      {/* ── Panneau gauche (liste) ── */}
      <div style={{ width: isMobile ? '100%' : '100%', maxWidth: isMobile ? '100%' : 420, display: showList ? 'flex' : 'none', flexDirection: 'column', background: '#fff', borderRight: isMobile ? 'none' : '1px solid #f0f2f5', height: '100%', flexShrink: 0, position: 'relative' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#111b21', letterSpacing: -0.3 }}>Oracle Messenger</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Bouton caméra → ouvre caméra native */}
            <button
              onClick={() => cameraRef.current?.click()}
              style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#54656f' }}
              title="Prendre une photo"
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
        <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f2f5', borderRadius: 24, padding: '9px 14px' }}>
            <svg width="16" height="16" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#111b21' }} />
          </div>
        </div>

        {/* Filtres pills — seulement Discussions */}
        {tab === 'discussions' && (
          <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px', overflowX: 'auto', flexShrink: 0 }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id as any)}
                style={{ flexShrink: 0, padding: '6px 16px', borderRadius: 20, border: filter === f.id ? 'none' : '1px solid #e9edef', background: filter === f.id ? '#111b21' : 'transparent', color: filter === f.id ? '#fff' : '#111b21', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {f.label}
              </button>
            ))}
            <button
              onClick={() => router.push('/contacts')}
              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', border: '1px solid #e9edef', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111b21', fontSize: 18, fontWeight: 300 }}>
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
            style={{ position: 'absolute', bottom: 72, right: 16, width: 56, height: 56, borderRadius: '50%', background: '#128C7E', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,168,132,0.4)', zIndex: 10 }}
            title="Nouveau message"
          >
            <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
              <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zm-2 10h-4v4h-2v-4H8v-2h4V6h2v4h4v2z"/>
            </svg>
          </button>
        )}

        {/* Tabs bas */}
        <div style={{ display: 'flex', borderTop: '1px solid #f0f2f5', background: '#fff', flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 4px 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: tab === tb.id ? '#128C7E' : '#8696a0', fontSize: 11, fontWeight: tab === tb.id ? 600 : 400, transition: 'color 0.15s' }}>
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Panneau droit (conversation) ── */}
      <div style={{ flex: 1, display: showChatPanel ? 'flex' : 'none', overflow: 'hidden', flexDirection: 'column' }}>
        <ChatWindow
          onStartCall={onStartCall}
          onBack={isMobile ? handleBackToList : undefined}
        />
      </div>
    </div>
  );
}

interface CallLogEntry { id: string; type: 'audio'|'video'; direction: 'incoming'|'outgoing'|'missed'; name: string; at: string; duration?: number; }

function formatDuration(s?: number) {
  if (!s) return '';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}min ${s%60}s`;
}

function CallsTab() {
  const router = useRouter();
  const [log, setLog] = useState<CallLogEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try { setLog(JSON.parse(localStorage.getItem('oracle-call-log') ?? '[]')); } catch {}
  }, []);

  if (!mounted) return null;

  const ACCENT = '#128C7E';

  const dirIcon = (d: string) => {
    if (d === 'missed')   return <span style={{ color:'#dc2626', fontSize:13 }}>↙ Manqué</span>;
    if (d === 'incoming') return <span style={{ color:ACCENT,    fontSize:13 }}>↙ Reçu</span>;
    return                       <span style={{ color:'#667781', fontSize:13 }}>↗ Émis</span>;
  };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'#f0f2f5' }}>
      {/* Header */}
      <div style={{ background:ACCENT, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <h2 style={{ color:'#fff', fontSize:18, fontWeight:700, margin:0 }}>Appels</h2>
        <button onClick={() => router.push('/contacts')}
          style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:20, padding:'8px 16px', color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }}>
          + Nouvel appel
        </button>
      </div>

      {log.length === 0 ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:'#8696a0', padding:24 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="36" height="36" fill="#8696a0" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
          </div>
          <p style={{ fontSize:15, fontWeight:600, color:'#111b21', margin:0 }}>Aucun appel récent</p>
          <p style={{ fontSize:13, textAlign:'center', lineHeight:1.5, margin:0 }}>Vos appels apparaîtront ici</p>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto' }}>
          {log.map(entry => {
            const d = new Date(entry.at);
            const timeStr = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
            const dateStr = d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
            const initials = entry.name?.[0]?.toUpperCase() ?? '?';
            return (
              <div key={entry.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'#fff', borderBottom:'1px solid #f0f2f5' }}>
                {/* Avatar */}
                <div style={{ width:48, height:48, borderRadius:'50%', background: entry.direction==='missed' ? '#fef2f2' : `${ACCENT}22`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:20, fontWeight:700, color: entry.direction==='missed' ? '#dc2626' : ACCENT }}>{initials}</span>
                </div>
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:15, fontWeight:600, color:'#111b21', margin:'0 0 3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entry.name}</p>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {dirIcon(entry.direction)}
                    {entry.type === 'video'
                      ? <svg width="13" height="13" fill="#8696a0" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
                      : <svg width="13" height="13" fill="#8696a0" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                    }
                    {entry.duration ? <span style={{ fontSize:12, color:'#8696a0' }}>{formatDuration(entry.duration)}</span> : null}
                  </div>
                </div>
                {/* Date + heure */}
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ fontSize:12, color:'#8696a0', margin:'0 0 2px' }}>{timeStr}</p>
                  <p style={{ fontSize:11, color:'#b0b8bf', margin:0 }}>{dateStr}</p>
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#8696a0', padding: 24 }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0' }}>
        <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#111b21' }}>Stories & Actus</p>
      <p style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>Partagez des moments avec vos contacts</p>
      <button onClick={() => router.push('/stories')}
        style={{ background: '#128C7E', color: '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', cursor: 'pointer', fontWeight: 600, fontSize: 14, marginTop: 8 }}>
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
    <div style={{ overflowY: 'auto', height: '100%', background: '#F8F9FA' }}>
      {sections.map(section => (
        <div key={section.title}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#8696a0', padding: '14px 16px 6px', textTransform: 'uppercase', letterSpacing: 0.8, margin: 0 }}>
            {section.title}
          </p>
          <div style={{ background: '#fff', borderTop: '1px solid #E9EDEF', borderBottom: '1px solid #E9EDEF' }}>
            {section.items.map((tool, i) => (
              <button key={tool.label} onClick={tool.action}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%', borderBottom: i < section.items.length - 1 ? '1px solid #F8F9FA' : 'none' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#128C7E', flexShrink: 0 }}>
                  {TOOL_ICONS[tool.iconKey]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#111B21', margin: '0 0 2px' }}>{tool.label}</p>
                  <p style={{ fontSize: 12, color: '#8696a0', margin: 0, lineHeight: 1.4 }}>{tool.sub}</p>
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
