'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notify } from '../../lib/feedback';
import { api } from '../../lib/api';
import { saveToGallery } from '../../lib/gallery';
import { playReminderSound } from '../../lib/sounds';
import { useSettings } from '../../store/settings';
import type { LangCode } from '../../lib/i18n';

interface Note { id: string; title: string; body: string; updatedAt: number; }
interface CalEvent { id: string; title: string; date: string; note: string; notified: boolean; notifiedAt?: number; }
type ToolTab = 'meeting'|'flyer'|'video'|'ai'|'translate'|'notes'|'events';

function localToolKey(baseKey: string, ownerId?: string) {
  const normalized = typeof ownerId === 'string' ? ownerId.trim() : '';
  return normalized ? `${baseKey}:${normalized}` : baseKey;
}
function requirePaymentSession(token: string) {
  if (token) return true;
  notify('Session expirée. Reconnectez-vous avec Google avant de lancer le paiement.', 'error');
  return false;
}
function loadNotes(ownerId?: string): Note[] { try { return JSON.parse(localStorage.getItem(localToolKey('oracle-notes', ownerId)) ?? '[]'); } catch { return []; } }
function saveNotes(n: Note[], ownerId?: string) { localStorage.setItem(localToolKey('oracle-notes', ownerId), JSON.stringify(n)); }
function loadEvents(ownerId?: string): CalEvent[] { try { return JSON.parse(localStorage.getItem(localToolKey('oracle-events', ownerId)) ?? '[]'); } catch { return []; } }
function saveEvents(e: CalEvent[], ownerId?: string) { localStorage.setItem(localToolKey('oracle-events', ownerId), JSON.stringify(e)); }

export default function ToolsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawInitialTab = searchParams?.get('tab');
  const initialTab: ToolTab = rawInitialTab === 'flyer' || rawInitialTab === 'video' || rawInitialTab === 'ai' || rawInitialTab === 'translate' || rawInitialTab === 'notes' || rawInitialTab === 'events' ? rawInitialTab : 'meeting';
  const [tab, setTab] = useState<ToolTab>(initialTab);

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login'); }, [status]);
  useEffect(() => {
    const nextTab = searchParams?.get('tab');
    if (nextTab === 'meeting' || nextTab === 'flyer' || nextTab === 'video' || nextTab === 'ai' || nextTab === 'translate' || nextTab === 'notes' || nextTab === 'events') {
      setTab(nextTab);
    }
  }, [searchParams]);
  if (status === 'loading') return <Spinner />;

  const userName = session?.user?.name ?? 'Utilisateur';
  const token = (session?.user as any)?.backendToken ?? '';
  const ownerId = session?.user?.id || session?.user?.email || token || '';
  const paystackReference = searchParams?.get('reference') ?? '';
  const flyerPaystack = searchParams?.get('flyerPaystack') ?? '';
  const videoPaystack = searchParams?.get('videoPaystack') ?? '';

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-input)' }}>
      {/* Header */}
      <div style={{ background: 'var(--brand)', padding: '14px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 4 }}>
            <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>Outils</h1>
        </div>
        <div style={{ display: 'flex', gap: 0, overflowX:'auto', scrollbarWidth:'none' }}>
          {(['meeting','flyer','video','ai','translate','notes','events'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: '0 0 auto', minWidth: t === 'translate' ? 108 : t === 'flyer' ? 104 : t === 'video' ? 108 : 92, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? '#fff' : 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: tab === t ? 800 : 500, padding: '8px 8px', borderBottom: tab === t ? '2px solid #fff' : '2px solid transparent', whiteSpace:'nowrap' }}>
              {t === 'meeting' ? '🎥 Réunion' : t === 'flyer' ? '✨ Flyer IA' : t === 'video' ? '🎬 IA Vidéo' : t === 'ai' ? '🤖 Réponse IA' : t === 'translate' ? '🌍 Traduction' : t === 'notes' ? '📝 Notes' : '📅 Rappels'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'meeting' && <MeetingTab userName={userName} />}
        {tab === 'flyer' && <FlyerTab token={token} ownerId={ownerId} paystackReference={flyerPaystack === 'verify' ? paystackReference : ''} />}
        {tab === 'video' && <VideoTab token={token} ownerId={ownerId} paystackReference={videoPaystack === 'verify' ? paystackReference : ''} />}
        {tab === 'ai' && <AiReplyTab token={token} paystackReference={paystackReference} />}
        {tab === 'translate' && <TranslateTab token={token} />}
        {tab === 'notes'   && <NotesTab ownerId={ownerId} />}
        {tab === 'events'  && <EventsTab ownerId={ownerId} />}
      </div>
    </div>
  );
}

/* ── Meeting ── */
function MeetingTab({ userName }: { userName: string }) {
  const [room, setRoom] = useState('');
  const [active, setActive] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [joinLink, setJoinLink] = useState('');
  const [notice, setNotice] = useState('');

  function startMeeting() {
    const name = room.trim() || `oracle-${Math.random().toString(36).slice(2, 8)}`;
    setRoomName(name); setActive(true);
    setNotice('Réunion prête. Appuyez sur Ouvrir la réunion pour entrer, puis partagez le lien aux invités.');
  }
  function joinMeeting() {
    const t = joinLink.trim(); if (!t) return;
    const r = t.includes('meet.jit.si/') ? t.split('meet.jit.si/')[1] : t;
    window.location.href = `https://meet.jit.si/${r}#userInfo.displayName="${encodeURIComponent(userName)}"`;
  }
  const shareLink = `https://meet.jit.si/${roomName}`;
  const meetingOpenLink = `${shareLink}#userInfo.displayName="${encodeURIComponent(userName)}"`;
  const pendingRoom = room.trim() || roomName || 'oracle-votre-salle';

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background:'#EAF4F1', border:'1px solid rgba(16,42,42,0.14)', borderRadius:16, padding:14, color:'#102A2A' }}>
        <p style={{ margin:'0 0 8px', fontSize:15, fontWeight:900 }}>Réunion vidéo</p>
        <div style={{ display:'grid', gap:6, marginBottom:12 }}>
          {[
            '1. Appuyez sur “Créer le lien”.',
            '2. Appuyez sur “Ouvrir la réunion” pour entrer.',
            '3. Partagez le lien aux invités.',
          ].map(step => <p key={step} style={{ margin:0, fontSize:12.7, lineHeight:1.45, fontWeight:700 }}>{step}</p>)}
        </div>
        <p style={{ margin:0, fontSize:12.2, lineHeight:1.45, color:'rgba(16,42,42,0.72)', fontWeight:700 }}>
          Conseil : sur Android, Chrome donne souvent une meilleure compatibilité micro/caméra que certains navigateurs intégrés.
        </p>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Nouvelle réunion</p>
        <input value={room} onChange={e => setRoom(e.target.value)} placeholder="Nom de la salle (optionnel)"
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
        <div style={{ background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:10, padding:'9px 11px', marginBottom:12 }}>
          <p style={{ margin:'0 0 3px', fontSize:11.5, color:'var(--text-muted)', fontWeight:800 }}>Lien prévu</p>
          <p style={{ margin:0, fontSize:12.5, color:'var(--text-primary)', fontWeight:800, wordBreak:'break-all' }}>https://meet.jit.si/{pendingRoom}</p>
        </div>
        <button onClick={startMeeting} style={{ width: '100%', background: 'var(--brand)', color: 'var(--accent-text)', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          🎥 Créer le lien
        </button>
      </div>

      {active && (
        <div style={{ background: '#e8f5e9', borderRadius: 16, padding: 16, border: '1px solid #c8e6c9' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#2e7d32', margin: '0 0 6px' }}>✅ Réunion : <strong>{roomName}</strong></p>
          {notice && <p style={{ fontSize:12.5, lineHeight:1.45, color:'#2e7d32', margin:'0 0 8px', fontWeight:700 }}>{notice}</p>}
          <div style={{ background: '#fff', borderRadius: 10, padding: '8px 12px', marginBottom: 10, wordBreak: 'break-all', fontSize: 13, color: 'var(--brand)' }}>{shareLink}</div>
          <button onClick={() => { window.location.href = meetingOpenLink; }}
            style={{ width: '100%', background: 'var(--brand)', border: 'none', borderRadius: 10, padding: 12, cursor: 'pointer', fontSize: 14, color: '#fff', fontWeight: 900, marginBottom: 8 }}>
            🎥 Ouvrir la réunion
          </button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => navigator.clipboard?.writeText(shareLink).then(() => notify('Lien copié.', 'success'))}
              style={{ flex: 1, background: 'var(--bg-input)', border: 'none', borderRadius: 10, padding: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📋 Copier</button>
            <button onClick={() => navigator.share?.({ title: 'Rejoins ma réunion', url: shareLink }).catch(() => {})}
              style={{ flex: 1, background: 'var(--brand)', border: 'none', borderRadius: 10, padding: 10, cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>📤 Partager</button>
          </div>
          <button onClick={() => { setActive(false); setRoom(''); setRoomName(''); }}
            style={{ width: '100%', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 10, cursor: 'pointer', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            ✖ Terminer
          </button>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rejoindre une réunion</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={joinLink} onChange={e => setJoinLink(e.target.value)} placeholder="Lien ou nom de salle"
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none' }} />
          <button onClick={joinMeeting} style={{ background: 'var(--brand)', color: 'var(--accent-text)', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            Rejoindre
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Flyer IA ── */
interface FlyerCreation {
  id: string;
  title: string;
  prompt: string;
  imageUrl: string;
  mime: string;
  createdAt: number;
}

interface FlyerReferenceImage {
  id: string;
  dataUrl: string;
  mime: string;
  name: string;
}

const FLYER_GALLERY_KEY = 'oracle-ai-flyers';

function readFlyers(ownerId?: string): FlyerCreation[] {
  try {
    const raw = JSON.parse(localStorage.getItem(localToolKey(FLYER_GALLERY_KEY, ownerId)) ?? '[]');
    return Array.isArray(raw) ? raw.filter(item => item?.imageUrl && item?.id).slice(0, 80) : [];
  } catch {
    return [];
  }
}

function writeFlyers(items: FlyerCreation[], ownerId?: string) {
  localStorage.setItem(localToolKey(FLYER_GALLERY_KEY, ownerId), JSON.stringify(items.slice(0, 80)));
}

function FlyerTab({ token, ownerId, paystackReference }: { token: string; ownerId: string; paystackReference: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<FlyerCreation | null>(null);
  const [creations, setCreations] = useState<FlyerCreation[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [referenceImages, setReferenceImages] = useState<FlyerReferenceImage[]>([]);

  useEffect(() => {
    setCreations(readFlyers(ownerId));
  }, [ownerId]);

  useEffect(() => {
    if (!token) return;
    api.aiFlyer.overview(token)
      .then(setOverview)
      .catch(() => notify('Chargement Flyer IA impossible.', 'error'));
  }, [token]);

  useEffect(() => {
    if (!token || !paystackReference) return;
    api.aiFlyer.verifyPaystack(token, paystackReference)
      .then(data => {
        setOverview(data);
        notify('Recharge Flyer IA validée.', 'success');
      })
      .catch(() => notify('Paiement Flyer IA non validé.', 'error'));
  }, [token, paystackReference]);

  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(seconds);
      setProgress(current => Math.min(92, current + (seconds < 12 ? 7 : 2)));
    }, 900);
    return () => window.clearInterval(timer);
  }, [loading]);

  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const wordCount = prompt.trim() ? words.length : 0;
  const remainingCredits = Number(overview?.wallet?.creditsRemaining ?? 0);
  const canGenerate = Boolean(token && !loading && wordCount >= 4 && wordCount <= 1000);
  const free = overview?.free;
  const nextFreeText = free?.nextFreeAt ? formatCountdown(free.nextFreeAt) : '';

  async function refreshOverview() {
    if (!token) return;
    setOverview(await api.aiFlyer.overview(token));
  }

  function persistCreation(creation: FlyerCreation) {
    const next = [creation, ...creations.filter(item => item.id !== creation.id)].slice(0, 80);
    setCreations(next);
    writeFlyers(next, ownerId);
    saveToGallery(creation.imageUrl, 'image', `${creation.title}.png`, {
      mime: creation.mime,
      source: 'ai_flyer',
    }, ownerId);
  }

  async function generateFlyer() {
    if (wordCount > 1000) {
      notify('La description ne doit pas dépasser 1000 mots.', 'error');
      return;
    }
    if (wordCount < 4) {
      notify('Décrivez votre idée avec plus de précision.', 'error');
      return;
    }
    setLoading(true);
    setProgress(8);
    setElapsed(0);
    setError('');
    try {
      const data = await api.aiFlyer.generate(token, prompt, referenceImages.map(image => ({
        dataUrl: image.dataUrl,
        mime: image.mime,
        name: image.name,
      })));
      const creation: FlyerCreation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: data.title || 'Flyer IA',
        prompt,
        imageUrl: data.imageUrl,
        mime: data.mime || 'image/png',
        createdAt: Date.now(),
      };
      setProgress(100);
      setResult(creation);
      persistCreation(creation);
      setOverview(data.overview);
      notify(referenceImages.length ? 'Flyer créé avec vos références et ajouté à Ma Galerie.' : 'Flyer créé et ajouté à Ma Galerie.', 'success');
    } catch (err: any) {
      const message = err?.message || 'Création du flyer impossible.';
      setError(message);
      notify(message, 'error');
      await refreshOverview().catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  async function handleReferenceImages(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const slots = Math.max(0, 3 - referenceImages.length);
    if (slots <= 0) {
      notify('Maximum 3 images de référence.', 'error');
      return;
    }
    const accepted = selected.slice(0, slots).filter(file => /image\/(jpeg|png|webp)/i.test(file.type));
    if (!accepted.length) {
      notify('Formats acceptés : JPG, PNG, WEBP.', 'error');
      return;
    }
    try {
      const prepared = await Promise.all(accepted.map(prepareFlyerReferenceImage));
      setReferenceImages(current => [...current, ...prepared].slice(0, 3));
    } catch {
      notify('Impossible de préparer cette image.', 'error');
    }
  }

  async function pay() {
    if (!requirePaymentSession(token)) return;
    setLoading(true);
    try {
      const data = await api.aiFlyer.initializePaystack(token);
      window.location.href = data.authorizationUrl;
    } catch (err: any) {
      notify(err?.message || 'Recharge Paystack indisponible.', 'error');
      setLoading(false);
    }
  }

  function saveCreationToPhone(item: FlyerCreation) {
    try {
      saveToGallery(item.imageUrl, 'image', `${item.title}.png`, { mime: item.mime, source: 'ai_flyer' }, ownerId);
      const a = document.createElement('a');
      a.href = item.imageUrl;
      a.download = `${slugify(item.title)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notify('Flyer enregistré.', 'success');
    } catch {
      notify('Téléchargement impossible sur ce navigateur.', 'error');
    }
  }

  async function shareCreation(item: FlyerCreation) {
    try {
      const file = await fileFromDataUrl(item.imageUrl, `${slugify(item.title)}.png`, item.mime);
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ title: item.title, text: 'Flyer créé avec Oracle Messenger', files: [file] });
        return;
      }
      await navigator.clipboard?.writeText(item.imageUrl);
      notify('Image copiée pour partage.', 'success');
    } catch {
      notify('Partage impossible sur ce navigateur.', 'error');
    }
  }

  function renameCreation(item: FlyerCreation) {
    const name = window.prompt('Nouveau nom du flyer', item.title)?.trim();
    if (!name) return;
    const next = creations.map(entry => entry.id === item.id ? { ...entry, title: name } : entry);
    setCreations(next);
    writeFlyers(next, ownerId);
    if (result?.id === item.id) setResult({ ...result, title: name });
  }

  function deleteCreation(item: FlyerCreation) {
    const next = creations.filter(entry => entry.id !== item.id);
    setCreations(next);
    writeFlyers(next, ownerId);
    if (result?.id === item.id) setResult(null);
  }

  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ background:'linear-gradient(135deg,#102A2A,#246A5D)', borderRadius:18, padding:16, color:'#fff', boxShadow:'0 12px 28px rgba(16,42,42,.18)' }}>
        <p style={{ margin:'0 0 5px', fontSize:20, fontWeight:950 }}>Créer un flyer IA</p>
        <p style={{ margin:'0 0 13px', fontSize:13, lineHeight:1.45, color:'rgba(255,255,255,.78)', fontWeight:650 }}>
          Créez des affiches et des flyers professionnels avec l'intelligence artificielle en quelques secondes.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
          <StatPill label="Restants" value={`${remainingCredits} / 6`} />
          <StatPill label="Gratuit" value={free?.available ? 'Disponible' : 'Utilisé'} />
          <StatPill label="Créés" value={`${overview?.wallet?.totalGenerated ?? creations.length}`} />
        </div>
      </div>

      <div style={{ background:'#fff', border:'1px solid rgba(217,183,91,.45)', borderRadius:18, padding:16, boxShadow:'0 10px 26px rgba(16,42,42,.10)' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
          <div style={{ width:42, height:42, borderRadius:14, background:'#102A2A', color:'#F8E6A0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:950, flexShrink:0 }}>₣</div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:'0 0 4px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Paiement Flyer IA</p>
            <p style={{ margin:0, fontSize:12.8, lineHeight:1.45, color:'var(--text-muted)', fontWeight:700 }}>
              1 création gratuite. Ensuite, activez un pack de 6 créations pour continuer sans chercher le bouton.
            </p>
          </div>
        </div>
        <button onClick={pay} disabled={loading || !overview?.paystackReady}
          style={{ width:'100%', border:'none', borderRadius:14, background:'#102A2A', color:'#fff', padding:14, fontSize:15, fontWeight:950, cursor:overview?.paystackReady ? 'pointer' : 'default', opacity:overview?.paystackReady ? 1 : .48 }}>
          {remainingCredits > 0 ? `Recharger encore - ${remainingCredits} crédit(s) actif(s)` : 'Acheter 6 créations - 1 500 FCFA'}
        </button>
        {!overview?.paystackReady && <Alert text="Paiement non disponible : Paystack n’est pas encore configuré sur le serveur." />}
      </div>

      <div style={{ background:'#F8FAFC', border:'1px solid var(--border)', borderRadius:16, padding:14 }}>
        <p style={{ margin:'0 0 5px', fontSize:14.5, fontWeight:950, color:'var(--text-primary)' }}>Stockage et transit</p>
        <p style={{ margin:0, fontSize:12.5, lineHeight:1.45, color:'var(--text-muted)', fontWeight:700 }}>
          Vos flyers restent dans la galerie locale de ce téléphone. Le prompt et les images de référence transitent par le serveur uniquement pour générer le visuel IA.
        </p>
      </div>

      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10 }}>
          <div>
            <p style={{ margin:'0 0 3px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Décrivez votre idée</p>
            <p style={{ margin:0, fontSize:13, lineHeight:1.45, color:'var(--text-muted)', fontWeight:650 }}>
              Décrivez précisément le flyer ou l'image que vous souhaitez créer. Plus votre description est détaillée, meilleur sera le résultat.
            </p>
          </div>
          <span style={{ flex:'0 0 auto', borderRadius:999, background:wordCount > 1000 ? '#FEF2F2' : 'var(--bg-input)', color:wordCount > 1000 ? '#B42318' : 'var(--text-muted)', padding:'6px 9px', fontSize:12, fontWeight:900 }}>
            {wordCount}/1000
          </span>
        </div>
        <textarea
          data-flyer-prompt="true"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={8}
          placeholder="Décrivez le flyer ou l'image que vous souhaitez créer (1000 mots maximum)."
          style={{ width:'100%', border:'1px solid var(--border)', borderRadius:14, padding:'12px 13px', fontSize:14, lineHeight:1.5, outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:12, color:'var(--text-primary)', background:'#fff' }}
        />
        <div style={{ border:'1px solid var(--border)', borderRadius:14, padding:12, background:'var(--bg-input)', marginBottom:12 }}>
          <p style={{ margin:'0 0 4px', fontSize:13.5, fontWeight:950, color:'var(--text-primary)' }}>Ajouter une image <span style={{ color:'var(--text-muted)', fontWeight:800 }}>(facultatif)</span></p>
          <p style={{ margin:'0 0 10px', fontSize:12.5, lineHeight:1.4, color:'var(--text-muted)', fontWeight:650 }}>
            Ajoutez jusqu’à 3 images JPG, PNG ou WEBP pour reprendre un logo, un produit, une personne, un style ou des couleurs.
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <label style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:42, borderRadius:12, background:'#fff', border:'1px solid var(--border)', color:'var(--text-primary)', fontSize:13, fontWeight:900, cursor:'pointer' }}>
              Prendre une photo
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { handleReferenceImages(e.target.files); e.currentTarget.value = ''; }} style={{ display:'none' }} />
            </label>
            <label style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:42, borderRadius:12, background:'#fff', border:'1px solid var(--border)', color:'var(--text-primary)', fontSize:13, fontWeight:900, cursor:'pointer' }}>
              Choisir galerie
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { handleReferenceImages(e.target.files); e.currentTarget.value = ''; }} style={{ display:'none' }} />
            </label>
          </div>
          {referenceImages.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8, marginTop:10 }}>
              {referenceImages.map(image => (
                <div key={image.id} style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'#000', aspectRatio:'1' }}>
                  <img src={image.dataUrl} alt={image.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  <button
                    type="button"
                    onClick={() => setReferenceImages(current => current.filter(item => item.id !== image.id))}
                    aria-label="Retirer l’image"
                    style={{ position:'absolute', top:5, right:5, width:26, height:26, borderRadius:'50%', border:'none', background:'rgba(0,0,0,.62)', color:'#fff', fontSize:17, lineHeight:1, cursor:'pointer' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {!free?.available && (
          <div style={{ margin:'0 0 12px', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:'10px 12px', color:'#9A3412', fontSize:12.5, lineHeight:1.45, fontWeight:800 }}>
            Vous avez utilisé votre création gratuite. {nextFreeText ? `Prochaine création gratuite dans : ${nextFreeText}.` : 'Rechargez pour continuer à créer des flyers avec l’IA.'}
          </div>
        )}
        {error && <Alert text={error} danger />}
        {loading && (
          <div style={{ margin:'0 0 12px', border:'1px solid rgba(16,42,42,.12)', borderRadius:13, padding:12, background:'#EAF4F1' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:8, color:'#102A2A', fontSize:12.5, fontWeight:900 }}>
              <span>Génération en cours</span>
              <span>{Math.round(progress)}% · ~{Math.max(5, 25 - elapsed)} s</span>
            </div>
            <div style={{ height:8, borderRadius:999, background:'rgba(16,42,42,.12)', overflow:'hidden' }}>
              <div style={{ width:`${progress}%`, height:'100%', borderRadius:999, background:'var(--brand)', transition:'width .35s ease' }} />
            </div>
          </div>
        )}
        <button onClick={generateFlyer} disabled={!canGenerate}
          style={{ width:'100%', border:'none', borderRadius:14, background:'var(--brand)', color:'#fff', padding:15, fontSize:15, fontWeight:950, cursor:canGenerate ? 'pointer' : 'default', opacity:canGenerate ? 1 : .48 }}>
          {loading ? 'Création avec l’IA...' : 'Créer avec l’IA'}
        </button>
      </div>

      {!free?.available && remainingCredits <= 0 && (
        <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
          <p style={{ margin:'0 0 5px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Recharge nécessaire</p>
          <p style={{ margin:'0 0 12px', fontSize:13, color:'var(--text-muted)', lineHeight:1.45 }}>
            Pack disponible : 1 500 FCFA pour 6 créations IA.
          </p>
          <button onClick={pay} disabled={loading || !overview?.paystackReady}
            style={{ width:'100%', border:'none', borderRadius:14, background:'#102A2A', color:'#fff', padding:14, fontSize:15, fontWeight:950, cursor:overview?.paystackReady ? 'pointer' : 'default', opacity:overview?.paystackReady ? 1 : .48 }}>
            Recharger 6 créations
          </button>
          {!overview?.paystackReady && <Alert text="Paystack n’est pas encore configuré sur le serveur." />}
        </div>
      )}

      {result && (
        <div style={{ background:'#fff', borderRadius:16, padding:12, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
          <img src={result.imageUrl} alt={result.title} style={{ width:'100%', borderRadius:13, display:'block', background:'var(--bg-input)' }} />
          <p style={{ margin:'12px 2px 10px', fontSize:15, fontWeight:950, color:'var(--text-primary)' }}>{result.title}</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button onClick={() => saveCreationToPhone(result)} style={secondaryActionStyle}>Télécharger</button>
            <button onClick={() => shareCreation(result)} style={secondaryActionStyle}>Partager</button>
          </div>
          <button onClick={generateFlyer} disabled={!canGenerate} style={{ width:'100%', marginTop:8, border:'none', borderRadius:12, background:'var(--brand)', color:'#fff', padding:13, fontSize:14, fontWeight:900, cursor:canGenerate ? 'pointer' : 'default', opacity:canGenerate ? 1 : .48 }}>
            Créer une autre version
          </button>
          <button onClick={() => {
            setResult(null);
            window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-flyer-prompt="true"]')?.focus(), 80);
          }} style={{ width:'100%', marginTop:8, border:'1px solid var(--border)', borderRadius:12, background:'var(--bg-input)', color:'var(--text-primary)', padding:12, fontSize:14, fontWeight:900, cursor:'pointer' }}>
            Modifier le prompt
          </button>
        </div>
      )}

      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:12 }}>
          <div>
            <p style={{ margin:0, fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Ma Galerie</p>
            <p style={{ margin:'3px 0 0', fontSize:12.5, color:'var(--text-muted)', fontWeight:650 }}>Créations IA conservées sur ce téléphone.</p>
          </div>
          <span style={{ color:'var(--text-muted)', fontSize:12, fontWeight:850 }}>{creations.length}</span>
        </div>
        {creations.length === 0 ? (
          <p style={{ margin:0, color:'var(--text-muted)', fontSize:13, lineHeight:1.45 }}>Vos flyers générés apparaîtront ici avec aperçu, téléchargement, partage, renommage et suppression.</p>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:10 }}>
            {creations.map(item => (
              <div key={item.id} style={{ border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', background:'var(--bg-input)' }}>
                <button onClick={() => setResult(item)} style={{ border:'none', padding:0, background:'transparent', width:'100%', cursor:'pointer' }}>
                  <img src={item.imageUrl} alt={item.title} style={{ width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' }} />
                </button>
                <div style={{ padding:9 }}>
                  <p style={{ margin:'0 0 7px', fontSize:12.5, fontWeight:900, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.title}</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    <button onClick={() => saveCreationToPhone(item)} style={miniActionStyle}>Télécharger</button>
                    <button onClick={() => shareCreation(item)} style={miniActionStyle}>Partager</button>
                    <button onClick={() => renameCreation(item)} style={miniActionStyle}>Renommer</button>
                    <button onClick={() => deleteCreation(item)} style={{ ...miniActionStyle, color:'#B42318', background:'#FEF2F2' }}>Supprimer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const secondaryActionStyle: CSSProperties = {
  border:'none',
  borderRadius:12,
  background:'var(--bg-input)',
  color:'var(--text-primary)',
  padding:12,
  fontSize:14,
  fontWeight:900,
  cursor:'pointer',
};

const miniActionStyle: CSSProperties = {
  border:'none',
  borderRadius:9,
  background:'#fff',
  color:'var(--text-primary)',
  padding:'8px 6px',
  fontSize:11.5,
  fontWeight:850,
  cursor:'pointer',
};

function formatCountdown(value: string) {
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'quelques minutes';
  const hours = Math.ceil(ms / 3600000);
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  if (days <= 0) return `${hours} h`;
  return `${days} jour${days > 1 ? 's' : ''} ${restHours} h`;
}

function slugify(value: string) {
  return String(value || 'flyer-ia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48) || 'flyer-ia';
}

async function fileFromDataUrl(dataUrl: string, name: string, mime: string) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: mime || blob.type || 'image/png' });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function prepareFlyerReferenceImage(file: File): Promise<FlyerReferenceImage> {
  if (!/image\/(jpeg|png|webp)/i.test(file.type)) throw new Error('Format image invalide');
  const source = await readFileAsDataUrl(file);
  const image = await loadImageElement(source);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { id: `${Date.now()}-${Math.random()}`, dataUrl: source, mime: file.type || 'image/jpeg', name: file.name || 'reference.jpg' };
  ctx.drawImage(image, 0, 0, width, height);
  const mime = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, mime === 'image/jpeg' || mime === 'image/webp' ? 0.86 : undefined);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    mime,
    name: file.name || 'reference.jpg',
  };
}

/* ── IA Vidéo ── */
interface VideoCreation {
  id: string;
  title: string;
  prompt: string;
  videoUrl: string;
  mime: string;
  durationSeconds: number;
  segmentCount?: number;
  engineDurationSeconds?: number;
  aspectRatio: '16:9' | '9:16';
  quality: 'hd' | 'full_hd' | 'ultra';
  createdAt: number;
}

const VIDEO_GALLERY_KEY = 'oracle-ai-videos';

function readVideos(ownerId?: string): VideoCreation[] {
  try {
    const raw = JSON.parse(localStorage.getItem(localToolKey(VIDEO_GALLERY_KEY, ownerId)) ?? '[]');
    return Array.isArray(raw) ? raw.filter(item => item?.videoUrl && item?.id).slice(0, 30) : [];
  } catch {
    return [];
  }
}

function writeVideos(items: VideoCreation[], ownerId?: string) {
  localStorage.setItem(localToolKey(VIDEO_GALLERY_KEY, ownerId), JSON.stringify(items.slice(0, 30)));
}

const VIDEO_ERROR_MESSAGES: Record<LangCode, { duration: string; quota: string; model: string; parameter: string; realPerson: string; emptyResult: string; payment: string; network: string; generic: string }> = {
  fr: {
    duration: 'La génération vidéo actuelle accepte 8 secondes maximum par séquence. La durée a été ajustée automatiquement. Réessayez.',
    quota: 'Le quota Gemini Vidéo est temporairement atteint. Réessayez dans quelques minutes. Les fragments sont maintenant lancés un par un pour réduire ce blocage.',
    model: 'Le modèle vidéo IA configuré est momentanément indisponible. Réessayez dans un instant.',
    parameter: 'Un paramètre vidéo n’est pas supporté par le modèle actuel. Il a été corrigé. Réessayez la génération.',
    realPerson: "Gemini refuse les vidéos avec le nom ou la ressemblance d'une personne réelle. Remplacez le nom par “un présentateur professionnel” ou “un conseiller”, puis réessayez.",
    emptyResult: 'Gemini n’a pas fourni de fichier vidéo. Votre prompt est peut-être trop long ou trop exigeant. Simplifiez la demande puis réessayez.',
    payment: 'Le paiement vidéo n’est pas encore validé. Validez le paiement puis relancez la génération.',
    network: 'Connexion instable. Vérifiez internet puis réessayez.',
    generic: 'Création de la vidéo impossible pour le moment. Réessayez dans un instant.',
  },
  en: {
    duration: 'Video generation currently supports up to 8 seconds per sequence. The duration was adjusted automatically. Please try again.',
    quota: 'The Gemini Video quota is temporarily reached. Please try again in a few minutes. Segments are now started one by one to reduce this blockage.',
    model: 'The configured AI video model is temporarily unavailable. Please try again shortly.',
    parameter: 'One video setting is not supported by the current model. It has been fixed. Please generate again.',
    realPerson: 'Gemini refuses videos with a real person’s name or likeness. Replace the name with “a professional presenter” or “an advisor”, then try again.',
    emptyResult: 'Gemini did not provide a video file. Your prompt may be too long or too demanding. Simplify it and try again.',
    payment: 'The video payment has not been validated yet. Confirm the payment, then generate again.',
    network: 'Unstable connection. Check your internet connection and try again.',
    generic: 'Video creation is unavailable right now. Please try again shortly.',
  },
  es: {
    duration: 'La generación de video acepta actualmente un máximo de 8 segundos por secuencia. La duración se ajustó automáticamente. Inténtalo de nuevo.',
    quota: 'La cuota de Gemini Video se alcanzó temporalmente. Inténtalo de nuevo en unos minutos. Los fragmentos ahora se lanzan uno por uno para reducir este bloqueo.',
    model: 'El modelo de video IA configurado no está disponible temporalmente. Inténtalo de nuevo en un momento.',
    parameter: 'Un parámetro de video no es compatible con el modelo actual. Ya fue corregido. Inténtalo de nuevo.',
    realPerson: 'Gemini rechaza videos con el nombre o parecido de una persona real. Sustituye el nombre por “un presentador profesional” o “un asesor” e inténtalo de nuevo.',
    emptyResult: 'Gemini no entregó ningún archivo de video. Tu prompt puede ser demasiado largo o exigente. Simplifícalo e inténtalo de nuevo.',
    payment: 'El pago del video aún no está validado. Valida el pago y vuelve a generar.',
    network: 'Conexión inestable. Revisa internet e inténtalo de nuevo.',
    generic: 'No se puede crear el video por el momento. Inténtalo de nuevo en un momento.',
  },
  ar: {
    duration: 'إنشاء الفيديو يدعم حاليا 8 ثوان كحد أقصى لكل مقطع. تم تعديل المدة تلقائيا. حاول مرة أخرى.',
    quota: 'تم الوصول مؤقتا إلى حد Gemini Video. حاول مرة أخرى بعد بضع دقائق. يتم الآن تشغيل المقاطع واحدا تلو الآخر لتقليل هذا التعطيل.',
    model: 'نموذج فيديو الذكاء الاصطناعي غير متاح مؤقتا. حاول بعد قليل.',
    parameter: 'إعداد فيديو غير مدعوم في النموذج الحالي. تم تصحيحه. حاول إنشاء الفيديو مرة أخرى.',
    realPerson: 'يرفض Gemini إنشاء فيديو باسم أو ملامح شخص حقيقي. استبدل الاسم بعبارة مقدم محترف أو مستشار ثم حاول مرة أخرى.',
    emptyResult: 'لم يوفر Gemini ملف فيديو. قد يكون الطلب طويلا أو معقدا جدا. بسّطه ثم حاول مرة أخرى.',
    payment: 'لم يتم تأكيد دفع الفيديو بعد. أكد الدفع ثم أعد المحاولة.',
    network: 'الاتصال غير مستقر. تحقق من الإنترنت ثم حاول مرة أخرى.',
    generic: 'تعذر إنشاء الفيديو حاليا. حاول مرة أخرى بعد قليل.',
  },
  zh: {
    duration: '当前视频生成每段最多支持 8 秒。时长已自动调整，请重试。',
    quota: 'Gemini Video 配额暂时已用尽。请几分钟后重试。片段现在会逐个启动以减少此问题。',
    model: '当前配置的 AI 视频模型暂时不可用，请稍后重试。',
    parameter: '当前模型不支持某个视频设置。该设置已修正，请重新生成。',
    realPerson: 'Gemini 不接受包含真实人物姓名或肖像的视频。请改成“专业主持人”或“顾问”后重试。',
    emptyResult: 'Gemini 没有返回视频文件。提示词可能过长或要求过高。请简化后重试。',
    payment: '视频付款尚未验证。请确认付款后再生成。',
    network: '网络连接不稳定。请检查网络后重试。',
    generic: '暂时无法创建视频。请稍后重试。',
  },
  pt: {
    duration: 'A geração de vídeo aceita atualmente no máximo 8 segundos por sequência. A duração foi ajustada automaticamente. Tente novamente.',
    quota: 'A quota do Gemini Video foi temporariamente atingida. Tente novamente em alguns minutos. Os fragmentos agora são iniciados um por um para reduzir esse bloqueio.',
    model: 'O modelo de vídeo IA configurado está temporariamente indisponível. Tente novamente em instantes.',
    parameter: 'Uma configuração de vídeo não é suportada pelo modelo atual. Ela foi corrigida. Tente gerar novamente.',
    realPerson: 'O Gemini recusa vídeos com nome ou aparência de uma pessoa real. Substitua o nome por “um apresentador profissional” ou “um consultor” e tente novamente.',
    emptyResult: 'O Gemini não retornou um arquivo de vídeo. O prompt pode estar longo ou exigente demais. Simplifique e tente novamente.',
    payment: 'O pagamento do vídeo ainda não foi validado. Valide o pagamento e tente gerar novamente.',
    network: 'Conexão instável. Verifique a internet e tente novamente.',
    generic: 'Não foi possível criar o vídeo agora. Tente novamente em instantes.',
  },
  ru: {
    duration: 'Сейчас генерация видео поддерживает до 8 секунд на один фрагмент. Длительность изменена автоматически. Попробуйте еще раз.',
    quota: 'Лимит Gemini Video временно исчерпан. Попробуйте через несколько минут. Фрагменты теперь запускаются по одному, чтобы уменьшить эту блокировку.',
    model: 'Настроенная AI-модель видео временно недоступна. Попробуйте позже.',
    parameter: 'Один параметр видео не поддерживается текущей моделью. Он исправлен. Попробуйте создать видео снова.',
    realPerson: 'Gemini не создает видео с именем или внешностью реального человека. Замените имя на “профессиональный ведущий” или “консультант” и попробуйте снова.',
    emptyResult: 'Gemini не вернул видеофайл. Запрос может быть слишком длинным или сложным. Упростите его и попробуйте снова.',
    payment: 'Платеж за видео еще не подтвержден. Подтвердите оплату и повторите генерацию.',
    network: 'Нестабильное соединение. Проверьте интернет и попробуйте снова.',
    generic: 'Сейчас создать видео невозможно. Попробуйте позже.',
  },
  hi: {
    duration: 'वीडियो जनरेशन अभी हर सीक्वेंस में अधिकतम 8 सेकंड तक सपोर्ट करता है। अवधि अपने आप बदली गई है। फिर कोशिश करें।',
    quota: 'Gemini Video quota अस्थायी रूप से पूरा हो गया है। कुछ मिनट बाद फिर कोशिश करें। इस रुकावट को कम करने के लिए fragments अब एक-एक करके शुरू होंगे।',
    model: 'कॉन्फ़िगर किया गया AI वीडियो मॉडल अभी उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें।',
    parameter: 'एक वीडियो सेटिंग मौजूदा मॉडल में समर्थित नहीं है। उसे ठीक कर दिया गया है। फिर जनरेट करें।',
    realPerson: 'Gemini किसी वास्तविक व्यक्ति के नाम या चेहरे वाली वीडियो नहीं बनाता। नाम की जगह “एक पेशेवर प्रस्तुतकर्ता” या “एक सलाहकार” लिखकर फिर कोशिश करें।',
    emptyResult: 'Gemini ने वीडियो फ़ाइल नहीं दी। आपका prompt बहुत लंबा या कठिन हो सकता है। उसे सरल करके फिर कोशिश करें।',
    payment: 'वीडियो भुगतान अभी सत्यापित नहीं हुआ है। भुगतान सत्यापित करके फिर जनरेट करें।',
    network: 'कनेक्शन अस्थिर है। इंटरनेट जांचें और फिर कोशिश करें।',
    generic: 'अभी वीडियो बनाना संभव नहीं है। थोड़ी देर बाद फिर कोशिश करें।',
  },
  de: {
    duration: 'Die Videogenerierung unterstützt aktuell maximal 8 Sekunden pro Sequenz. Die Dauer wurde automatisch angepasst. Bitte erneut versuchen.',
    quota: 'Das Gemini-Video-Kontingent ist vorübergehend erreicht. Bitte in einigen Minuten erneut versuchen. Die Fragmente werden jetzt nacheinander gestartet, um diese Blockade zu reduzieren.',
    model: 'Das konfigurierte KI-Videomodell ist vorübergehend nicht verfügbar. Bitte gleich erneut versuchen.',
    parameter: 'Eine Videoeinstellung wird vom aktuellen Modell nicht unterstützt. Sie wurde korrigiert. Bitte erneut generieren.',
    realPerson: 'Gemini lehnt Videos mit dem Namen oder Aussehen einer realen Person ab. Ersetzen Sie den Namen durch “professioneller Moderator” oder “Berater” und versuchen Sie es erneut.',
    emptyResult: 'Gemini hat keine Videodatei geliefert. Der Prompt ist möglicherweise zu lang oder zu anspruchsvoll. Bitte vereinfachen und erneut versuchen.',
    payment: 'Die Videozahlung wurde noch nicht bestätigt. Bestätigen Sie die Zahlung und starten Sie die Generierung erneut.',
    network: 'Instabile Verbindung. Prüfen Sie die Internetverbindung und versuchen Sie es erneut.',
    generic: 'Das Video kann im Moment nicht erstellt werden. Bitte gleich erneut versuchen.',
  },
  ja: {
    duration: '現在の動画生成は1シーケンス最大8秒まで対応しています。時間は自動調整されました。もう一度お試しください。',
    quota: 'Gemini Video の割り当てに一時的に達しました。数分後に再試行してください。この問題を減らすため、フラグメントは順番に開始されます。',
    model: '設定されたAI動画モデルは一時的に利用できません。しばらくしてから再試行してください。',
    parameter: '現在のモデルで対応していない動画設定がありました。修正済みです。もう一度生成してください。',
    realPerson: 'Gemini は実在人物の名前や容姿を使った動画を拒否します。「プロの司会者」または「アドバイザー」に置き換えて再試行してください。',
    emptyResult: 'Gemini が動画ファイルを返しませんでした。プロンプトが長すぎるか要求が高すぎる可能性があります。簡単にして再試行してください。',
    payment: '動画の支払いがまだ確認されていません。支払いを確認してから再生成してください。',
    network: '接続が不安定です。インターネットを確認して再試行してください。',
    generic: '現在、動画を作成できません。しばらくしてから再試行してください。',
  },
};

function videoUserError(error: unknown, lang: LangCode) {
  const messages = VIDEO_ERROR_MESSAGES[lang] || VIDEO_ERROR_MESSAGES.fr;
  const raw = error instanceof Error ? error.message : String(error || '');
  const lower = raw.toLowerCase();
  if (/durationseconds|between 4 and 8|out of bound|8 secondes|8 seconds/.test(lower)) return messages.duration;
  if (/quota|rate-limit|resource_exhausted|resource exhausted|429/.test(lower)) return messages.quota;
  if (/persongeneration|allow_adult|currently not supported|unsupported|not supported|aspectratio|aspect ratio|format vidéo/.test(lower)) return messages.parameter;
  if (/personne réelle|real person|real people|people's names|likeness|celebrity|ressemblance/.test(lower)) return messages.realPerson;
  if (/mp4|fichier vidéo|video file|sans fournir|did not provide|retourné de fichier/.test(lower)) return messages.emptyResult;
  if (/model|predictlongrunning|not found|unavailable|indisponible/.test(lower)) return messages.model;
  if (/paystack|paiement|payment|premium|forbidden|403/.test(lower)) return raw.length < 180 && !/[{}[\]"]/.test(raw) ? raw : messages.payment;
  if (/failed to fetch|network|connexion|internet/.test(lower)) return messages.network;
  if (raw && raw.length < 180 && !/^api\s+\d+/i.test(raw) && !/[{}[\]"]/.test(raw)) return raw;
  return messages.generic;
}

function VideoTab({ token, ownerId, paystackReference }: { token: string; ownerId: string; paystackReference: string }) {
  const { lang } = useSettings();
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<10 | 45>(10);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const [quality, setQuality] = useState<'hd' | 'full_hd' | 'ultra'>('hd');
  const [voiceOver, setVoiceOver] = useState(true);
  const [music, setMusic] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);
  const [referenceImages, setReferenceImages] = useState<FlyerReferenceImage[]>([]);
  const [paymentReference, setPaymentReference] = useState('');
  const [result, setResult] = useState<VideoCreation | null>(null);
  const [creations, setCreations] = useState<VideoCreation[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => { setCreations(readVideos(ownerId)); }, [ownerId]);
  useEffect(() => {
    if (!token) return;
    api.aiVideo.overview(token)
      .then(setOverview)
      .catch(() => notify('Chargement IA Vidéo impossible.', 'error'));
  }, [token]);
  useEffect(() => {
    if (!token || !paystackReference) return;
    api.aiVideo.verifyPaystack(token, paystackReference)
      .then(data => {
        setOverview(data);
        setPaymentReference(paystackReference);
        notify('Paiement IA Vidéo validé.', 'success');
      })
      .catch(() => notify('Paiement IA Vidéo non validé.', 'error'));
  }, [token, paystackReference]);
  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(seconds);
      setProgress(current => Math.min(94, current + (seconds < 20 ? 4 : 1)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const wordCount = prompt.trim() ? words.length : 0;
  const canGenerate = Boolean(token && !loading && wordCount >= 4 && wordCount <= 1000);
  const needsPayment = durationSeconds === 45 && !overview?.isAdmin;
  const nextFreeText = overview?.free?.nextFreeAt ? formatCountdown(overview.free.nextFreeAt) : '';

  async function refreshOverview() {
    if (!token) return;
    setOverview(await api.aiVideo.overview(token));
  }

  function persistCreation(creation: VideoCreation) {
    const next = [creation, ...creations.filter(item => item.id !== creation.id)].slice(0, 30);
    setCreations(next);
    writeVideos(next, ownerId);
    saveToGallery(creation.videoUrl, 'video', `${creation.title}.mp4`, {
      mime: creation.mime,
      source: 'manual',
    }, ownerId);
  }

  async function pay() {
    if (!requirePaymentSession(token)) return;
    setLoading(true);
    try {
      const data = await api.aiVideo.initializePaystack(token);
      setPaymentReference(data.reference);
      window.location.href = data.authorizationUrl;
    } catch (err: any) {
      notify(err?.message || 'Paiement IA Vidéo indisponible.', 'error');
      setLoading(false);
    }
  }

  async function generateVideo() {
    if (wordCount > 1000) return notify('La description ne doit pas dépasser 1000 mots.', 'error');
    if (wordCount < 4) return notify('Décrivez votre vidéo avec plus de précision.', 'error');
    if (needsPayment && !paymentReference) {
      notify('La vidéo Premium 45 secondes nécessite un paiement Paystack.', 'error');
      return;
    }
    setLoading(true);
    setProgress(6);
    setElapsed(0);
    setError('');
    try {
      const data = await api.aiVideo.generate(token, {
        prompt,
        durationSeconds,
        aspectRatio,
        quality,
        voiceOver,
        music,
        soundEffects,
        paymentReference: needsPayment ? paymentReference : undefined,
        referenceImages: referenceImages.map(image => ({ dataUrl: image.dataUrl, mime: image.mime, name: image.name })),
      });
      const creation: VideoCreation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: data.title || 'Vidéo IA',
        prompt,
        videoUrl: data.videoUrl,
        mime: data.mime || 'video/mp4',
        durationSeconds: data.durationSeconds || durationSeconds,
        segmentCount: data.segmentCount,
        engineDurationSeconds: data.engineDurationSeconds,
        aspectRatio: data.aspectRatio || aspectRatio,
        quality: data.quality || quality,
        createdAt: Date.now(),
      };
      setProgress(100);
      setResult(creation);
      persistCreation(creation);
      setOverview(data.overview);
      setPaymentReference('');
      notify('Vidéo IA créée et ajoutée à Ma Galerie.', 'success');
    } catch (err: any) {
      const message = videoUserError(err, lang);
      setError(message);
      notify(message, 'error');
      await refreshOverview().catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  async function handleReferenceImages(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const slots = Math.max(0, 4 - referenceImages.length);
    if (slots <= 0) return notify('Maximum 4 images de référence.', 'error');
    const accepted = selected.slice(0, slots).filter(file => /image\/(jpeg|png|webp)/i.test(file.type));
    if (!accepted.length) return notify('Formats acceptés : JPG, PNG, WEBP.', 'error');
    try {
      const prepared = await Promise.all(accepted.map(prepareFlyerReferenceImage));
      setReferenceImages(current => [...current, ...prepared].slice(0, 4));
    } catch {
      notify('Impossible de préparer cette image.', 'error');
    }
  }

  function saveVideo(item: VideoCreation) {
    try {
      saveToGallery(item.videoUrl, 'video', `${item.title}.mp4`, { mime: item.mime, source: 'manual' }, ownerId);
      const a = document.createElement('a');
      a.href = item.videoUrl;
      a.download = `${slugify(item.title)}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notify('Vidéo enregistrée.', 'success');
    } catch {
      notify('Téléchargement impossible sur ce navigateur.', 'error');
    }
  }

  function deleteVideo(item: VideoCreation) {
    const next = creations.filter(entry => entry.id !== item.id);
    setCreations(next);
    writeVideos(next, ownerId);
    if (result?.id === item.id) setResult(null);
  }

  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ background:'linear-gradient(135deg,var(--header-bg),var(--brand))', borderRadius:18, padding:16, color:'#fff', boxShadow:'0 12px 28px rgba(16,42,42,.18)' }}>
        <p style={{ margin:'0 0 5px', fontSize:20, fontWeight:950 }}>IA Vidéo</p>
        <p style={{ margin:'0 0 13px', fontSize:13, lineHeight:1.45, color:'rgba(255,255,255,.78)', fontWeight:650 }}>
          Créez automatiquement des vidéos professionnelles de présentation avec l’IA.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
          <StatPill label="Gratuit" value={overview?.free?.available ? '10s disponible' : 'Utilisé'} />
          <StatPill label="Premium" value="45s assemblées" />
          <StatPill label="Stockage" value="Local" />
        </div>
      </div>

      <div style={{ background:'#fff', border:'1px solid rgba(217,183,91,.45)', borderRadius:18, padding:16, boxShadow:'0 10px 26px rgba(16,42,42,.10)' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
          <div style={{ width:42, height:42, borderRadius:14, background:'#102A2A', color:'#F8E6A0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:950, flexShrink:0 }}>45s</div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:'0 0 4px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Activer la vidéo Premium</p>
            <p style={{ margin:0, fontSize:12.8, lineHeight:1.45, color:'var(--text-muted)', fontWeight:700 }}>
              Test 10 secondes gratuit selon disponibilité. Pour une vidéo 45 secondes, payez 2 500 FCFA puis lancez la génération.
            </p>
          </div>
        </div>
        <button onClick={() => { setDurationSeconds(45); pay(); }} disabled={loading || !overview?.paystackReady || Boolean(paymentReference)}
          style={{ width:'100%', border:'none', borderRadius:14, background:paymentReference ? '#16A34A' : '#102A2A', color:'#fff', padding:14, fontSize:15, fontWeight:950, cursor:overview?.paystackReady && !paymentReference ? 'pointer' : 'default', opacity:overview?.paystackReady ? 1 : .48 }}>
          {paymentReference ? 'Paiement validé - créez la vidéo' : 'Payer Premium 45s - 2 500 FCFA'}
        </button>
        {!overview?.paystackReady && <Alert text="Paiement non disponible : Paystack n’est pas encore configuré sur le serveur." />}
      </div>

      <div style={{ background:'#F8FAFC', border:'1px solid var(--border)', borderRadius:16, padding:14 }}>
        <p style={{ margin:'0 0 5px', fontSize:14.5, fontWeight:950, color:'var(--text-primary)' }}>Stockage et transit</p>
        <p style={{ margin:0, fontSize:12.5, lineHeight:1.45, color:'var(--text-muted)', fontWeight:700 }}>
          Les vidéos générées sont conservées localement dans votre galerie Oracle. Le prompt et les images envoyées passent par le serveur pour créer la vidéo IA.
        </p>
      </div>

      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10 }}>
          <div>
            <p style={{ margin:'0 0 3px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Décrivez votre vidéo</p>
            <p style={{ margin:0, fontSize:13, lineHeight:1.45, color:'var(--text-muted)', fontWeight:650 }}>
              Décrivez l’histoire, le style, le public, les scènes et l’objectif de la vidéo.
            </p>
          </div>
          <span style={{ flex:'0 0 auto', borderRadius:999, background:wordCount > 1000 ? '#FEF2F2' : 'var(--bg-input)', color:wordCount > 1000 ? '#B42318' : 'var(--text-muted)', padding:'6px 9px', fontSize:12, fontWeight:900 }}>
            {wordCount}/1000
          </span>
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={7}
          placeholder="Exemple : Crée une vidéo verticale de 45 secondes pour présenter mon salon de beauté, avec plans modernes, voix off professionnelle, musique douce et appel à l’action final."
          style={{ width:'100%', border:'1px solid var(--border)', borderRadius:14, padding:'12px 13px', fontSize:14, lineHeight:1.5, outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:12, color:'var(--text-primary)', background:'#fff' }}
        />
        <div style={{ margin:'0 0 12px', border:'1px solid #FED7AA', borderRadius:12, background:'#FFF7ED', color:'#9A3412', padding:'9px 11px', fontSize:12.5, lineHeight:1.42, fontWeight:800 }}>
          Les vidéos longues sont générées en fragments de 8s puis assemblées automatiquement. Les noms ou ressemblances de personnes réelles sont remplacés par un rôle fictif pour éviter le filtre Gemini.
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8, marginBottom:12 }}>
          <SelectPill active={durationSeconds === 10} label="Test 10s" onClick={() => setDurationSeconds(10)} />
          <SelectPill active={durationSeconds === 45} label="Premium 45s" onClick={() => setDurationSeconds(45)} />
          <SelectPill active={voiceOver} label="Voix off" onClick={() => setVoiceOver(!voiceOver)} />
          {(['16:9','9:16'] as const).map(v => <SelectPill key={v} active={aspectRatio === v} label={v} onClick={() => setAspectRatio(v)} />)}
          {(['hd','full_hd','ultra'] as const).map(v => <SelectPill key={v} active={quality === v} label={v === 'hd' ? 'HD' : v === 'full_hd' ? 'Full HD' : 'Très HD'} onClick={() => setQuality(v)} />)}
          <SelectPill active={music} label="Musique" onClick={() => setMusic(!music)} />
          <SelectPill active={soundEffects} label="Effets" onClick={() => setSoundEffects(!soundEffects)} />
        </div>

        <div style={{ border:'1px solid var(--border)', borderRadius:14, padding:12, background:'var(--bg-input)', marginBottom:12 }}>
          <p style={{ margin:'0 0 4px', fontSize:13.5, fontWeight:950, color:'var(--text-primary)' }}>Images de référence <span style={{ color:'var(--text-muted)', fontWeight:800 }}>(facultatif)</span></p>
          <p style={{ margin:'0 0 10px', fontSize:12.5, lineHeight:1.4, color:'var(--text-muted)', fontWeight:650 }}>
            Ajoutez jusqu’à 4 images pour guider le style, les couleurs, le produit ou le logo.
          </p>
          <label style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:42, borderRadius:12, background:'#fff', border:'1px solid var(--border)', color:'var(--text-primary)', fontSize:13, fontWeight:900, cursor:'pointer' }}>
            Ajouter des images
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { handleReferenceImages(e.target.files); e.currentTarget.value = ''; }} style={{ display:'none' }} />
          </label>
          {referenceImages.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:8, marginTop:10 }}>
              {referenceImages.map(image => (
                <div key={image.id} style={{ position:'relative', borderRadius:12, overflow:'hidden', background:'#000', aspectRatio:'1' }}>
                  <img src={image.dataUrl} alt={image.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  <button type="button" onClick={() => setReferenceImages(current => current.filter(item => item.id !== image.id))}
                    style={{ position:'absolute', top:5, right:5, width:26, height:26, borderRadius:'50%', border:'none', background:'rgba(0,0,0,.62)', color:'#fff', fontSize:17, lineHeight:1, cursor:'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {durationSeconds === 10 && !overview?.isAdmin && !overview?.free?.available && (
          <Alert text={`Votre essai gratuit du mois est utilisé. ${nextFreeText ? `Prochain essai dans : ${nextFreeText}.` : ''}`} />
        )}
        {needsPayment && (
          <div style={{ margin:'0 0 12px', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:'10px 12px', color:'#9A3412', fontSize:12.5, lineHeight:1.45, fontWeight:800 }}>
            Vidéo Premium 45 secondes : 2 500 FCFA. Le paiement doit être validé avant la génération.
            <button onClick={pay} disabled={loading || !overview?.paystackReady}
              style={{ width:'100%', marginTop:10, border:'none', borderRadius:12, background:'#102A2A', color:'#fff', padding:12, fontSize:14, fontWeight:950, cursor:overview?.paystackReady ? 'pointer' : 'default', opacity:overview?.paystackReady ? 1 : .48 }}>
              Payer avec Paystack
            </button>
          </div>
        )}
        {error && <Alert text={error} danger />}
        {loading && (
          <div style={{ margin:'0 0 12px', border:'1px solid rgba(16,42,42,.16)', borderRadius:13, padding:12, background:'rgba(16,42,42,.06)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:8, color:'var(--brand)', fontSize:12.5, fontWeight:900 }}>
              <span>{durationSeconds === 45 ? 'Génération des fragments + assemblage' : 'Génération IA Vidéo'}</span>
              <span>{Math.round(progress)}% · {elapsed}s</span>
            </div>
            <div style={{ height:8, borderRadius:999, background:'rgba(16,42,42,.12)', overflow:'hidden' }}>
              <div style={{ width:`${progress}%`, height:'100%', borderRadius:999, background:'var(--brand)', transition:'width .35s ease' }} />
            </div>
          </div>
        )}
        <button onClick={generateVideo} disabled={!canGenerate}
          style={{ width:'100%', border:'none', borderRadius:14, background:'var(--brand)', color:'var(--accent-text)', padding:15, fontSize:15, fontWeight:950, cursor:canGenerate ? 'pointer' : 'default', opacity:canGenerate ? 1 : .48 }}>
          {loading ? 'Création de la vidéo...' : 'Créer ma vidéo'}
        </button>
      </div>

      {result && (
        <div style={{ background:'#fff', borderRadius:16, padding:12, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
          <video src={result.videoUrl} controls style={{ width:'100%', borderRadius:13, display:'block', background:'#000' }} />
          <p style={{ margin:'12px 2px 10px', fontSize:15, fontWeight:950, color:'var(--text-primary)' }}>{result.title}</p>
          {result.segmentCount && result.segmentCount > 1 && (
            <p style={{ margin:'-5px 2px 10px', fontSize:12.5, color:'var(--text-muted)', lineHeight:1.35, fontWeight:750 }}>
              Vidéo assemblée avec {result.segmentCount} fragments IA.
            </p>
          )}
          <button onClick={() => saveVideo(result)} style={{ width:'100%', border:'none', borderRadius:12, background:'var(--bg-input)', color:'var(--text-primary)', padding:12, fontSize:14, fontWeight:900, cursor:'pointer' }}>Télécharger MP4</button>
        </div>
      )}

      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <p style={{ margin:0, fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Ma Galerie Vidéo</p>
        <p style={{ margin:'3px 0 12px', fontSize:12.5, color:'var(--text-muted)', fontWeight:650 }}>Vidéos IA conservées localement sur ce téléphone.</p>
        {creations.length === 0 ? (
          <p style={{ margin:0, color:'var(--text-muted)', fontSize:13, lineHeight:1.45 }}>Vos vidéos générées apparaîtront ici.</p>
        ) : (
          <div style={{ display:'grid', gap:10 }}>
            {creations.map(item => (
              <div key={item.id} style={{ border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', background:'var(--bg-input)' }}>
                <video src={item.videoUrl} controls style={{ width:'100%', display:'block', background:'#000' }} />
                <div style={{ padding:9 }}>
                  <p style={{ margin:'0 0 7px', fontSize:12.5, fontWeight:900, color:'var(--text-primary)' }}>{item.title}</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    <button onClick={() => saveVideo(item)} style={miniActionStyle}>Télécharger</button>
                    <button onClick={() => deleteVideo(item)} style={{ ...miniActionStyle, color:'#B42318', background:'#FEF2F2' }}>Supprimer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SelectPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ border:'1px solid var(--border)', borderRadius:12, background:active ? 'var(--brand)' : '#fff', color:active ? 'var(--accent-text)' : 'var(--text-primary)', minHeight:40, padding:'8px 9px', fontSize:12.5, fontWeight:900, cursor:'pointer' }}>
      {label}
    </button>
  );
}

/* ── IA / Traduction ── */
type AiConversationMessage = { role: 'client' | 'agent' | 'system'; text: string };

function AiReplyTab({ token, paystackReference }: { token: string; paystackReference: string }) {
  const [overview, setOverview] = useState<any>(null);
  const [prompt, setPrompt] = useState('Tu es l’assistant commercial de mon entreprise. Réponds clairement et poliment.');
  const [delayMs, setDelayMs] = useState(5000);
  const [customDelay, setCustomDelay] = useState('');
  const [recipientScope, setRecipientScope] = useState('private_only');
  const [enabled, setEnabled] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testReply, setTestReply] = useState('');
  const [testError, setTestError] = useState('');
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [testConversation, setTestConversation] = useState<AiConversationMessage[]>([]);
  const [testPanelNotice, setTestPanelNotice] = useState('');
  const closeTimerRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  async function loadOverview() {
    if (!token) return;
    const data = await api.aiAuto.overview(token);
    setOverview(data);
    setPrompt(data?.config?.prompt || prompt);
    setDelayMs(Number(data?.config?.delayMs ?? 5000));
    setRecipientScope(data?.config?.recipientScope || 'private_only');
    setEnabled(Boolean(data?.config?.isEnabled));
    return data;
  }

  useEffect(() => {
    loadOverview().catch(() => notify('Chargement IA impossible.', 'error'));
  }, [token]);

  useEffect(() => {
    if (!token || !paystackReference) return;
    api.aiAuto.verifyPaystack(token, paystackReference)
      .then(data => {
        setOverview(data);
        notify('Paiement IA validé.', 'success');
      })
      .catch(() => notify('Paiement Paystack non validé.', 'error'));
  }, [token, paystackReference]);

  useEffect(() => {
    if (!testPanelOpen) return;
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setTestPanelOpen(false);
      setTestPanelNotice('');
    }, 45000);
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [testPanelOpen, testConversation, testPanelNotice]);

  async function saveConfig(nextEnabled = enabled) {
    if (!token) return;
    setLoading(true);
    try {
      const selectedDelay = delayMs === -1 ? Math.max(0, Number(customDelay || 0) * 1000) : delayMs;
      const limitedPrompt = prompt.trim().split(/\s+/).filter(Boolean).slice(0, 80).join(' ');
      const data = await api.aiAuto.saveConfig(token, {
        prompt: limitedPrompt,
        delayMs: selectedDelay,
        recipientScope,
        isEnabled: nextEnabled,
        dailyLimit: null,
      });
      setPrompt(limitedPrompt);
      await loadOverview();
      if (data?.blocked) notify(data.blocked, 'error');
      else notify('Configuration IA enregistrée.', 'success');
    } catch (error: any) {
      notify(error?.message || 'Enregistrement IA impossible.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function testPrompt() {
    if (!testMessage.trim()) {
      notify('Écrivez un message de test.', 'error');
      return;
    }
    if (!canTest) {
      notify('Vos tests gratuits sont terminés. Activez un pack IA pour continuer.', 'error');
      return;
    }
    const clientText = testMessage.trim();
    setTesting(true);
    setTestReply('');
    setTestError('');
    setTestPanelOpen(true);
    setTestPanelNotice('L’agent prépare une réponse selon vos règles.');
    setTestConversation([
      { role: 'client', text: clientText },
      { role: 'agent', text: 'Analyse du message client...' },
    ]);
    try {
      await saveConfig(false);
      const data = await api.aiAuto.test(token, clientText, 'tools');
      setTestReply(data.response);
      setTestConversation([
        { role: 'client', text: clientText },
        { role: 'agent', text: data.response },
      ]);
      const fresh = await loadOverview();
      const remaining = Number(fresh?.freeMessagesRemaining ?? fresh?.freeTestsRemainingToday ?? 0);
      if (!fresh?.config?.paidActive && remaining <= 0) {
        setTestPanelNotice('Essais gratuits terminés. Le panel va se fermer automatiquement.');
        window.setTimeout(() => {
          setTestPanelOpen(false);
          setTestPanelNotice('');
        }, 2800);
      } else {
        setTestPanelNotice('Test terminé. Sans activité, ce panel se ferme après 45 secondes.');
      }
    } catch (error: any) {
      const message = error?.message || 'Test Gemini impossible.';
      setTestError(message);
      setTestConversation([
        { role: 'client', text: clientText },
        { role: 'system', text: message },
      ]);
      setTestPanelNotice('Le test n’a pas pu aboutir.');
      notify(message, 'error');
    } finally {
      setTesting(false);
    }
  }

  async function pay(planCode: string) {
    if (!requirePaymentSession(token)) return;
    setLoading(true);
    try {
      const data = await api.aiAuto.initializePaystack(token, planCode);
      window.location.href = data.authorizationUrl;
    } catch (error: any) {
      notify(error?.message || 'Paiement Paystack indisponible.', 'error');
      setLoading(false);
    }
  }

  const wallet = overview?.wallet;
  const config = overview?.config;
  const plans = Array.isArray(overview?.plans) ? overview.plans : [];
  const usage = Array.isArray(overview?.usage) ? overview.usage : [];
  const canEnable = Boolean(config?.paidActive && wallet?.wordsRemaining > 0);
  const freeMessagesRemaining = Number(overview?.freeMessagesRemaining ?? overview?.freeTestsRemainingToday ?? 0);
  const freeMessagesLimit = Number(overview?.freeMessagesLimit ?? overview?.freeTestsPerDay ?? 5);
  const canTest = canEnable || freeMessagesRemaining > 0;
  const promptWords = prompt.trim().split(/\s+/).filter(Boolean);
  const promptWordCount = prompt.trim() ? promptWords.length : 0;

  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ background:'linear-gradient(135deg,#102A2A,#17413C)', borderRadius:18, padding:16, color:'#fff', boxShadow:'0 12px 28px rgba(16,42,42,.18)' }}>
        <p style={{ margin:'0 0 5px', fontSize:20, fontWeight:950 }}>Gemini Auto-Réponse Premium</p>
        <p style={{ margin:'0 0 13px', fontSize:13, lineHeight:1.42, color:'rgba(255,255,255,.78)', fontWeight:650 }}>
          Assistant automatique pour répondre aux messages entrants selon votre prompt. Désactivé tant que Paystack n’a pas validé le paiement.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8 }}>
          <StatPill label="Restants" value={`${wallet?.wordsRemaining ?? 0} mots`} />
          <StatPill label="Utilisés" value={`${wallet?.wordsConsumed ?? 0}`} />
          <StatPill label="Réponses" value={`${wallet?.totalResponses ?? 0}`} />
        </div>
      </div>

      <div style={{ background:'#fff', border:'1px solid rgba(217,183,91,.45)', borderRadius:18, padding:16, boxShadow:'0 10px 26px rgba(16,42,42,.10)' }}>
        <p style={{ margin:'0 0 5px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Comment l’agent IA fonctionne</p>
        <p style={{ margin:'0 0 12px', fontSize:12.8, lineHeight:1.45, color:'var(--text-muted)', fontWeight:700 }}>
          Il lit vos règles, attend le délai choisi, répond aux conversations autorisées et consomme vos mots IA. Vous pouvez tester avant d’activer.
        </p>
        <div style={{ display:'grid', gap:8 }}>
          {plans.slice(0, 2).map((plan:any) => (
            <button key={plan.code} onClick={() => pay(plan.code)} disabled={loading || !overview?.paystackReady}
              style={{ border:'1px solid var(--border)', borderRadius:14, background:'var(--bg-input)', padding:12, textAlign:'left', cursor:overview?.paystackReady ? 'pointer' : 'default', opacity:overview?.paystackReady ? 1 : .48 }}>
              <p style={{ margin:'0 0 3px', fontSize:14, fontWeight:950, color:'var(--text-primary)' }}>{plan.label}</p>
              <p style={{ margin:0, fontSize:12.5, color:'var(--text-muted)', fontWeight:750 }}>{Number(plan.priceFcfa).toLocaleString('fr-FR')} FCFA · {Number(plan.words).toLocaleString('fr-FR')} mots</p>
            </button>
          ))}
          {!plans.length && <Alert text="Les packs de paiement IA seront affichés dès que le serveur renvoie les offres." />}
        </div>
      </div>

      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:12 }}>
          <div>
            <p style={{ margin:0, fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Activation</p>
            <p style={{ margin:'3px 0 0', fontSize:12.5, color:'var(--text-muted)', fontWeight:650 }}>
              État : {config?.isEnabled ? 'actif' : 'désactivé'} · Paiement : {config?.paidActive ? 'validé' : 'requis'}
            </p>
          </div>
          <button
            onClick={() => { const next = !enabled; setEnabled(next); saveConfig(next); }}
            disabled={!canEnable || loading}
            style={{ border:'none', borderRadius:999, background: enabled ? '#16A34A' : 'var(--brand)', color:'#fff', padding:'10px 14px', fontSize:13, fontWeight:900, cursor: canEnable ? 'pointer' : 'default', opacity: canEnable ? 1 : .45 }}
          >
            {enabled ? 'Désactiver' : 'Activer'}
          </button>
        </div>
        {!overview?.paystackReady && <Alert text="Paystack n’est pas encore configuré sur le serveur. Les paiements réels resteront bloqués." />}
        {!overview?.geminiReady && <Alert text="Clé Gemini absente sur le serveur. Le backend utilise un mode de secours limité tant que la clé n’est pas ajoutée." />}
        {config?.lastError && <Alert text={config.lastError} danger />}
      </div>

      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:6}}>
          <p style={{ margin:0, fontSize:12, fontWeight:900, color:'var(--brand)', textTransform:'uppercase' }}>Prompt principal privé</p>
          <span style={{fontSize:12,fontWeight:900,color:promptWordCount>80?'#B42318':'var(--text-muted)'}}>{promptWordCount}/80 mots</span>
        </div>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value.trim().split(/\s+/).filter(Boolean).length > 80 ? e.target.value.trim().split(/\s+/).filter(Boolean).slice(0,80).join(' ') : e.target.value)} rows={7}
          placeholder="Exemple : tu es mon assistant commercial. Réponds en français, ton professionnel, court, sans promettre une livraison si elle n’est pas confirmée..."
          style={{ width:'100%', border:'1px solid var(--border)', borderRadius:12, padding:'10px 12px', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:12 }} />

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <label style={{ display:'grid', gap:5, fontSize:12, fontWeight:900, color:'var(--brand)', textTransform:'uppercase' }}>
            Délai
            <select value={delayMs} onChange={e=>setDelayMs(Number(e.target.value))} style={selectStyle}>
              <option value={0}>Immédiat</option>
              <option value={1000}>1 seconde</option>
              <option value={5000}>5 secondes</option>
              <option value={10000}>10 secondes</option>
              <option value={30000}>30 secondes</option>
              <option value={60000}>1 minute</option>
              <option value={120000}>2 minutes</option>
              <option value={300000}>5 minutes</option>
              <option value={-1}>Personnalisé</option>
            </select>
          </label>
          <label style={{ display:'grid', gap:5, fontSize:12, fontWeight:900, color:'var(--brand)', textTransform:'uppercase' }}>
            Destinataires
            <select value={recipientScope} onChange={e=>setRecipientScope(e.target.value)} style={selectStyle}>
              <option value="private_only">Conversations privées uniquement</option>
              <option value="groups_only">Groupes uniquement</option>
              <option value="friends">Uniquement mes amis</option>
              <option value="non_friends">Non amis uniquement</option>
              <option value="everyone">Tout le monde</option>
            </select>
          </label>
        </div>
        {delayMs === -1 && (
          <input value={customDelay} onChange={e=>setCustomDelay(e.target.value)} placeholder="Délai personnalisé en secondes"
            style={{ width:'100%', border:'1px solid var(--border)', borderRadius:12, padding:'10px 12px', fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:12 }} />
        )}
        <button onClick={() => saveConfig(enabled)} disabled={loading} style={{ width:'100%', border:'none', borderRadius:12, background:'var(--brand)', color:'#fff', padding:14, fontSize:15, fontWeight:900, cursor:'pointer', opacity:loading?.valueOf() ? .7 : 1 }}>
          Enregistrer les réglages
        </button>
      </div>

      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <p style={{ margin:'0 0 4px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Tester mon IA</p>
        <p style={{ margin:'0 0 12px', fontSize:13, color:'var(--text-muted)', lineHeight:1.45 }}>
          Le test ne contacte personne. Avant paiement : 5 messages gratuits au total. Après paiement : seul le compteur de mots limite l’utilisation.
        </p>
        {!config?.paidActive && (
          <div style={{ margin:'0 0 12px', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:'10px 12px', color:'#9A3412', fontSize:12.5, lineHeight:1.4, fontWeight:800 }}>
            Messages IA gratuits restants : {freeMessagesRemaining} / {freeMessagesLimit}
          </div>
        )}
        <textarea value={testMessage} onChange={e=>setTestMessage(e.target.value)} rows={5} placeholder="Message de test reçu d’un client..."
          style={{ width:'100%', border:'1px solid var(--border)', borderRadius:12, padding:'10px 12px', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:12 }} />
        <button onClick={testPrompt} disabled={testing || !canTest} style={{ width:'100%', border:'none', borderRadius:12, background:'#102A2A', color:'#fff', padding:14, fontSize:15, fontWeight:900, cursor:canTest?'pointer':'default', opacity:canTest ? 1 : .45 }}>
          {testing ? 'Test en cours...' : 'Tester mon IA'}
        </button>
        <div style={{ marginTop:12, background:testError ? '#FEF2F2' : '#EAF4F1', border:`1px solid ${testError ? '#FECACA' : 'rgba(16,42,42,.12)'}`, borderRadius:12, padding:12 }}>
          <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:900, color:testError ? '#B42318' : 'var(--brand)', textTransform:'uppercase' }}>
            {testError ? 'Erreur du test' : 'Réponse du test'}
          </p>
          <p style={{ margin:0, fontSize:14, lineHeight:1.5, color:testError ? '#7F1D1D' : 'var(--text-primary)', fontWeight:650, whiteSpace:'pre-wrap' }}>
            {testing ? 'Génération de la réponse...' : testError || testReply || 'La réponse générée par Gemini apparaîtra ici après le test.'}
          </p>
          {(testReply || testError) && (
            <button onClick={() => setTestPanelOpen(true)} style={{ marginTop:10, border:'none', borderRadius:10, background:'#102A2A', color:'#fff', padding:'9px 12px', fontSize:13, fontWeight:900, cursor:'pointer' }}>
              Voir en conversation
            </button>
          )}
        </div>
      </div>

      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
        <p style={{ margin:'0 0 10px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Paiement et recharges Paystack</p>
        <div style={{ display:'grid', gap:10 }}>
          {plans.map((plan:any) => (
            <button key={plan.code} onClick={() => pay(plan.code)} disabled={loading || !overview?.paystackReady}
              style={{ border:'1px solid var(--border)', borderRadius:14, background:'var(--bg-input)', padding:12, textAlign:'left', cursor:overview?.paystackReady ? 'pointer' : 'default', opacity:overview?.paystackReady ? 1 : .48 }}>
              <p style={{ margin:'0 0 3px', fontSize:14, fontWeight:950, color:'var(--text-primary)' }}>{plan.label}</p>
              <p style={{ margin:0, fontSize:12.5, color:'var(--text-muted)', fontWeight:750 }}>{Number(plan.priceFcfa).toLocaleString('fr-FR')} FCFA · {Number(plan.words).toLocaleString('fr-FR')} mots</p>
            </button>
          ))}
        </div>
      </div>

      {usage.length > 0 && (
        <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
          <p style={{ margin:'0 0 10px', fontSize:17, fontWeight:950, color:'var(--text-primary)' }}>Historique</p>
          <div style={{ display:'grid', gap:8 }}>
            {usage.slice(0, 8).map((item:any) => (
              <div key={item.id} style={{ border:'1px solid var(--border)', borderRadius:12, padding:10 }}>
                <p style={{ margin:'0 0 4px', fontSize:12.5, fontWeight:900, color:'var(--text-primary)' }}>{item.mode === 'free_test' ? 'Test gratuit' : item.mode === 'test' ? 'Test IA' : 'Auto-réponse'} · {item.words} mots</p>
                <p style={{ margin:0, fontSize:12, color:'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleString('fr-FR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <AiConversationPanel
        open={testPanelOpen}
        title="Test agent IA"
        subtitle="Conversation de simulation"
        notice={testPanelNotice}
        messages={testConversation}
        loading={testing}
        onClose={() => setTestPanelOpen(false)}
      />
    </div>
  );
}

const selectStyle: CSSProperties = {
  width:'100%',
  border:'1px solid var(--border)',
  borderRadius:12,
  padding:'10px 12px',
  fontSize:13,
  fontWeight:800,
  background:'#fff',
  color:'var(--text-primary)',
};

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background:'rgba(255,255,255,.10)', border:'1px solid rgba(255,255,255,.14)', borderRadius:14, padding:'10px 8px', minWidth:0 }}>
      <p style={{ margin:'0 0 3px', fontSize:10.5, color:'rgba(255,255,255,.62)', fontWeight:900, textTransform:'uppercase' }}>{label}</p>
      <p style={{ margin:0, fontSize:13, color:'#fff', fontWeight:950, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{value}</p>
    </div>
  );
}

function AiConversationPanel({ open, title, subtitle, notice, messages, loading, onClose }: {
  open: boolean;
  title: string;
  subtitle: string;
  notice?: string;
  messages: AiConversationMessage[];
  loading?: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(5,18,18,.58)', display:'flex', alignItems:'flex-end', padding:'0 10px 10px' }}>
      <div onClick={event => event.stopPropagation()} style={{ width:'100%', maxWidth:560, margin:'0 auto', background:'#fff', borderRadius:'22px 22px 18px 18px', boxShadow:'0 24px 70px rgba(0,0,0,.30)', overflow:'hidden', border:'1px solid rgba(255,255,255,.55)' }}>
        <div style={{ background:'linear-gradient(135deg,#102A2A,#246A5D)', color:'#fff', padding:16, display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:14, background:'#D9B75B', color:'#102A2A', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:950, flexShrink:0 }}>IA</div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:17, fontWeight:950 }}>{title}</p>
            <p style={{ margin:'3px 0 0', fontSize:12.5, color:'rgba(255,255,255,.74)', fontWeight:700 }}>{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ width:36, height:36, borderRadius:'50%', border:'1px solid rgba(255,255,255,.18)', background:'rgba(255,255,255,.10)', color:'#fff', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:14, maxHeight:'58vh', overflowY:'auto', background:'#F8FAFC' }}>
          {notice && (
            <div style={{ margin:'0 0 12px', border:'1px solid rgba(217,183,91,.45)', background:'#FFF9E8', color:'#7A4F00', borderRadius:12, padding:'9px 11px', fontSize:12.5, lineHeight:1.4, fontWeight:800 }}>
              {notice}
            </div>
          )}
          <div style={{ display:'grid', gap:10 }}>
            {messages.map((message, index) => {
              const isClient = message.role === 'client';
              const isSystem = message.role === 'system';
              return (
                <div key={`${message.role}-${index}`} style={{ display:'flex', justifyContent:isClient ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth:'82%', borderRadius:isClient ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background:isClient ? '#102A2A' : isSystem ? '#FEF2F2' : '#fff', color:isClient ? '#fff' : isSystem ? '#991B1B' : 'var(--text-primary)', border:isClient ? 'none' : `1px solid ${isSystem ? '#FECACA' : 'var(--border)'}`, padding:'10px 12px', boxShadow:isClient ? '0 10px 24px rgba(16,42,42,.16)' : '0 1px 3px rgba(0,0,0,.05)' }}>
                    <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:950, color:isClient ? 'rgba(255,255,255,.68)' : isSystem ? '#B42318' : 'var(--brand)', textTransform:'uppercase' }}>{isClient ? 'Client' : isSystem ? 'Système' : 'Agent IA'}</p>
                    <p style={{ margin:0, fontSize:13.5, lineHeight:1.48, fontWeight:650, whiteSpace:'pre-wrap' }}>{message.text}</p>
                  </div>
                </div>
              );
            })}
            {loading && (
              <div style={{ width:80, border:'1px solid var(--border)', background:'#fff', borderRadius:999, padding:'8px 12px', color:'var(--text-muted)', fontSize:12.5, fontWeight:900 }}>
                IA écrit...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Alert({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <div style={{ borderRadius:12, padding:'10px 12px', background:danger ? '#FEF2F2' : '#FFF7ED', color:danger ? '#B42318' : '#9A3412', fontSize:12.5, lineHeight:1.4, fontWeight:750, marginTop:10 }}>
      {text}
    </div>
  );
}

function TranslateTab({ token }: { token: string }) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('fr');
  const [result, setResult] = useState('');
  const [provider, setProvider] = useState('');
  const [translating, setTranslating] = useState(false);

  async function translate() {
    const text = source.trim();
    if (!text) {
      notify('Écrivez le texte à traduire.', 'error');
      return;
    }
    if (!token) {
      notify('Session requise pour traduire.', 'error');
      return;
    }
    setTranslating(true);
    setResult('');
    try {
      const data = await api.aiAuto.translate(token, text, target);
      setResult(data.translated);
      setProvider(data.provider === 'google' ? 'Google Traduction' : 'Dictionnaire local');
    } catch (error: any) {
      notify(error?.message || 'Traduction impossible.', 'error');
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:16, boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize:18, fontWeight:900, color:'var(--text-primary)', margin:'0 0 4px' }}>Traduction</p>
        <p style={{ fontSize:13, lineHeight:1.45, color:'var(--text-muted)', margin:'0 0 14px' }}>Traduisez un message avant de l’envoyer, sans utiliser le crédit IA.</p>
        <select value={target} onChange={e=>setTarget(e.target.value)}
          style={{ width:'100%', border:'1px solid var(--border)', borderRadius:12, padding:'11px 12px', fontSize:14, fontWeight:800, background:'#fff', color:'var(--text-primary)', marginBottom:12 }}>
          <option value="fr">Français</option>
          <option value="en">Anglais</option>
          <option value="es">Espagnol</option>
          <option value="ar">Arabe</option>
          <option value="de">Allemand</option>
          <option value="it">Italien</option>
          <option value="pt">Portugais</option>
        </select>
        <textarea value={source} onChange={e=>setSource(e.target.value)} placeholder="Texte à traduire..." rows={7}
          style={{ width:'100%', border:'1px solid var(--border)', borderRadius:12, padding:'10px 12px', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box', marginBottom:12 }} />
        <button onClick={translate} disabled={translating} style={{ width:'100%', border:'none', borderRadius:12, background:'var(--brand)', color:'#fff', padding:14, fontSize:15, fontWeight:900, cursor:'pointer', opacity:translating ? .72 : 1 }}>
          {translating ? 'Traduction...' : 'Traduire avec Google'}
        </button>
      </div>
      {result && (
        <div style={{ background:'#EAF4F1', border:'1px solid rgba(16,42,42,.12)', borderRadius:16, padding:14, color:'#102A2A', fontSize:13, lineHeight:1.45, fontWeight:750 }}>
          <p style={{ margin:'0 0 6px', fontSize:12, fontWeight:900, color:'var(--brand)', textTransform:'uppercase' }}>Résultat · {provider}</p>
          <p style={{ margin:'0 0 10px', whiteSpace:'pre-wrap' }}>{result}</p>
          <button onClick={() => navigator.clipboard?.writeText(result).then(()=>notify('Traduction copiée.', 'success'))} style={{ width:'100%', border:'none', borderRadius:12, background:'#102A2A', color:'#fff', padding:12, fontSize:14, fontWeight:900, cursor:'pointer' }}>
            Copier la traduction
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Notes ── */
function NotesTab({ ownerId }: { ownerId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); setNotes(loadNotes(ownerId)); }, [ownerId]);
  if (!mounted) return <Spinner />;

  function openNew() { setEditing({ id: '', title: '', body: '', updatedAt: 0 }); setTitle(''); setBody(''); }
  function openEdit(n: Note) { setEditing(n); setTitle(n.title); setBody(n.body); }
  function saveNote() {
    if (!title.trim() && !body.trim()) { setEditing(null); return; }
    const updated = editing!.id
      ? notes.map(n => n.id === editing!.id ? { ...n, title, body, updatedAt: Date.now() } : n)
      : [{ id: Date.now().toString(), title, body, updatedAt: Date.now() }, ...notes];
    setNotes(updated); saveNotes(updated, ownerId); setEditing(null);
  }
  function deleteNote(id: string) {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated); saveNotes(updated, ownerId);
  }

  if (editing !== null) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)' }}>←</button>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de la note"
            style={{ flex: 1, border: 'none', borderBottom: '2px solid var(--brand)', padding: '6px 0', fontSize: 17, fontWeight: 700, outline: 'none', background: 'transparent' }} />
          <button onClick={saveNote} style={{ background: 'var(--brand)', color: 'var(--accent-text)', border: 'none', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontWeight: 700 }}>
            Sauver
          </button>
        </div>
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Écrivez votre note ici…"
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 12, padding: 14, fontSize: 15, outline: 'none', resize: 'none', minHeight: 300, lineHeight: 1.6 }} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <button onClick={openNew}
        style={{ width: '100%', background: 'var(--brand)', color: 'var(--accent-text)', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
        + Nouvelle note
      </button>
      {notes.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
          <p>Aucune note pour l'instant</p>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notes.map(n => (
          <div key={n.id} style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openEdit(n)}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{n.title || '(sans titre)'}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{n.body}</p>
              <p style={{ fontSize: 11, color: '#c4c4c4', margin: 0 }}>{new Date(n.updatedAt).toLocaleDateString('fr-FR')}</p>
            </div>
            <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 18, padding: 4 }}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Events / Rappels ── */
function reminderTimestamp(date: string) {
  if (!date) return 0;
  const parsed = date.includes('T') ? new Date(date) : new Date(`${date}T09:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function reminderDisplayDate(date: string) {
  const ts = reminderTimestamp(date);
  if (!ts) return date;
  return new Date(ts).toLocaleString('fr-FR', {
    weekday:'long',
    year:'numeric',
    month:'long',
    day:'numeric',
    hour:'2-digit',
    minute:'2-digit',
  });
}

// Planifie un rappel via le Service Worker à l'heure exacte de l'événement
async function scheduleReminder(ev: CalEvent) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return;
    const timestamp = reminderTimestamp(ev.date);
    if (timestamp <= Date.now()) return;
    reg.active.postMessage({
      type: 'schedule-reminder',
      id: ev.id,
      title: ev.title,
      note: ev.note,
      date: reminderDisplayDate(ev.date),
      timestamp,
    });
  } catch {}
}

async function cancelReminder(id: string) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'cancel-reminder', id });
  } catch {}
}

function EventsTab({ ownerId }: { ownerId: string }) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [note, setNote] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const evts = loadEvents(ownerId);
    setEvents(evts);
    // Demander permission si pas encore accordée
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    // Replanifier tous les rappels futurs via SW (résiste aux rechargements)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      evts.filter(ev => reminderTimestamp(ev.date) > Date.now()).forEach(scheduleReminder);
    }

    const timer = window.setInterval(() => {
      const current = loadEvents(ownerId);
      let changed = false;
      const now = Date.now();
      const next = current.map(ev => {
        const due = reminderTimestamp(ev.date);
        if (!ev.notified && due > 0 && due <= now) {
          playReminderSound();
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Rappel : ${ev.title}`, {
              body: ev.note || reminderDisplayDate(ev.date),
              icon: '/icons/icon-192-v20260809-premium.png',
              tag: `reminder-${ev.id}`,
              requireInteraction: true,
            });
          }
          changed = true;
          return { ...ev, notified: true, notifiedAt: now };
        }
        return ev;
      });
      if (changed) {
        saveEvents(next, ownerId);
        setEvents(next);
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [ownerId]);

  if (!mounted) return <Spinner />;

  function addEvent() {
    if (!title.trim() || !date) return;
    const evDate = `${date}T${time || '09:00'}`;
    const ev: CalEvent = { id: Date.now().toString(), title: title.trim(), date: evDate, note, notified: false };
    const updated = [ev, ...events];
    setEvents(updated); saveEvents(updated, ownerId);
    setTitle(''); setDate(''); setTime('09:00'); setNote('');
    // Planifier le rappel via SW à l'heure exacte
    if ('Notification' in window && Notification.permission === 'granted') {
      scheduleReminder(ev);
      notify('Rappel programmé avec alerte.', 'success');
    } else if ('Notification' in window) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') scheduleReminder(ev);
        notify(p === 'granted' ? 'Rappel programmé avec alerte.' : 'Rappel enregistré. Activez les notifications pour être alerté.', p === 'granted' ? 'success' : 'error');
      });
    }
  }
  function deleteEvent(id: string) {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated); saveEvents(updated, ownerId);
    cancelReminder(id); // Annuler le rappel SW
  }

  const today = new Date().toISOString().split('T')[0];
  const upcoming = events.filter(e => reminderTimestamp(e.date) >= new Date(`${today}T00:00`).getTime()).sort((a, b) => reminderTimestamp(a.date) - reminderTimestamp(b.date));
  const past = events.filter(e => reminderTimestamp(e.date) < new Date(`${today}T00:00`).getTime()).sort((a, b) => reminderTimestamp(b.date) - reminderTimestamp(a.date));

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Add form */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ajouter un rappel</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de l'événement"
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:10, marginBottom: 10 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} min={today}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optionnel)"
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
        <button onClick={addEvent} disabled={!title.trim() || !date}
          style={{ width: '100%', background: 'var(--brand)', color: 'var(--accent-text)', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: (!title.trim() || !date) ? 0.5 : 1 }}>
          + Ajouter le rappel
        </button>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>À venir</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(ev => (
              <EventCard key={ev.id} ev={ev} onDelete={deleteEvent} />
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Passés</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map(ev => (
              <EventCard key={ev.id} ev={ev} onDelete={deleteEvent} past />
            ))}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <p>Aucun rappel pour l'instant</p>
        </div>
      )}
    </div>
  );
}

function EventCard({ ev, onDelete, past }: { ev: CalEvent; onDelete: (id: string) => void; past?: boolean }) {
  const d = new Date(reminderTimestamp(ev.date));
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const badge = diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : diff > 0 ? `Dans ${diff} j` : `Il y a ${-diff} j`;
  const badgeColor = diff <= 2 && diff >= 0 ? '#dc2626' : diff > 2 ? 'var(--brand)' : 'var(--text-muted)';

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 10, opacity: past ? 0.6 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{ev.title}</p>
          <span style={{ fontSize: 11, fontWeight: 700, color: badgeColor, background: `${badgeColor}18`, borderRadius: 6, padding: '2px 6px' }}>{badge}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 2px' }}>{reminderDisplayDate(ev.date)}</p>
        {ev.note && <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{ev.note}</p>}
      </div>
      <button onClick={() => onDelete(ev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 18, padding: 4 }}>🗑</button>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
