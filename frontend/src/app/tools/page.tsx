'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Note { id: string; title: string; body: string; updatedAt: number; }
interface CalEvent { id: string; title: string; date: string; note: string; notified: boolean; }

function loadNotes(): Note[] { try { return JSON.parse(localStorage.getItem('oracle-notes') ?? '[]'); } catch { return []; } }
function saveNotes(n: Note[]) { localStorage.setItem('oracle-notes', JSON.stringify(n)); }
function loadEvents(): CalEvent[] { try { return JSON.parse(localStorage.getItem('oracle-events') ?? '[]'); } catch { return []; } }
function saveEvents(e: CalEvent[]) { localStorage.setItem('oracle-events', JSON.stringify(e)); }

export default function ToolsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get('tab') as 'meeting'|'notes'|'events') ?? 'meeting';
  const [tab, setTab] = useState<'meeting'|'notes'|'events'>(initialTab);

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login'); }, [status]);
  if (status === 'loading') return <Spinner />;

  const userName = session?.user?.name ?? 'Utilisateur';

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f0f2f5' }}>
      {/* Header */}
      <div style={{ background: '#00a884', padding: '14px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 4 }}>
            <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>Outils</h1>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['meeting','notes','events'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? '#fff' : 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: tab === t ? 700 : 400, padding: '8px 4px', borderBottom: tab === t ? '2px solid #fff' : '2px solid transparent' }}>
              {t === 'meeting' ? '🎥 Réunion' : t === 'notes' ? '📝 Notes' : '📅 Rappels'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'meeting' && <MeetingTab userName={userName} />}
        {tab === 'notes'   && <NotesTab />}
        {tab === 'events'  && <EventsTab />}
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

  function startMeeting() {
    const name = room.trim() || `oracle-${Math.random().toString(36).slice(2, 8)}`;
    setRoomName(name); setActive(true);
    window.open(`https://meet.jit.si/${name}#userInfo.displayName="${encodeURIComponent(userName)}"`, '_blank', 'noopener');
  }
  function joinMeeting() {
    const t = joinLink.trim(); if (!t) return;
    const r = t.includes('meet.jit.si/') ? t.split('meet.jit.si/')[1] : t;
    window.open(`https://meet.jit.si/${r}#userInfo.displayName="${encodeURIComponent(userName)}"`, '_blank', 'noopener');
  }
  const shareLink = `https://meet.jit.si/${roomName}`;

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#00a884', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Nouvelle réunion</p>
        <input value={room} onChange={e => setRoom(e.target.value)} placeholder="Nom de la salle (optionnel)"
          style={{ width: '100%', border: '1px solid #e9edef', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
        <button onClick={startMeeting} style={{ width: '100%', background: '#00a884', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          🎥 Démarrer la réunion
        </button>
      </div>

      {active && (
        <div style={{ background: '#e8f5e9', borderRadius: 16, padding: 16, border: '1px solid #c8e6c9' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#2e7d32', margin: '0 0 6px' }}>✅ Réunion : <strong>{roomName}</strong></p>
          <div style={{ background: '#fff', borderRadius: 10, padding: '8px 12px', marginBottom: 10, wordBreak: 'break-all', fontSize: 13, color: '#00a884' }}>{shareLink}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => navigator.clipboard?.writeText(shareLink).then(() => alert('Lien copié !'))}
              style={{ flex: 1, background: '#f0f2f5', border: 'none', borderRadius: 10, padding: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📋 Copier</button>
            <button onClick={() => navigator.share?.({ title: 'Rejoins ma réunion', url: shareLink }).catch(() => {})}
              style={{ flex: 1, background: '#00a884', border: 'none', borderRadius: 10, padding: 10, cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600 }}>📤 Partager</button>
          </div>
          <button onClick={() => { setActive(false); setRoom(''); setRoomName(''); }}
            style={{ width: '100%', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 10, cursor: 'pointer', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            ✖ Terminer
          </button>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#00a884', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rejoindre une réunion</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={joinLink} onChange={e => setJoinLink(e.target.value)} placeholder="Lien ou nom de salle"
            style={{ flex: 1, border: '1px solid #e9edef', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none' }} />
          <button onClick={joinMeeting} style={{ background: '#00a884', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            Rejoindre
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Notes ── */
function NotesTab() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); setNotes(loadNotes()); }, []);
  if (!mounted) return null;

  function openNew() { setEditing({ id: '', title: '', body: '', updatedAt: 0 }); setTitle(''); setBody(''); }
  function openEdit(n: Note) { setEditing(n); setTitle(n.title); setBody(n.body); }
  function saveNote() {
    if (!title.trim() && !body.trim()) { setEditing(null); return; }
    const updated = editing!.id
      ? notes.map(n => n.id === editing!.id ? { ...n, title, body, updatedAt: Date.now() } : n)
      : [{ id: Date.now().toString(), title, body, updatedAt: Date.now() }, ...notes];
    setNotes(updated); saveNotes(updated); setEditing(null);
  }
  function deleteNote(id: string) {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated); saveNotes(updated);
  }

  if (editing !== null) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#8696a0' }}>←</button>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de la note"
            style={{ flex: 1, border: 'none', borderBottom: '2px solid #00a884', padding: '6px 0', fontSize: 17, fontWeight: 700, outline: 'none', background: 'transparent' }} />
          <button onClick={saveNote} style={{ background: '#00a884', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontWeight: 700 }}>
            Sauver
          </button>
        </div>
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Écrivez votre note ici…"
          style={{ flex: 1, border: '1px solid #e9edef', borderRadius: 12, padding: 14, fontSize: 15, outline: 'none', resize: 'none', minHeight: 300, lineHeight: 1.6 }} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <button onClick={openNew}
        style={{ width: '100%', background: '#00a884', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
        + Nouvelle note
      </button>
      {notes.length === 0 && (
        <div style={{ textAlign: 'center', color: '#8696a0', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
          <p>Aucune note pour l'instant</p>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notes.map(n => (
          <div key={n.id} style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openEdit(n)}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#111b21', margin: '0 0 4px' }}>{n.title || '(sans titre)'}</p>
              <p style={{ fontSize: 13, color: '#8696a0', margin: '0 0 4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{n.body}</p>
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
// Planifie un rappel via le Service Worker à l'heure exacte de l'événement
async function scheduleReminder(ev: CalEvent) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) return;
    // Notifier à 9h le jour J (ou à l'heure si date+heure précisée)
    const evDate = new Date(ev.date);
    evDate.setHours(9, 0, 0, 0);
    const timestamp = evDate.getTime();
    if (timestamp <= Date.now()) return;
    reg.active.postMessage({
      type: 'schedule-reminder',
      id: ev.id,
      title: ev.title,
      date: evDate.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' }),
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

function EventsTab() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const evts = loadEvents();
    setEvents(evts);
    // Demander permission si pas encore accordée
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    // Replanifier tous les rappels futurs via SW (résiste aux rechargements)
    if (Notification.permission === 'granted') {
      evts.filter(ev => new Date(ev.date).getTime() > Date.now()).forEach(scheduleReminder);
    }
  }, []);

  if (!mounted) return null;

  function addEvent() {
    if (!title.trim() || !date) return;
    const ev: CalEvent = { id: Date.now().toString(), title: title.trim(), date, note, notified: false };
    const updated = [ev, ...events];
    setEvents(updated); saveEvents(updated);
    setTitle(''); setDate(''); setNote('');
    // Planifier le rappel via SW à l'heure exacte
    if (Notification.permission === 'granted') scheduleReminder(ev);
    else Notification.requestPermission().then(p => { if (p === 'granted') scheduleReminder(ev); });
  }
  function deleteEvent(id: string) {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated); saveEvents(updated);
    cancelReminder(id); // Annuler le rappel SW
  }

  const today = new Date().toISOString().split('T')[0];
  const upcoming = events.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Add form */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#00a884', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ajouter un rappel</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre de l'événement"
          style={{ width: '100%', border: '1px solid #e9edef', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
        <input type="date" value={date} onChange={e => setDate(e.target.value)} min={today}
          style={{ width: '100%', border: '1px solid #e9edef', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optionnel)"
          style={{ width: '100%', border: '1px solid #e9edef', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
        <button onClick={addEvent} disabled={!title.trim() || !date}
          style={{ width: '100%', background: '#00a884', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: (!title.trim() || !date) ? 0.5 : 1 }}>
          + Ajouter le rappel
        </button>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#00a884', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>À venir</p>
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
          <p style={{ fontSize: 12, fontWeight: 700, color: '#8696a0', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Passés</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map(ev => (
              <EventCard key={ev.id} ev={ev} onDelete={deleteEvent} past />
            ))}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div style={{ textAlign: 'center', color: '#8696a0', marginTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <p>Aucun rappel pour l'instant</p>
        </div>
      )}
    </div>
  );
}

function EventCard({ ev, onDelete, past }: { ev: CalEvent; onDelete: (id: string) => void; past?: boolean }) {
  const d = new Date(ev.date + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const badge = diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : diff > 0 ? `Dans ${diff} j` : `Il y a ${-diff} j`;
  const badgeColor = diff <= 2 && diff >= 0 ? '#dc2626' : diff > 2 ? '#00a884' : '#8696a0';

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'flex-start', gap: 10, opacity: past ? 0.6 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#111b21', margin: 0 }}>{ev.title}</p>
          <span style={{ fontSize: 11, fontWeight: 700, color: badgeColor, background: `${badgeColor}18`, borderRadius: 6, padding: '2px 6px' }}>{badge}</span>
        </div>
        <p style={{ fontSize: 13, color: '#8696a0', margin: '0 0 2px' }}>{d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        {ev.note && <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{ev.note}</p>}
      </div>
      <button onClick={() => onDelete(ev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 18, padding: 4 }}>🗑</button>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e9edef', borderTopColor: '#00a884', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
