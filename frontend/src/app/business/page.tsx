'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type Tag = 'client_chaud' | 'client_froid' | 'paye' | 'a_relancer';
const TAG_LABELS: Record<Tag, string> = {
  client_chaud: '🔥 Client chaud',
  client_froid: '❄️ Client froid',
  paye:         '✅ Payé',
  a_relancer:   '🔔 À relancer',
};
const TAG_COLORS: Record<Tag, string> = {
  client_chaud: '#ef4444',
  client_froid: '#3b82f6',
  paye:         '#22c55e',
  a_relancer:   '#f59e0b',
};

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  tags: Tag[];
  notes: string;
  lastContact?: string;
  nextReminder?: string;
}

const DB_KEY = 'oracle-crm-contacts';
function loadContacts(): Contact[] {
  try { return JSON.parse(localStorage.getItem(DB_KEY) ?? '[]'); } catch { return []; }
}
function saveContacts(c: Contact[]) {
  localStorage.setItem(DB_KEY, JSON.stringify(c));
}

export default function BusinessPage() {
  const { status } = useSession();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<Tag | null>(null);
  const [tab, setTab] = useState<'crm' | 'catalogue' | 'auto'>('crm');
  const [mounted, setMounted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>({});

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') router.replace('/login');
    setContacts(loadContacts());
  }, [status]);

  function saveAndUpdate(updated: Contact[]) {
    setContacts(updated);
    saveContacts(updated);
  }

  function addContact() {
    if (!form.name) return;
    const c: Contact = {
      id: `c_${Date.now()}`,
      name: form.name,
      phone: form.phone,
      email: form.email,
      tags: form.tags ?? [],
      notes: form.notes ?? '',
      lastContact: new Date().toISOString().slice(0,10),
    };
    saveAndUpdate([c, ...contacts]);
    setForm({});
    setShowForm(false);
  }

  function updateContact(id: string, patch: Partial<Contact>) {
    const updated = contacts.map(c => c.id === id ? { ...c, ...patch } : c);
    saveAndUpdate(updated);
    if (selected?.id === id) setSelected({ ...selected, ...patch });
  }

  function deleteContact(id: string) {
    saveAndUpdate(contacts.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  const filtered = contacts.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search);
    const matchTag = !filterTag || c.tags.includes(filterTag);
    return matchSearch && matchTag;
  });

  const btnTab = (id: string) => ({
    padding:'8px 16px', borderRadius:20, border:'none',
    background: tab === id ? 'var(--accent)' : 'var(--bg-input)',
    color: tab === id ? '#fff' : 'var(--text-secondary)',
    cursor:'pointer', fontSize:14, fontWeight:500,
  } as React.CSSProperties);

  if (!mounted) return null;

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg-app)' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', background:'var(--bg-surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => router.push('/chat')} style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:20, color:'var(--text-primary)' }}>←</button>
        <h1 style={{ flex:1, fontSize:20, fontWeight:700, color:'var(--text-primary)', margin:0 }}>💼 Business Hub</h1>
        <div style={{ display:'flex', gap:6 }}>
          <button style={btnTab('crm')} onClick={() => setTab('crm')}>CRM</button>
          <button style={btnTab('catalogue')} onClick={() => setTab('catalogue')}>Catalogue</button>
          <button style={btnTab('auto')} onClick={() => setTab('auto')}>Auto</button>
        </div>
      </div>

      {/* CRM */}
      {tab === 'crm' && (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {/* Liste */}
          <div style={{ width:320, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--bg-surface)' }}>
            <div style={{ padding:'8px 12px', display:'flex', gap:8 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                style={{ flex:1, padding:'8px 12px', borderRadius:20, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:13, outline:'none' }} />
              <button onClick={() => { setShowForm(true); setForm({}); }}
                style={{ width:36, height:36, borderRadius:'50%', background:'var(--accent)', border:'none', cursor:'pointer', color:'#fff', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            </div>
            {/* Filtres tags */}
            <div style={{ padding:'4px 12px 8px', display:'flex', gap:4, flexWrap:'wrap' }}>
              {(Object.keys(TAG_LABELS) as Tag[]).map(tag => (
                <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  style={{ padding:'3px 10px', borderRadius:20, border:'none', background: filterTag === tag ? TAG_COLORS[tag] : 'var(--bg-input)', color: filterTag === tag ? '#fff' : 'var(--text-secondary)', fontSize:11, cursor:'pointer' }}>
                  {TAG_LABELS[tag]}
                </button>
              ))}
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {filtered.map(c => (
                <button key={c.id} onClick={() => setSelected(c)}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 16px', border:'none', background: selected?.id === c.id ? 'var(--bg-input)' : 'transparent', cursor:'pointer', textAlign:'left' }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, flexShrink:0 }}>
                    {c.name[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontWeight:600, fontSize:14, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</p>
                    <div style={{ display:'flex', gap:4, marginTop:2, flexWrap:'wrap' }}>
                      {c.tags.map(tag => (
                        <span key={tag} style={{ fontSize:10, padding:'1px 6px', borderRadius:10, background: TAG_COLORS[tag]+'22', color: TAG_COLORS[tag], fontWeight:600 }}>{TAG_LABELS[tag]}</span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:14 }}>
                  {contacts.length === 0 ? 'Aucun contact. Ajoutez-en un !' : 'Aucun résultat'}
                </div>
              )}
            </div>
          </div>

          {/* Détail */}
          <div style={{ flex:1, overflow:'auto', padding:24 }}>
            {selected ? (
              <div style={{ maxWidth:500 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
                  <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:28 }}>
                    {selected.name[0].toUpperCase()}
                  </div>
                  <div>
                    <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:'var(--text-primary)' }}>{selected.name}</h2>
                    {selected.phone && <p style={{ margin:0, color:'var(--text-muted)', fontSize:14 }}>{selected.phone}</p>}
                  </div>
                  <button onClick={() => deleteContact(selected.id)} style={{ marginLeft:'auto', border:'none', background:'#fef2f2', color:'#ef4444', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:13 }}>Supprimer</button>
                </div>

                {/* Tags */}
                <div style={{ marginBottom:16 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', margin:'0 0 8px' }}>Tags</p>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {(Object.keys(TAG_LABELS) as Tag[]).map(tag => {
                      const active = selected.tags.includes(tag);
                      return (
                        <button key={tag} onClick={() => {
                          const tags = active ? selected.tags.filter(t => t !== tag) : [...selected.tags, tag];
                          updateContact(selected.id, { tags });
                        }} style={{ padding:'5px 12px', borderRadius:20, border:'none', background: active ? TAG_COLORS[tag] : 'var(--bg-input)', color: active ? '#fff' : 'var(--text-secondary)', cursor:'pointer', fontSize:12, fontWeight:500 }}>
                          {TAG_LABELS[tag]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div style={{ marginBottom:16 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', margin:'0 0 8px' }}>Notes</p>
                  <textarea value={selected.notes} onChange={e => updateContact(selected.id, { notes: e.target.value })} rows={4}
                    placeholder="Notes sur ce client…"
                    style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none', resize:'vertical', boxSizing:'border-box' }} />
                </div>

                {/* Rappel */}
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', margin:'0 0 8px' }}>🔔 Rappel</p>
                  <input type="date" value={selected.nextReminder ?? ''} onChange={e => updateContact(selected.id, { nextReminder: e.target.value })}
                    style={{ padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none' }} />
                </div>
              </div>
            ) : (
              <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', flexDirection:'column', gap:12 }}>
                <span style={{ fontSize:48 }}>💼</span>
                <p>Sélectionnez un contact</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Catalogue */}
      {tab === 'catalogue' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--text-muted)' }}>
          <span style={{ fontSize:48 }}>🛍️</span>
          <p style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)' }}>Catalogue produits</p>
          <p style={{ fontSize:14 }}>Ajoutez vos produits et services — Phase 2</p>
        </div>
      )}

      {/* Automatisation */}
      {tab === 'auto' && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--text-muted)' }}>
          <span style={{ fontSize:48 }}>🤖</span>
          <p style={{ fontSize:16, fontWeight:600, color:'var(--text-primary)' }}>Automatisation</p>
          <p style={{ fontSize:14 }}>Réponses automatiques, messages programmés — Phase 2</p>
        </div>
      )}

      {/* Modal ajout contact */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-end' }}>
          <div style={{ width:'100%', background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:24 }}>
            <h3 style={{ margin:'0 0 16px', color:'var(--text-primary)' }}>Nouveau contact</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[['Nom *','name','text'],['Téléphone','phone','tel'],['Email','email','email']].map(([label,key,type]) => (
                <input key={key} type={type} placeholder={label}
                  value={(form as any)[key] ?? ''}
                  onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
                  style={{ padding:'12px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none' }} />
              ))}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowForm(false)} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', color:'var(--text-primary)' }}>Annuler</button>
                <button onClick={addContact} disabled={!form.name} style={{ flex:1, padding:12, borderRadius:10, border:'none', background:'var(--accent)', color:'#fff', cursor:'pointer', fontWeight:600, opacity:form.name?1:.5 }}>Ajouter</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
