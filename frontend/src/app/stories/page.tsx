'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';

interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;           // texte ou base64 image
  caption?: string;          // légende sur image
  type: 'text' | 'image';
  bg: string;                // couleur fond pour texte
  createdAt: string;
  expiresAt: string;         // 24h
  views: string[];           // userIds
  viewCount?: number;
  viewers?: Array<{ id: string; name: string; username?: string; avatar?: string; viewedAt?: string }>;
}

const BG_COLORS = ['var(--brand)','#25D366','var(--header-bg)','#34B7F1','#ECE5DD','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7'];
const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return date.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
}

export default function StoriesPage() {
  const { data: session, status } = useSession();
  const token = (session?.user as any)?.backendToken ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang } = useSettings();
  const [mounted, setMounted]     = useState(false);
  const [stories, setStories]     = useState<Story[]>([]);
  const [viewing, setViewing]     = useState<Story | null>(null);
  const [creating, setCreating]   = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pubError, setPubError]   = useState('');
  const [newText, setNewText]     = useState('');
  const [newBg, setNewBg]         = useState(BG_COLORS[0]);
  const [newType, setNewType]     = useState<'text' | 'image'>('text');
  const [newImage, setNewImage]   = useState('');
  const [progress, setProgress]   = useState(0);
  const [paused, setPaused]       = useState(false);
  const [newCaption, setNewCaption] = useState('');
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const pausedRef   = useRef(false);
  const holdStartedAt = useRef(0);
  const fileRef     = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  async function fetchStories() {
    try {
      const res = await fetch(`${API}/stories`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      // Normaliser : le backend renvoie author.name, author.avatar
      const normalized: Story[] = data.map((s: any) => ({
        id: s.id,
        authorId: s.authorId,
        authorName: s.author?.name ?? 'Inconnu',
        authorAvatar: s.author?.avatar,
        content: s.content,
        caption: s.caption,
        type: s.type,
        bg: s.bg,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        views: s.views ?? [],
        viewCount: typeof s.viewCount === 'number' ? s.viewCount : (s.views ?? []).length,
        viewers: Array.isArray(s.viewers) ? s.viewers : [],
      }));
      setStories(normalized);
    } catch {}
  }

  // Recharger dès que token est disponible (évite le cas token vide au premier render)
  useEffect(() => {
    if (!mounted || !token) return;
    fetchStories();
  }, [mounted, token]);

  // Synchronisation légère A/B : si A publie une story, B la voit sans devoir
  // fermer puis rouvrir la rubrique. On évite de réveiller inutilement l'écran caché.
  useEffect(() => {
    if (!mounted || !token) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      fetchStories();
    };
    const interval = window.setInterval(refreshIfVisible, 20_000);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [mounted, token]);

  useEffect(() => {
    if (!mounted) return;
    const newParam = searchParams?.get('new');
    if (newParam === 'image') {
      const captured = sessionStorage.getItem('camera-capture');
      if (captured) {
        sessionStorage.removeItem('camera-capture');
        setNewImage(captured);
        setNewType('image');
        setCreating(true);
      }
    }
  }, [mounted]);

  function nextStoryAfter(story: Story) {
    const authorStories = byAuthor[story.authorId] ?? [];
    const idx = authorStories.findIndex(s => s.id === story.id);
    if (idx >= 0 && idx < authorStories.length - 1) return authorStories[idx + 1];
    const rowIndex = authorRows.findIndex(row => row.authorId === story.authorId);
    if (rowIndex >= 0 && rowIndex < authorRows.length - 1) return authorRows[rowIndex + 1].firstUnread;
    if (story.authorId !== myId && myStories.length) return myStories[myStories.length - 1];
    return null;
  }

  function previousStoryBefore(story: Story) {
    const authorStories = byAuthor[story.authorId] ?? [];
    const idx = authorStories.findIndex(s => s.id === story.id);
    if (idx > 0) return authorStories[idx - 1];
    const rowIndex = authorRows.findIndex(row => row.authorId === story.authorId);
    if (rowIndex > 0) {
      const previousAuthorStories = authorRows[rowIndex - 1].authorStories;
      return previousAuthorStories[previousAuthorStories.length - 1] ?? null;
    }
    return null;
  }

  // Auto-avance story toutes les 5s — pause on press-and-hold
  useEffect(() => {
    if (!viewing) { setProgress(0); return; }
    setProgress(0);
    pausedRef.current = false;
    setPaused(false);
    let elapsed = 0;
    const duration = 5000;
    const tick = 50;
    progressRef.current = setInterval(() => {
      if (pausedRef.current) return; // frozen while held
      elapsed += tick;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(progressRef.current!);
        setViewing(nextStoryAfter(viewing));
      }
    }, tick);
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [viewing]);

  function openStory(story: Story) {
    // Marquer comme vu via backend
    fetch(`${API}/stories/${story.id}/view`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    if (myId && !story.views.includes(myId)) {
      setStories(prev => prev.map(s => s.id === story.id ? { ...s, views: [...s.views, myId], viewCount: (s.viewCount ?? s.views.length) + 1 } : s));
      story = { ...story, views: [...story.views, myId], viewCount: (story.viewCount ?? story.views.length) + 1 };
    }
    setViewing(story);
  }

  function currentAuthorStories() {
    return viewing ? (byAuthor[viewing.authorId] ?? []) : [];
  }

  function goToStory(direction: 'prev' | 'next') {
    if (!viewing) return;
    const authorStories = currentAuthorStories();
    const idx = authorStories.findIndex(s => s.id === viewing.id);
    if (idx < 0) return;
    if (direction === 'prev') {
      const previous = previousStoryBefore(viewing);
      if (previous) setViewing(previous);
      else setProgress(0);
      return;
    }
    setViewing(nextStoryAfter(viewing));
  }

  function pauseStory() {
    holdStartedAt.current = Date.now();
    pausedRef.current = true;
    setPaused(true);
  }

  function resumeStory() {
    pausedRef.current = false;
    setPaused(false);
  }

  function handleStoryTap(side: 'left' | 'right') {
    if (Date.now() - holdStartedAt.current > 220) return;
    goToStory(side === 'left' ? 'prev' : 'next');
  }

  async function handleCreate() {
    if (!session?.user) return;
    if (newType === 'text' && !newText.trim()) { setPubError('Écrivez quelque chose'); return; }
    if (newType === 'image' && !newImage) { setPubError('Choisissez une image'); return; }
    setPublishing(true);
    setPubError('');
    try {
      const res = await fetch(`${API}/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: newType === 'text' ? newText.trim() : newImage,
          caption: newType === 'image' ? newCaption.trim() || undefined : undefined,
          type: newType,
          bg: newBg,
        }),
      });
      if (res.ok) {
        await fetchStories();
        setCreating(false);
        setNewText('');
        setNewImage('');
        setNewCaption('');
        setPubError('');
      } else {
        const err = await res.json().catch(() => ({}));
        setPubError(err?.message ?? `Erreur serveur (${res.status})`);
      }
    } catch (e: any) {
      setPubError('Impossible de publier — vérifiez votre connexion');
    } finally {
      setPublishing(false);
    }
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setNewImage(reader.result as string); setNewType('image'); };
    reader.readAsDataURL(file);
  }

  // Grouper par auteur
  const byAuthor = stories.reduce<Record<string, Story[]>>((acc, s) => {
    if (!acc[s.authorId]) acc[s.authorId] = [];
    acc[s.authorId].push(s);
    return acc;
  }, {});
  Object.values(byAuthor).forEach(list => {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  const myId = session?.user?.id ?? '';
  const myStories = byAuthor[myId] ?? [];
  const othersAuthors = Object.keys(byAuthor).filter(id => id !== myId);
  const authorRows = othersAuthors.map(authorId => {
    const authorStories = byAuthor[authorId];
    const latest = authorStories[authorStories.length - 1];
    const firstUnread = authorStories.find(s => !s.views.includes(myId)) ?? latest;
    const hasUnread = authorStories.some(s => !s.views.includes(myId));
    return { authorId, authorStories, latest, firstUnread, hasUnread };
  }).sort((a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime());
  const recentRows = authorRows.filter(row => row.hasUnread);
  const viewedRows = authorRows.filter(row => !row.hasUnread);
  const activeStoriesCount = stories.length;

  if (!mounted || status === 'loading') return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg-app)', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'calc(14px + env(safe-area-inset-top, 0px)) 16px 14px', background:'var(--header-bg)', borderBottom:'1px solid rgba(255,255,255,0.10)', position:'sticky', top:0, zIndex:10, boxShadow:'0 1px 0 rgba(16,42,42,0.05)' }}>
        <button onClick={() => router.back()} style={{ width:42, height:42, minHeight:42, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.16)', background:'rgba(255,255,255,0.12)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#FFFFFF', fontSize:20 }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 style={{ fontSize:22, lineHeight:1.1, fontWeight:900, color:'#FFFFFF', margin:0 }}>Stories</h1>
          <p style={{ margin:'4px 0 0', color:'rgba(255,255,255,0.72)', fontSize:12.5, fontWeight:650 }}>{activeStoriesCount ? `${activeStoriesCount} mise${activeStoriesCount > 1 ? 's' : ''} à jour active${activeStoriesCount > 1 ? 's' : ''}` : 'Publiez une photo ou un texte pendant 24h'}</p>
        </div>
        <button onClick={() => setCreating(true)}
          style={{ background:'#FFFFFF', color:'var(--brand)', border:'none', borderRadius:22, padding:'10px 16px', cursor:'pointer', fontWeight:900, fontSize:14, boxShadow:'0 8px 20px rgba(0,0,0,0.14)' }}>
          + Créer
        </button>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 0 24px' }}>
        {/* Ma story */}
        <div style={{ padding:'0 16px 12px' }}>
          <p style={{ fontSize:12, fontWeight:900, color:'var(--text-muted)', margin:'0 0 10px', textTransform:'uppercase', letterSpacing:.8 }}>Ma story</p>
          <button onClick={() => myStories.length ? openStory(myStories[myStories.length - 1]) : setCreating(true)}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:14, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:18, padding:12, cursor:'pointer', textAlign:'left', boxShadow:'var(--shadow-soft)' }}>
            <div style={{ position:'relative', width:62, height:62, flexShrink:0 }}>
              <div style={{ width:62, height:62, borderRadius:'50%', overflow:'hidden', border:myStories.length ? '3px solid var(--brand)' : '2px dashed var(--border)', background:myStories.length ? (myStories[myStories.length - 1].type === 'text' ? myStories[myStories.length - 1].bg : '#000') : 'var(--bg-input)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {myStories.length && myStories[myStories.length - 1].type === 'image' ? (
                  <img src={myStories[myStories.length - 1].content} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                ) : myStories.length ? (
                  <span style={{ fontSize:10, color:'#fff', fontWeight:900, textAlign:'center', padding:5 }}>{myStories[myStories.length - 1].content.slice(0,24)}</span>
                ) : (
                  <span style={{ fontSize:28, color:'var(--brand)', fontWeight:500 }}>+</span>
                )}
              </div>
              <span onClick={(e) => { e.stopPropagation(); setCreating(true); }} role="button" aria-label="Ajouter une story"
                style={{ position:'absolute', right:-2, bottom:-2, width:24, height:24, minHeight:24, borderRadius:'50%', border:'2px solid var(--bg-surface)', background:'var(--brand)', color:'#fff', fontSize:18, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>+</span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, color:'var(--text-primary)', fontSize:16, fontWeight:900 }}>Ajouter à ma story</p>
              <p style={{ margin:'4px 0 0', color:'var(--text-secondary)', fontSize:13, lineHeight:1.35, fontWeight:650 }}>
                {myStories.length ? `${myStories.length} story active · ${timeAgo(myStories[myStories.length - 1].createdAt)}` : 'Photo, texte ou annonce visible pendant 24h.'}
              </p>
            </div>
          </button>
        </div>

        {/* Stories des autres */}
        {[
          { title:'Récentes', rows: recentRows },
          { title:'Déjà vues', rows: viewedRows },
        ].map(section => section.rows.length > 0 && (
          <div key={section.title} style={{ marginTop:8 }}>
            <p style={{ fontSize:12, fontWeight:900, color:'var(--text-muted)', padding:'10px 16px 8px', margin:0, textTransform:'uppercase', letterSpacing:.8 }}>{section.title}</p>
            <div style={{ background:'var(--bg-surface)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>
              {section.rows.map(({ authorId, authorStories, latest, firstUnread, hasUnread }, index) => (
                <button key={authorId} onClick={() => openStory(firstUnread)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', width:'100%', background:'transparent', border:'none', borderBottom:index < section.rows.length - 1 ? '1px solid var(--border)' : 'none', cursor:'pointer', textAlign:'left' }}>
                  <div style={{ width:58, height:58, borderRadius:'50%', padding:3, background:hasUnread ? 'linear-gradient(135deg, var(--brand), #25D366)' : 'var(--border)', flexShrink:0 }}>
                    <div style={{ width:'100%', height:'100%', borderRadius:'50%', overflow:'hidden', background:latest.type === 'text' ? latest.bg : '#000', border:'2px solid var(--bg-surface)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {latest.type === 'image' ? (
                        <img src={latest.content} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      ) : (
                        <span style={{ fontSize:9.5, color:'#fff', fontWeight:900, textAlign:'center', padding:5 }}>{latest.content.slice(0,18)}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontWeight:900, fontSize:16, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{latest.authorName}</p>
                    <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text-secondary)', fontWeight:650 }}>
                      {authorStories.length} story{authorStories.length > 1 ? 's' : ''} · {hasUnread ? 'Non vue' : 'Vue'} · {timeAgo(latest.createdAt)}
                    </p>
                  </div>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:hasUnread ? 'var(--brand)' : 'transparent', flexShrink:0 }} />
                </button>
              ))}
            </div>
          </div>
        ))}

        {stories.length === 0 && (
          <div style={{ textAlign:'center', padding:'70px 26px 110px', color:'var(--text-muted)' }}>
            <div style={{ width:92, height:92, borderRadius:30, margin:'0 auto 18px', background:'linear-gradient(145deg, var(--brand-soft), #FFFFFF)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'var(--shadow-soft)', color:'var(--brand)' }}>
              <svg width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><path d="M17 7h.01"/></svg>
            </div>
            <p style={{ fontSize:24, lineHeight:1.15, fontWeight:950, color:'var(--text-primary)', margin:'0 0 8px' }}>Aucune story</p>
            <p style={{ fontSize:15.5, lineHeight:1.45, maxWidth:330, margin:'0 auto 18px', color:'var(--text-secondary)', fontWeight:600 }}>Créez votre première story. Elle reste visible 24h, comme sur WhatsApp Business.</p>
            <button onClick={() => setCreating(true)} style={{ border:'none', background:'var(--brand)', color:'#fff', borderRadius:999, padding:'13px 24px', fontSize:15, fontWeight:900, cursor:'pointer', boxShadow:'0 12px 28px rgba(16,42,42,0.18)' }}>Créer une story</button>
          </div>
        )}
      </div>

      {/* Viewer story */}
      {viewing && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'#000', display:'flex', flexDirection:'column' }}>
          {/* Barre de progression */}
          <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:10, padding:'calc(8px + env(safe-area-inset-top, 0px)) 12px 8px', display:'flex', gap:4 }}>
            {(byAuthor[viewing.authorId] ?? []).map((s, i) => {
              const authorStories = byAuthor[viewing.authorId] ?? [];
              const currentIdx = authorStories.findIndex(x => x.id === viewing.id);
              return (
                <div key={s.id} style={{ flex:1, height:3, borderRadius:2, background:'rgba(255,255,255,.3)', overflow:'hidden' }}>
                  <div style={{ height:'100%', background:'#fff', width: s.id === viewing.id ? `${progress}%` : i < currentIdx ? '100%' : '0%', transition:'width .05s linear' }} />
                </div>
              );
            })}
          </div>

          {/* Header */}
          <div style={{ position:'absolute', top:'calc(20px + env(safe-area-inset-top, 0px))', left:0, right:0, zIndex:10, display:'flex', alignItems:'center', gap:10, padding:'0 16px' }}>
            <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--accent)', overflow:'hidden', border:'2px solid #fff' }}>
              {viewing.authorAvatar ? (
                <img src={viewing.authorAvatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              ) : (
                <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ color:'#fff', fontWeight:700 }}>{viewing.authorName[0]}</span>
                </div>
              )}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ margin:0, color:'#fff', fontWeight:600, fontSize:14 }}>{viewing.authorName}</p>
              <p style={{ margin:0, color:'rgba(255,255,255,.7)', fontSize:12 }}>
                {new Date(viewing.createdAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
              </p>
            </div>
            <button onClick={() => setViewing(null)} style={{ border:'none', background:'transparent', color:'#fff', fontSize:28, cursor:'pointer', lineHeight:1 }}>×</button>
          </div>

          {/* Contenu — gauche précédent, droite suivant, maintien pour pause */}
          <div
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background: viewing.type==='text' ? viewing.bg : '#000', position:'relative', userSelect:'none', touchAction:'manipulation' }}
          >
            {viewing.type === 'image' ? (
              <img src={viewing.content} alt="" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
            ) : (
              <p style={{ fontSize:28, fontWeight:700, color:'#fff', textAlign:'center', padding:32, textShadow:'0 2px 8px rgba(0,0,0,.3)' }}>{viewing.content}</p>
            )}
            <button
              aria-label="Story précédente"
              onPointerDown={pauseStory}
              onPointerUp={() => { resumeStory(); handleStoryTap('left'); }}
              onPointerCancel={resumeStory}
              onPointerLeave={resumeStory}
              style={{ position:'absolute', left:0, top:90, bottom:86, width:'38%', border:'none', background:'transparent', cursor:'pointer', touchAction:'manipulation' }}
            />
            <button
              aria-label="Story suivante"
              onPointerDown={pauseStory}
              onPointerUp={() => { resumeStory(); handleStoryTap('right'); }}
              onPointerCancel={resumeStory}
              onPointerLeave={resumeStory}
              style={{ position:'absolute', right:0, top:90, bottom:86, width:'62%', border:'none', background:'transparent', cursor:'pointer', touchAction:'manipulation' }}
            />
            {/* Caption overlay */}
            {viewing.caption && !paused && (
              <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'linear-gradient(transparent, rgba(0,0,0,.7))', padding:'32px 20px 16px' }}>
                <p style={{ color:'#fff', fontSize:15, fontWeight:500, margin:0, textAlign:'center', textShadow:'0 1px 4px rgba(0,0,0,.5)' }}>{viewing.caption}</p>
              </div>
            )}
            {/* Pause indicator */}
            {paused && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.15)' }}>
                <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="20" height="20" fill="white" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </div>
              </div>
            )}
          </div>

          {/* Vues */}
          <div style={{ position:'absolute', bottom:24, left:0, right:0, display:'flex', justifyContent:'center', padding:'0 18px', pointerEvents:'none' }}>
            <div style={{ background:'rgba(0,0,0,.58)', borderRadius:20, padding:'7px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:6, maxWidth:360 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:16 }}>👁</span>
                <span style={{ color:'#fff', fontSize:13, fontWeight:800 }}>{viewing.viewCount ?? viewing.views.length} vue{(viewing.viewCount ?? viewing.views.length) !== 1 ? 's' : ''}</span>
              </div>
              {viewing.authorId === myId && Boolean(viewing.viewers?.length) && (
                <p style={{ margin:0, color:'rgba(255,255,255,.82)', fontSize:11.5, lineHeight:1.35, textAlign:'center', maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {viewing.viewers!.slice(0, 4).map(v => v.name || v.username || 'Contact').join(', ')}
                  {viewing.viewers!.length > 4 ? ` +${viewing.viewers!.length - 4}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal création */}
      {creating && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'flex-end' }}>
          <div style={{ width:'100%', background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:24, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:pubError ? 8 : 20 }}>
              <button onClick={() => { setCreating(false); setPubError(''); }} style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:22, color:'var(--text-primary)' }}>×</button>
              <h3 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--text-primary)', flex:1 }}>Nouvelle story</h3>
              <button onClick={handleCreate} disabled={publishing}
                style={{ background:'var(--accent)', color:'var(--accent-text)', border:'none', borderRadius:12, padding:'8px 20px', cursor: publishing ? 'not-allowed' : 'pointer', fontWeight:600, fontSize:14, opacity: publishing ? 0.7 : 1, display:'flex', alignItems:'center', gap:6 }}>
                {publishing ? (
                  <><div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite' }}/> Publication…</>
                ) : 'Publier'}
              </button>
            </div>
            {pubError && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'8px 12px', marginBottom:16, fontSize:13, color:'#dc2626' }}>
                {pubError}
              </div>
            )}

            {/* Tabs */}
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {(['text','image'] as const).map(tp => (
                <button key={tp} onClick={() => setNewType(tp)}
                  style={{ flex:1, padding:'10px', borderRadius:10, border:`2px solid ${newType===tp ? 'var(--accent)' : 'var(--border)'}`, background: newType===tp ? 'var(--accent)' : 'var(--bg-input)', color: newType===tp ? '#fff' : 'var(--text-primary)', cursor:'pointer', fontWeight:600, fontSize:14 }}>
                  {tp === 'text' ? '✏️ Texte' : '🖼️ Image'}
                </button>
              ))}
            </div>

            {newType === 'text' ? (
              <>
                {/* Preview */}
                <div style={{ width:'100%', height:200, borderRadius:16, background:newBg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16, overflow:'hidden' }}>
                  <p style={{ fontSize:22, fontWeight:700, color:'#fff', textAlign:'center', padding:20, textShadow:'0 2px 8px rgba(0,0,0,.3)' }}>{newText || 'Votre texte ici…'}</p>
                </div>
                <textarea value={newText} onChange={e => setNewText(e.target.value)} maxLength={200} rows={3}
                  placeholder="Écrivez votre story…"
                  style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:15, outline:'none', resize:'none', boxSizing:'border-box', marginBottom:16 }} />
                {/* Couleurs */}
                <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', marginBottom:10 }}>Couleur de fond</p>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {BG_COLORS.map(c => (
                    <button key={c} onClick={() => setNewBg(c)}
                      style={{ width:36, height:36, borderRadius:'50%', background:c, border:`3px solid ${newBg===c ? 'var(--text-primary)' : 'transparent'}`, cursor:'pointer' }} />
                  ))}
                </div>
              </>
            ) : (
              <>
                {newImage ? (
                  <div style={{ position:'relative', marginBottom:16 }}>
                    <img src={newImage} alt="" style={{ width:'100%', height:250, objectFit:'cover', borderRadius:16 }} />
                    <button onClick={() => setNewImage('')}
                      style={{ position:'absolute', top:8, right:8, width:32, height:32, borderRadius:'50%', background:'rgba(0,0,0,.6)', border:'none', color:'#fff', cursor:'pointer', fontSize:18 }}>×</button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()}
                    style={{ width:'100%', height:200, borderRadius:16, border:'2px dashed var(--border)', background:'var(--bg-input)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, marginBottom:16 }}>
                    <span style={{ fontSize:48 }}>🖼️</span>
                    <span style={{ fontSize:15, color:'var(--text-muted)' }}>Choisir une image</span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImagePick} style={{ display:'none' }} />
                {/* Caption field — only shown when image is selected */}
                {newImage && (
                  <input
                    value={newCaption}
                    onChange={e => setNewCaption(e.target.value)}
                    placeholder="Ajouter une légende (optionnel)…"
                    maxLength={120}
                    style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none', boxSizing:'border-box' as const, marginTop:8 }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
