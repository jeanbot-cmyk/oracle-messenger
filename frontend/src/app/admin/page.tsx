'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getSocket } from '../../lib/socket';

const ADMIN_EMAIL = 'tchingankonggeorges@gmail.com';

interface Stats { totalUsers:number; onlineUsers:number; pwaInstalls:number; totalMessages:number; totalConversations:number; }
interface Metrics { cpu:number; ramPct:number; ramUsed:number; ramTotal:number; uptime:number; }

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [notif, setNotif] = useState({ title:'', body:'' });
  const [broadcast, setBroadcast] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [mounted, setMounted] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [liveOnline, setLiveOnline] = useState<number | null>(null);

  const token = session?.user?.backendToken;
  const api = process.env.NEXT_PUBLIC_BACKEND_URL;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated' && session.user.email !== ADMIN_EMAIL) { router.replace('/chat'); return; }
    if (status === 'authenticated' && token) {
      loadData();
      const interval = setInterval(loadData, 30_000);
      // WebSocket: listen for real-time online count updates
      const socket = getSocket(token);
      if (socket) {
        socket.on('admin_metrics_update', (d: { connectesEnTempsReel: number }) => {
          setLiveOnline(d.connectesEnTempsReel);
        });
      }
      return () => {
        clearInterval(interval);
        socket?.off('admin_metrics_update');
      };
    }
  }, [status, token]);

  async function loadData() {
    try {
      const [s, m, u] = await Promise.all([
        fetch(`${api}/admin/stats`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json()),
        fetch(`${api}/admin/metrics`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json()),
        fetch(`${api}/admin/users`, { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.json()),
      ]);
      setStats(s); setMetrics(m); setUsers(Array.isArray(u) ? u : []);
      setLastRefresh(new Date());
    } catch {}
  }

  async function sendBroadcast() {
    if (!broadcast.trim()) return;
    setBroadcasting(true);
    try {
      const r = await fetch(`${api}/admin/broadcast`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: broadcast }),
      });
      const d = await r.json();
      setBroadcastMsg(d.success ? `✓ Envoyé à ${d.sent} utilisateurs` : 'Erreur');
      setBroadcast('');
    } catch { setBroadcastMsg('Erreur réseau'); }
    setBroadcasting(false);
    setTimeout(() => setBroadcastMsg(''), 5000);
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

  if (!mounted || status === 'loading') return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-app)' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const card = (title: string, value: string|number, icon: string, color = 'var(--accent)') => (
    <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:20, display:'flex', alignItems:'center', gap:16, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
      <div style={{ width:48, height:48, borderRadius:12, background:color+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>{icon}</div>
      <div>
        <div style={{ fontSize:24, fontWeight:700, color:'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize:13, color:'var(--text-muted)' }}>{title}</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-app)', padding:24 }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:32 }}>
          <div>
            <h1 style={{ fontSize:24, fontWeight:700, color:'var(--text-primary)', margin:0 }}>Panel Admin</h1>
            <p style={{ color:'var(--text-muted)', fontSize:14, margin:'4px 0 0' }}>
              Oracle Messenger
              {lastRefresh && (
                <span style={{ marginLeft:10, fontSize:12, color:'var(--accent)' }}>
                  ↻ {lastRefresh.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                </span>
              )}
            </p>
          </div>
          <button onClick={() => router.push('/chat')} style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 16px', cursor:'pointer', color:'var(--text-primary)', fontSize:14 }}>
            ← Retour au chat
          </button>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:24 }}>
          {card('Utilisateurs', stats?.totalUsers ?? '…', '👥')}
          {card('En ligne maintenant', liveOnline ?? stats?.onlineUsers ?? '…', '🟢', '#22c55e')}
          {card('Installations PWA', stats?.pwaInstalls ?? '…', '📲', '#8b5cf6')}
          {card('Messages', stats?.totalMessages ?? '…', '💬', '#3b82f6')}
          {card('CPU', metrics ? `${metrics.cpu}%` : '…', '⚡', '#f59e0b')}
          {card('RAM', metrics ? `${metrics.ramPct}%` : '…', '🧠', '#ef4444')}
        </div>

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
              style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, padding:'12px 24px', fontSize:15, fontWeight:600, cursor:'pointer', opacity: sending||!notif.title||!notif.body ? .6 : 1 }}>
              {sending ? 'Envoi…' : '📤 Envoyer à tous'}
            </button>
            {msg && <p style={{ color:'var(--accent)', fontSize:14, margin:0 }}>{msg}</p>}
          </div>
        </div>

        {/* Canal de diffusion vente */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, marginBottom:24, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
          <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text-primary)', margin:'0 0 6px' }}>📢 Canal de diffusion</h2>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 16px' }}>
            Le message arrive directement dans la discussion de chaque utilisateur, comme un message privé.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <textarea value={broadcast} onChange={e => setBroadcast(e.target.value)}
              placeholder="Rédigez votre message de vente ou d'annonce…" rows={4}
              style={{ padding:'12px 16px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none', resize:'vertical' }} />
            <button onClick={sendBroadcast} disabled={broadcasting || !broadcast.trim()}
              style={{ background:'#128C7E', color:'#fff', border:'none', borderRadius:10, padding:'12px 24px', fontSize:15, fontWeight:600, cursor:'pointer', opacity: broadcasting || !broadcast.trim() ? .6 : 1 }}>
              {broadcasting ? 'Envoi en cours…' : '📤 Diffuser à tous les utilisateurs'}
            </button>
            {broadcastMsg && <p style={{ color:'var(--accent)', fontSize:14, margin:0 }}>{broadcastMsg}</p>}
          </div>
        </div>

        {/* Users table */}
        <div style={{ background:'var(--bg-surface)', borderRadius:16, padding:24, boxShadow:'0 1px 4px rgba(0,0,0,.08)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h2 style={{ fontSize:18, fontWeight:600, color:'var(--text-primary)', margin:0 }}>👤 Utilisateurs récents</h2>
            <button onClick={loadData} style={{ background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', cursor:'pointer', color:'var(--text-primary)', fontSize:13 }}>↻ Actualiser</button>
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
