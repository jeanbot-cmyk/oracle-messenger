'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';

interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;           // texte ou base64 image
  type: 'text' | 'image';
  bg: string;                // couleur fond pour texte
  createdAt: string;
  expiresAt: string;         // 24h
  views: string[];           // userIds
}

const STORY_KEY = 'oracle-stories';
const BG_COLORS = ['#128C7E','#25D366','#075E54','#34B7F1','#ECE5DD','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7'];

function loadStories(): Story[] {
  if (typeof window === 'undefined') return [];
  try {
    const all: Story[] = JSON.parse(localStorage.getItem(STORY_KEY) ?? '[]');
    const now = Date.now();
    const valid = all.filter(s => new Date(s.expiresAt).getTime() > now);
    if (valid.length !== all.length) localStorage.setItem(STORY_KEY, JSON.stringify(valid));
    return valid;
  } catch { return []; }
}

function saveStory(story: Story) {
  const all = loadStories();
  all.unshift(story);
  localStorage.setItem(STORY_KEY, JSON.stringify(all));
}

export default function StoriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { lang } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [viewing, setViewing] = useState<Story | null>(null);
  const [viewIdx, setViewIdx] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newText, setNewText] = useState('');
  const [newBg, setNewBg] = useState(BG_COLORS[0]);
  const [newType, setNewType] = useState<'text' | 'image'>('text');
  const [newImage, setNewImage] = useState('');
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
  }, [status]);

  useEffect(() => {
    if (mounted) setStories(loadStories());
  }, [mounted]);

  // Auto-avance story toutes les 5s
  useEffect(() => {
    if (!viewing) { setProgress(0); return; }
    setProgress(0);
    const start = Date.now();
    const duration = 5000;
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(progressRef.current!);
        // Passer à la story suivante du même auteur
        const authorStories = stories.filter(s => s.authorId === viewing.authorId);
        const idx = authorStories.findIndex(s => s.id === viewing.id);
        if (idx < authorStories.length - 1) {
          setViewing(authorStories[idx + 1]);
        } else {
          setViewing(null);
        }
      }
    }, 50);
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [viewing]);

  function openStory(story: Story) {
    // Marquer comme vu
    const userId = session?.user?.id ?? 'me';
    if (!story.views.includes(userId)) {
      story.views.push(userId);
      const all = loadStories().map(s => s.id === story.id ? story : s);
      localStorage.setItem(STORY_KEY, JSON.stringify(all));
    }
    setViewing(story);
  }

  function handleCreate() {
    if (!session?.user) return;
    if (newType === 'text' && !newText.trim()) return;
    if (newType === 'image' && !newImage) return;
    const now = new Date();
    const story: Story = {
      id: `story_${Date.now()}`,
      authorId: session.user.id,
      authorName: session.user.name ?? 'Moi',
      authorAvatar: session.user.image ?? undefined,
      content: newType === 'text' ? newText.trim() : newImage,
      type: newType,
      bg: newBg,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      views: [],
    };
    saveStory(story);
    setStories(loadStories());
    setCreating(false);
    setNewText('');
    setNewImage('');
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

  const myId = session?.user?.id ?? '';
  const myStories = byAuthor[myId] ?? [];
  const othersAuthors = Object.keys(byAuthor).filter(id => id !== myId);

  if (!mounted || status === 'loading') return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-app)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--header-bg)', borderBottom:'1px solid var(--border)', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => router.back()} style={{ width:36, height:36, borderRadius:'50%', border:'none', background:'var(--bg-surface)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-primary)', fontSize:18 }}>←</button>
        <h1 style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', margin:0, flex:1 }}>Stories</h1>
        <button onClick={() => setCreating(true)}
          style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:20, padding:'8px 16px', cursor:'pointer', fontWeight:600, fontSize:14 }}>
          + Créer
        </button>
      </div>

      <div style={{ padding:16 }}>
        {/* Ma story */}
        <div style={{ marginBottom:24 }}>
          <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', marginBottom:12, textTransform:'uppercase', letterSpacing:.5 }}>Ma story</p>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:8 }}>
            {/* Bouton ajouter */}
            <button onClick={() => setCreating(true)} style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6, background:'transparent', border:'none', cursor:'pointer' }}>
              <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--bg-surface)', border:'2px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, color:'var(--accent)' }}>+</div>
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>Ajouter</span>
            </button>
            {myStories.map(s => (
              <button key={s.id} onClick={() => openStory(s)} style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6, background:'transparent', border:'none', cursor:'pointer' }}>
                <div style={{ width:64, height:64, borderRadius:'50%', overflow:'hidden', border:'3px solid var(--accent)', background: s.type==='text' ? s.bg : '#000' }}>
                  {s.type === 'image' ? (
                    <img src={s.content} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : (
                    <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:s.bg }}>
                      <span style={{ fontSize:10, color:'#fff', fontWeight:700, textAlign:'center', padding:4, overflow:'hidden' }}>{s.content.slice(0,20)}</span>
                    </div>
                  )}
                </div>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>Moi</span>
              </button>
            ))}
          </div>
        </div>

        {/* Stories des autres */}
        {othersAuthors.length > 0 && (
          <div>
            <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', marginBottom:12, textTransform:'uppercase', letterSpacing:.5 }}>Récentes</p>
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              {othersAuthors.map(authorId => {
                const authorStories = byAuthor[authorId];
                const first = authorStories[0];
                const hasUnread = authorStories.some(s => !s.views.includes(myId));
                return (
                  <button key={authorId} onClick={() => openStory(first)}
                    style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 4px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ width:56, height:56, borderRadius:'50%', overflow:'hidden', border:`3px solid ${hasUnread ? 'var(--accent)' : 'var(--border)'}`, background:'#000', flexShrink:0 }}>
                      {first.type === 'image' ? (
                        <img src={first.content} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      ) : (
                        <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:first.bg }}>
                          <span style={{ fontSize:9, color:'#fff', fontWeight:700, textAlign:'center', padding:4 }}>{first.content.slice(0,15)}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p style={{ margin:0, fontWeight:600, fontSize:15, color:'var(--text-primary)' }}>{first.authorName}</p>
                      <p style={{ margin:0, fontSize:12, color:'var(--text-muted)' }}>
                        {authorStories.length} story{authorStories.length > 1 ? 's' : ''} · {hasUnread ? 'Non vue' : 'Vue'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {stories.length === 0 && (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-muted)' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>📸</div>
            <p style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)', marginBottom:8 }}>Aucune story</p>
            <p style={{ fontSize:14 }}>Créez votre première story — elle disparaît après 24h.</p>
          </div>
        )}
      </div>

      {/* Viewer story */}
      {viewing && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'#000', display:'flex', flexDirection:'column' }}>
          {/* Barre de progression */}
          <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:10, padding:'8px 12px', display:'flex', gap:4 }}>
            {(byAuthor[viewing.authorId] ?? []).map((s, i) => (
              <div key={s.id} style={{ flex:1, height:3, borderRadius:2, background:'rgba(255,255,255,.3)', overflow:'hidden' }}>
                <div style={{ height:'100%', background:'#fff', width: s.id === viewing.id ? `${progress}%` : stories.findIndex(x=>x.id===s.id) < stories.findIndex(x=>x.id===viewing.id) ? '100%' : '0%', transition:'width .05s linear' }} />
              </div>
            ))}
          </div>

          {/* Header */}
          <div style={{ position:'absolute', top:20, left:0, right:0, zIndex:10, display:'flex', alignItems:'center', gap:10, padding:'0 16px' }}>
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

          {/* Contenu */}
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background: viewing.type==='text' ? viewing.bg : '#000' }}
            onClick={() => {
              const authorStories = byAuthor[viewing.authorId] ?? [];
              const idx = authorStories.findIndex(s => s.id === viewing.id);
              if (idx < authorStories.length - 1) setViewing(authorStories[idx + 1]);
              else setViewing(null);
            }}>
            {viewing.type === 'image' ? (
              <img src={viewing.content} alt="" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
            ) : (
              <p style={{ fontSize:28, fontWeight:700, color:'#fff', textAlign:'center', padding:32, textShadow:'0 2px 8px rgba(0,0,0,.3)' }}>{viewing.content}</p>
            )}
          </div>

          {/* Vues */}
          <div style={{ position:'absolute', bottom:24, left:0, right:0, display:'flex', justifyContent:'center' }}>
            <div style={{ background:'rgba(0,0,0,.5)', borderRadius:20, padding:'6px 16px', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:16 }}>👁</span>
              <span style={{ color:'#fff', fontSize:13 }}>{viewing.views.length} vue{viewing.views.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal création */}
      {creating && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'flex-end' }}>
          <div style={{ width:'100%', background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:24, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <button onClick={() => setCreating(false)} style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:22, color:'var(--text-primary)' }}>×</button>
              <h3 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--text-primary)', flex:1 }}>Nouvelle story</h3>
              <button onClick={handleCreate}
                style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:12, padding:'8px 20px', cursor:'pointer', fontWeight:600, fontSize:14 }}>
                Publier
              </button>
            </div>

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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
