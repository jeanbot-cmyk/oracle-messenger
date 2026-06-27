'use client';
import { useState } from 'react';
import { useChatStore } from '../../store/chat';
import type { Message } from '../../types';

// Limite : 3 transferts par jour (stocké localement)
function getForwardCount(): number {
  const key = `forward_${new Date().toDateString()}`;
  return parseInt(localStorage.getItem(key) ?? '0', 10);
}
function incrementForwardCount() {
  const key = `forward_${new Date().toDateString()}`;
  localStorage.setItem(key, String(getForwardCount() + 1));
}

interface Props {
  message: Message;
  onClose: () => void;
  onForward: (convIds: string[]) => void;
}

export function ForwardModal({ message, onClose, onForward }: Props) {
  const { conversations } = useChatStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const count = getForwardCount();
  const remaining = 3 - count;

  const filtered = conversations.filter(c => {
    const name = c.type === 'group' ? c.name : c.participants?.[0]?.name ?? '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 50) next.add(id);
      return next;
    });
  }

  function handleForward() {
    if (remaining <= 0) return;
    incrementForwardCount();
    onForward(Array.from(selected));
    onClose();
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-end' }}>
      <div style={{ width:'100%', background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:20, color:'var(--text-primary)' }}>×</button>
          <div style={{ flex:1 }}>
            <h3 style={{ margin:0, fontSize:17, fontWeight:700, color:'var(--text-primary)' }}>Transférer le message</h3>
            <p style={{ margin:0, fontSize:12, color: remaining > 0 ? 'var(--text-muted)' : '#ef4444' }}>
              {remaining > 0 ? `${selected.size}/50 sélectionnés · ${remaining} transfert(s) restant(s) aujourd'hui` : '⚠️ Limite journalière atteinte (3/3)'}
            </p>
          </div>
          {selected.size > 0 && remaining > 0 && (
            <button onClick={handleForward} style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, padding:'8px 16px', cursor:'pointer', fontWeight:600, fontSize:14 }}>
              Envoyer ({selected.size})
            </button>
          )}
        </div>

        {/* Message preview */}
        <div style={{ padding:'10px 20px', background:'var(--bg-elevated)', borderBottom:'1px solid var(--border)' }}>
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 4px' }}>Message à transférer :</p>
          <p style={{ fontSize:14, color:'var(--text-primary)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{message.content}</p>
        </div>

        {/* Search */}
        <div style={{ padding:'8px 16px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une conversation…"
            style={{ width:'100%', padding:'10px 14px', borderRadius:20, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text-primary)', fontSize:14, outline:'none', boxSizing:'border-box' }} />
        </div>

        {/* Liste */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {filtered.map(conv => {
            const name = conv.type === 'group' ? conv.name : conv.participants?.[0]?.name ?? 'Inconnu';
            const isSelected = selected.has(conv.id);
            return (
              <button key={conv.id} onClick={() => toggle(conv.id)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'10px 20px', border:'none', background: isSelected ? 'var(--bg-input)' : 'transparent', cursor:'pointer', textAlign:'left' }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ color:'#fff', fontWeight:700, fontSize:18 }}>{(name??'?')[0].toUpperCase()}</span>
                </div>
                <span style={{ flex:1, fontSize:15, color:'var(--text-primary)', fontWeight:500 }}>{name}</span>
                <div style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`, background: isSelected ? 'var(--accent)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {isSelected && <span style={{ color:'#fff', fontSize:12 }}>✓</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
