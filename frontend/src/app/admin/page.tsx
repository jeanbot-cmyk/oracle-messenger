'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getSocket } from '../../lib/socket';
import { api as apiClient } from '../../lib/api';
import { BACKEND_URL } from '../../lib/config';

const ADMIN_EMAILS = ['tchingankonggeorges@gmail.com', 'tchingangankonggeorges@gmail.com'];
const ADMIN_PHONES = ['+2250504673829', '+2250700508618'];
const MAX_BROADCAST_FILE_BYTES = 18 * 1024 * 1024;
const isAdminUser  = (s: any) => ADMIN_EMAILS.includes(s?.user?.email) || ADMIN_PHONES.includes(s?.user?.phone);

interface Stats { totalUsers:number; onlineUsers:number; pwaInstalls:number; totalMessages:number; totalConversations:number; premiumUsers?:number; }
interface Metrics { cpu:number; ramPct:number; ramUsed:number; ramTotal:number; uptime:number; loadAvg1m?:number; platform?:string; }
interface CountryStat { country:string; count:number; online:number; }
interface AiAdminPlan { code:string; label:string; type:string; priceFcfa:number; words:number; enabled:boolean; sortOrder:number; }
interface AiAdminState { plans:AiAdminPlan[]; settings:Array<{ key:string; value:string }>; stats:{ usageCount:number; wordsConsumed:number; activeUsers:number } }
interface BroadcastMedia {
  dataUrl: string;
  type: string;
  mime: string;
  name: string;
  size: number;
}

function formatNumber(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('fr-FR').format(value);
}

function formatUptime(seconds?: number) {
  if (!seconds) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}j ${hours}h`;
  return `${hours}h ${Math.floor((seconds % 3600) / 60)}min`;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [countries, setCountries] = useState<CountryStat[]>([]);
  const [aiAdmin, setAiAdmin] = useState<AiAdminState | null>(null);
  const [notif, setNotif] = useState({ title:'', body:'' });
  const [broadcast, setBroadcast] = useState('');
  const [broadcastMedia, setBroadcastMedia] = useState<BroadcastMedia | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [mounted, setMounted] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [liveOnline, setLiveOnline] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [aiSaving, setAiSaving] = useState(false);
  const systemMessageRef = useRef<HTMLDivElement | null>(null);

  const token = session?.user?.backendToken;
  const api = BACKEND_URL;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated' && !isAdminUser(session)) { router.replace('/chat'); return; }
    if (status !== 'authenticated') return;
    if (!token) {
      setLoadingData(false);
      setLoadError('Session admin incomplète. Déconnectez-vous puis reconnectez-vous.');
      return;
    }

    loadData(false);
    const interval = setInterval(() => loadData(true), 10_000);
    const refreshOnFocus = () => {
      if (document.visibilityState !== 'hidden') loadData(true);
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);

    // Socket peut ne pas être prêt immédiatement — on réessaie jusqu'à 3s
    let socket = getSocket(token);
    let retries = 0;
    const trySocket = () => {
      socket = getSocket(token);
      if (socket) {
        socket.on('admin_metrics_update', (d: { connectesEnTempsReel: number }) => {
          setLiveOnline(d.connectesEnTempsReel);
        });
      } else if (retries++ < 6) {
        setTimeout(trySocket, 500);
      }
    };
    trySocket();

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
      socket?.off('admin_metrics_update');
    };
  }, [status, token]);

  async function loadData(silent = false) {
    if (!api || !token) {
      if (!silent) {
        setLoadError(!token ? 'Session admin incomplète. Déconnectez-vous puis reconnectez-vous.' : 'URL API backend absente.');
      }
      setLoadingData(false);
      return;
    }
    if (!silent) setLoadingData(true);
    setLoadError('');
    try {
      const fetchJson = async (path: string) => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        try {
          const res = await fetch(`${api}${path}`, {
            headers:{ Authorization:`Bearer ${token}` },
            cache:'no-store',
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
          return res.json();
        } finally {
          window.clearTimeout(timeout);
        }
      };
      const [s, m, u, c, ai] = await Promise.allSettled([
        fetchJson('/admin/stats'),
        fetchJson('/admin/metrics'),
        fetchJson('/admin/users'),
        fetchJson('/admin/countries'),
        fetchJson('/admin/ai-auto'),
      ]);
      const errors: string[] = [];
      if (s.status === 'fulfilled') setStats(s.value as Stats); else errors.push('stats');
      if (m.status === 'fulfilled') setMetrics(m.value as Metrics); else errors.push('serveur');
      if (u.status === 'fulfilled') setUsers(Array.isArray(u.value) ? u.value : []); else errors.push('utilisateurs');
      if (c.status === 'fulfilled') setCountries(Array.isArray(c.value) ? c.value : []); else setCountries([]);
      if (ai.status === 'fulfilled') setAiAdmin(ai.value as AiAdminState);
      if (s.status === 'fulfilled' || m.status === 'fulfilled' || u.status === 'fulfilled') setLastRefresh(new Date());
      if (errors.length) setLoadError(`Données partielles : ${errors.join(', ')} indisponible${errors.length > 1 ? 's' : ''}.`);
    } catch (e: any) {
      setLoadError(e?.name === 'AbortError' ? 'API admin trop lente. Réessayez dans quelques secondes.' : (e?.message || 'Impossible de charger les données admin.'));
    } finally {
      setLoadingData(false);
    }
  }

  function inferBroadcastType(file: File) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      reader.readAsDataURL(file);
    });
  }

  function pickBroadcastFile(file?: File | null) {
    if (!file) return;
    if (file.size > MAX_BROADCAST_FILE_BYTES) {
      setBroadcastMsg('Fichier trop lourd. Limite actuelle : 18 MB.');
      return;
    }
    readFileAsDataUrl(file)
      .then(dataUrl => {
        setBroadcastMedia({
          dataUrl,
          type: inferBroadcastType(file),
          mime: file.type || 'application/octet-stream',
          name: file.name,
          size: file.size,
        });
        setBroadcastMsg('');
      })
      .catch(() => setBroadcastMsg('Impossible de lire le fichier sélectionné.'));
  }

  async function sendBroadcast() {
    if (!broadcast.trim() && !broadcastMedia) return;
    if (!api || !token) {
      setBroadcastMsg('Session admin ou API indisponible.');
      return;
    }
    setBroadcasting(true);
    setBroadcastMsg('');
    try {
      let content = broadcast.trim();
      let type = 'text';

      if (broadcastMedia) {
        setBroadcastMsg('Téléversement du fichier officiel...');
        const uploaded = await apiClient.media.upload(token, {
          dataUrl: broadcastMedia.dataUrl,
          name: broadcastMedia.name,
          mime: broadcastMedia.mime,
          kind: broadcastMedia.type,
        });
        type = broadcastMedia.type;
        content = JSON.stringify({
          url: uploaded.url,
          name: uploaded.name || broadcastMedia.name,
          mime: uploaded.mime || broadcastMedia.mime,
          size: uploaded.size || broadcastMedia.size,
          checksum: uploaded.checksum,
          caption: broadcast.trim() || undefined,
        });
        setBroadcastMsg('Fichier prêt. Envoi du message système...');
      }

      const r = await fetch(`${api}/admin/broadcast`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          type,
        }),
      });
      const d = await r.json();
      if (!r.ok || (!d.success && !d.sent)) {
        setBroadcastMsg(d.message || 'Erreur pendant l’envoi');
        return;
      }
      setBroadcastMsg(d.failed ? `✓ Envoyé à ${d.sent} utilisateurs · ${d.failed} échec(s)` : `✓ Envoyé à ${d.sent} utilisateurs`);
      setBroadcast('');
      setBroadcastMedia(null);
    } catch { setBroadcastMsg('Erreur réseau'); }
    finally {
      setBroadcasting(false);
      setTimeout(() => setBroadcastMsg(''), 5000);
    }
  }

  async function sendNotif() {
    if (!notif.title || !notif.body) return;
    setSending(true);
    try {
      const r = await fetch(`${api}/admin/notify`, {
        method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(notif),
      });
      const d = await r.json();
      setMsg(d.message ?? 'Envoyé !');
      setNotif({ title:'', body:'' });
    } catch { setMsg('Erreur envoi'); }
    setSending(false);
    setTimeout(() => setMsg(''), 4000);
  }

  async function saveAiPlans() {
    if (!api || !token || !aiAdmin) return;
    setAiSaving(true);
    try {
      const res = await fetch(`${api}/admin/ai-auto/plans`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ plans: aiAdmin.plans }),
      });
      if (!res.ok) throw new Error('Sauvegarde plans IA impossible');
      setAiAdmin(await res.json());
    } catch {
      setLoadError('Sauvegarde des plans IA impossible.');
    } finally {
      setAiSaving(false);
    }
  }

  async function saveAiSettings(next?: AiAdminState) {
    const source = next ?? aiAdmin;
    if (!api || !token || !source) return;
    setAiSaving(true);
    try {
      const settings = Object.fromEntries(source.settings.map(item => [item.key, item.value]));
      const res = await fetch(`${api}/admin/ai-auto/settings`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error('Sauvegarde réglages IA impossible');
      setAiAdmin(await res.json());
    } catch {
      setLoadError('Sauvegarde des réglages IA impossible.');
    } finally {
      setAiSaving(false);
    }
  }

  function updateAiPlan(code: string, patch: Partial<AiAdminPlan>) {
    setAiAdmin(prev => prev ? { ...prev, plans: prev.plans.map(plan => plan.code === code ? { ...plan, ...patch } : plan) } : prev);
  }

  function updateAiSetting(key: string, value: string) {
    setAiAdmin(prev => prev ? { ...prev, settings: prev.settings.map(item => item.key === key ? { ...item, value } : item) } : prev);
  }

  if (!mounted || status === 'loading' || status === 'unauthenticated' || (status === 'authenticated' && !isAdminUser(session))) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const card = (title: string, value: string|number, icon: string, color = 'var(--brand)', sub?: string) => (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:18, padding:16, display:'flex', alignItems:'center', gap:14, boxShadow:'var(--shadow-soft)', minHeight:92 }}>
      <div style={{ width:48, height:48, borderRadius:16, background:color.startsWith('var(') ? 'var(--brand-soft)' : color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0, color }}>{icon}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:24, lineHeight:1.05, fontWeight:950, color:'var(--text-primary)' }}>{loadingData && value === '—' ? '...' : value}</div>
        <div style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:750, marginTop:4 }}>{title}</div>
        {sub && <div style={{ fontSize:11.5, color:'var(--text-muted)', fontWeight:650, marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sub}</div>}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-app)', padding:'max(18px, env(safe-area-inset-top)) 16px 24px' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:18, gap:14 }}>
          <div>
            <h1 style={{ fontSize:30, lineHeight:1.05, fontWeight:950, color:'var(--text-primary)', margin:0 }}>Panel Admin</h1>
            <p style={{ color:'var(--text-secondary)', fontSize:15, margin:'8px 0 0', fontWeight:650 }}>
              Oracle Messenger · données API réelles
            </p>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
            <button onClick={() => systemMessageRef.current?.scrollIntoView({ behavior:'smooth', block:'start' })} style={{ background:'var(--brand)', border:'none', borderRadius:14, padding:'11px 15px', cursor:'pointer', color:'var(--accent-text)', fontSize:14, fontWeight:900, boxShadow:'var(--shadow-soft)', whiteSpace:'nowrap' }}>
              📢 Message système
            </button>
            <button onClick={() => router.push('/chat')} style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, padding:'11px 15px', cursor:'pointer', color:'var(--text-primary)', fontSize:14, fontWeight:800, boxShadow:'var(--shadow-soft)', whiteSpace:'nowrap' }}>
              ← Retour au chat
            </button>
          </div>
        </div>

        <div style={{ background: loadError ? '#FEF2F2' : '#EAF4F1', border:`1px solid ${loadError ? '#FECACA' : 'rgba(16,42,42,0.14)'}`, color: loadError ? '#B42318' : '#102A2A', borderRadius:16, padding:'12px 14px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ minWidth:0 }}>
            <p style={{ margin:0, fontSize:13.5, fontWeight:900 }}>{loadError ? 'Erreur de chargement' : 'Tableau de bord temps réel'}</p>
            <p style={{ margin:'3px 0 0', fontSize:12.5, lineHeight:1.35, fontWeight:650 }}>
              {loadError || `Rafraîchissement automatique toutes les 10s${lastRefresh ? ` · dernière mise à jour ${lastRefresh.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}` : ''}`}
            </p>
          </div>
          <button onClick={() => loadData(false)} disabled={loadingData} style={{ border:'none', background:'#fff', color:'var(--brand)', borderRadius:12, padding:'9px 12px', fontSize:13, fontWeight:900, cursor:loadingData ? 'wait' : 'pointer', flexShrink:0 }}>
            {loadingData ? '...' : 'Actualiser'}
          </button>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))', gap:12, marginBottom:18 }}>
          {card('Utilisateurs', formatNumber(stats?.totalUsers), '👥', 'var(--brand)', `${formatNumber(stats?.premiumUsers ?? 0)} premium`)}
          {card('En ligne maintenant', formatNumber(liveOnline ?? stats?.onlineUsers), '●', '#22c55e', 'WebSocket + API')}
          {card('Installations web/PWA suivies', formatNumber(stats?.pwaInstalls), '📲', '#8b5cf6', 'installations internes enregistrées')}
          {card('Installations Android Play', 'Play Console', '▶', '#0ea5e9', 'source officielle hors API interne')}
          {card('Messages', formatNumber(stats?.totalMessages), '💬', '#3b82f6', `${formatNumber(stats?.totalConversations)} conversations`)}
          {card('CPU serveur', metrics ? `${metrics.cpu}%` : '—', '⚡', '#f59e0b', `charge ${metrics?.loadAvg1m ?? '—'}`)}
          {card('RAM serveur', metrics ? `${metrics.ramPct}%` : '—', '▰', '#ef4444', metrics ? `${formatNumber(metrics.ramUsed)} / ${formatNumber(metrics.ramTotal)} MB` : undefined)}
          {card('Disponibilité', formatUptime(metrics?.uptime), '↻', '#0ea5e9', metrics?.platform ? `système ${metrics.platform}` : 'uptime serveur')}
        </div>

        {/* Gemini Auto-Réponse */}
        {aiAdmin && (
          <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, marginBottom:24, boxShadow:'0 1px 4px rgba(0,0,0,.08)', border:'1px solid rgba(16,42,42,.12)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <h2 style={{ fontSize:20, fontWeight:900, color:'var(--text-primary)', margin:'0 0 6px' }}>🤖 Gemini Auto-Réponse</h2>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:0 }}>
                  {formatNumber(aiAdmin.stats.activeUsers)} actifs · {formatNumber(aiAdmin.stats.usageCount)} réponses · {formatNumber(aiAdmin.stats.wordsConsumed)} mots consommés
                </p>
              </div>
              <button onClick={() => saveAiSettings()} disabled={aiSaving} style={{ background:'var(--brand)', color:'var(--accent-text)', border:'none', borderRadius:12, padding:'10px 14px', fontSize:13, fontWeight:900, cursor:'pointer', opacity:aiSaving ? .6 : 1 }}>
                Sauver réglages
              </button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10, marginBottom:16 }}>
              {aiAdmin.settings.map(setting => (
                <label key={setting.key} style={{ display:'grid', gap:6, fontSize:11.5, fontWeight:900, color:'var(--brand)', textTransform:'uppercase' }}>
                  {setting.key}
                  <input value={setting.value} onChange={e => updateAiSetting(setting.key, e.target.value)}
                    style={{ border:'1px solid var(--border)', borderRadius:10, padding:'9px 10px', fontSize:13, color:'var(--text-primary)', background:'var(--bg-input)', outline:'none', textTransform:'none', fontWeight:700 }} />
                </label>
              ))}
            </div>

            <p style={{ fontSize:12, fontWeight:900, color:'var(--brand)', margin:'0 0 8px', textTransform:'uppercase' }}>Plans Paystack</p>
            <div style={{ display:'grid', gap:10 }}>
              {aiAdmin.plans.map(plan => (
                <div key={plan.code} style={{ display:'grid', gridTemplateColumns:'1.4fr .8fr .8fr .7fr', gap:8, alignItems:'center', border:'1px solid var(--border)', borderRadius:12, padding:10, background:'var(--bg-input)' }}>
                  <input value={plan.label} onChange={e => updateAiPlan(plan.code, { label:e.target.value })} style={{ minWidth:0, border:'none', background:'transparent', fontWeight:850, color:'var(--text-primary)', outline:'none' }} />
                  <input type="number" value={plan.priceFcfa} onChange={e => updateAiPlan(plan.code, { priceFcfa:Number(e.target.value) })} style={{ minWidth:0, border:'1px solid var(--border)', borderRadius:8, padding:'8px 7px', fontSize:13 }} />
                  <input type="number" value={plan.words} onChange={e => updateAiPlan(plan.code, { words:Number(e.target.value) })} style={{ minWidth:0, border:'1px solid var(--border)', borderRadius:8, padding:'8px 7px', fontSize:13 }} />
                  <label style={{ display:'flex', gap:6, alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'var(--text-secondary)' }}>
                    <input type="checkbox" checked={plan.enabled} onChange={e => updateAiPlan(plan.code, { enabled:e.target.checked })} />
                    actif
                  </label>
                </div>
              ))}
            </div>
            <button onClick={saveAiPlans} disabled={aiSaving} style={{ width:'100%', marginTop:12, background:'var(--accent)', color:'var(--accent-text)', border:'none', borderRadius:12, padding:12, fontSize:14, fontWeight:900, cursor:'pointer', opacity:aiSaving ? .6 : 1 }}>
              Enregistrer les plans IA
            </button>
          </div>
        )}

        {/* Notif push */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, marginBottom:24, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
          <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text-primary)', margin:'0 0 16px' }}>📣 Notification Push manuelle</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <input value={notif.title} onChange={e => setNotif(v=>({...v,title:e.target.value}))}
              placeholder="Titre de la notification"
              style={{ padding:'12px 16px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none' }} />
            <textarea value={notif.body} onChange={e => setNotif(v=>({...v,body:e.target.value}))}
              placeholder="Message…" rows={3}
              style={{ padding:'12px 16px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none', resize:'vertical' }} />
            <button onClick={sendNotif} disabled={sending || !notif.title || !notif.body}
              style={{ background:'var(--accent)', color:'var(--accent-text)', border:'none', borderRadius:10, padding:'12px 24px', fontSize:15, fontWeight:600, cursor:'pointer', opacity: sending||!notif.title||!notif.body ? .6 : 1 }}>
              {sending ? 'Envoi…' : '📤 Envoyer à tous'}
            </button>
            {msg && <p style={{ color:'var(--accent)', fontSize:14, margin:0 }}>{msg}</p>}
          </div>
        </div>

        {/* Message système officiel */}
        <div ref={systemMessageRef} style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, marginBottom:24, boxShadow:'0 1px 4px rgba(0,0,0,.08)', border:'2px solid rgba(16,42,42,0.14)' }}>
          <h2 style={{ fontSize:20, fontWeight:900, color:'var(--text-primary)', margin:'0 0 6px' }}>📢 Message système à tous les utilisateurs</h2>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 16px' }}>
            Ce message arrive chez chaque utilisateur comme une conversation normale, épinglée en haut tant qu’elle n’est pas lue, envoyée par O.Messenger avec le logo officiel et le badge certifié. Après ouverture, elle reste disponible 24 heures puis disparaît automatiquement. Vous pouvez envoyer un texte seul, un fichier seul, ou un texte avec image, vidéo, audio ou document dans la même bulle.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <textarea value={broadcast} onChange={e => setBroadcast(e.target.value)}
              placeholder="Rédigez votre annonce, lien ou message officiel…" rows={4}
              style={{ padding:'12px 16px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none', resize:'vertical' }} />
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
              <label style={{ display:'inline-flex', alignItems:'center', gap:8, background:'var(--bg-input)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', fontSize:13, fontWeight:800, cursor:'pointer' }}>
                📎 Ajouter image / vidéo / audio / fichier
                <input type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={e => pickBroadcastFile(e.target.files?.[0])} style={{ display:'none' }} />
              </label>
              {broadcastMedia && (
                <div style={{ display:'flex', alignItems:'center', gap:8, minHeight:40, borderRadius:10, background:'#EAF4F1', color:'#102A2A', padding:'8px 10px', fontSize:13, fontWeight:800 }}>
                  <span>{broadcastMedia.type === 'image' ? '🖼️' : broadcastMedia.type === 'video' ? '🎥' : broadcastMedia.type === 'audio' ? '🎙️' : '📄'}</span>
                  <span style={{ maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{broadcastMedia.name}</span>
                  {broadcast.trim() && <span style={{ color:'#047857', fontWeight:900 }}>+ texte</span>}
                  <button onClick={() => setBroadcastMedia(null)} style={{ border:'none', background:'transparent', color:'#B42318', cursor:'pointer', fontWeight:950 }}>×</button>
                </div>
              )}
            </div>
            <button onClick={sendBroadcast} disabled={broadcasting || (!broadcast.trim() && !broadcastMedia)}
              style={{ background:'var(--brand)', color:'var(--accent-text)', border:'none', borderRadius:10, padding:'12px 24px', fontSize:15, fontWeight:600, cursor:'pointer', opacity: broadcasting || (!broadcast.trim() && !broadcastMedia) ? .6 : 1 }}>
              {broadcasting ? 'Envoi en cours…' : '📤 Envoyer dans le canal officiel'}
            </button>
            {broadcastMsg && <p style={{ color:'var(--accent)', fontSize:14, margin:0 }}>{broadcastMsg}</p>}
          </div>
        </div>

        {/* Country stats */}
        {countries.length > 0 && (
          <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
            <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text-primary)', margin:'0 0 16px' }}>🌍 Utilisateurs par pays</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {countries.map((c, i) => {
                const pct = Math.round((c.count / (stats?.totalUsers || 1)) * 100);
                return (
                  <div key={c.country}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:14, color:'var(--text-primary)', fontWeight:500 }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  '} {c.country}
                      </span>
                      <span style={{ fontSize:13, color:'var(--text-muted)' }}>
                        {c.count} utilisateurs · <span style={{ color:'#22c55e' }}>{c.online} en ligne</span>
                      </span>
                    </div>
                    <div style={{ height:6, background:'var(--bg-input)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'var(--accent)', borderRadius:3, transition:'width 0.5s' }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Users table */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text-primary)', margin:0 }}>👤 Utilisateurs récents</h2>
            <button onClick={() => loadData(false)} style={{ background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', cursor:'pointer', color:'var(--text-primary)', fontSize:13 }}>↻ Actualiser</button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['Nom','Email','Statut','Push','Inscrit le'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'10px 12px', color:'var(--text-primary)', fontWeight:500 }}>{u.name}</td>
                    <td style={{ padding:'10px 12px', color:'var(--text-secondary)' }}>{u.email}</td>
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600, background: u.status==='online' ? '#dcfce7' : '#f3f4f6', color: u.status==='online' ? '#16a34a' : '#6b7280' }}>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ padding:'10px 12px', color: u.pushToken ? 'var(--accent)' : 'var(--text-muted)' }}>{u.pushToken ? '✓' : '—'}</td>
                    <td style={{ padding:'10px 12px', color:'var(--text-muted)' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ padding:24, textAlign:'center', color:'var(--text-muted)' }}>Aucun utilisateur</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
