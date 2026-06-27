'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { ConversationList } from '../chat/ConversationList';
import { MenuDots } from './MenuDots';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import Image from 'next/image';

const S = {
  root:    { width:360, flexShrink:0, display:'flex', flexDirection:'column' as const, height:'100vh', borderRight:'1px solid var(--border)', background:'var(--bg-surface)' },
  header:  { padding:'12px 16px', display:'flex', alignItems:'center', gap:12, background:'var(--header-bg)', borderBottom:'1px solid var(--border)' },
  title:   { flex:1, fontWeight:700, fontSize:20, color:'var(--text-primary)' },
  iconBtn: { width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)' },
  searchWrap: { padding:'8px 12px', background:'var(--bg-surface)' },
  searchBox:  { display:'flex', alignItems:'center', gap:8, background:'var(--bg-input)', borderRadius:24, padding:'8px 14px' },
  searchInput:{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:14, color:'var(--text-primary)' },
  tabs:    { display:'flex', padding:'4px 12px 8px', gap:6, background:'var(--bg-surface)' },
  tab:     (active:boolean) => ({ flex:1, padding:'6px 0', borderRadius:20, border: active ? 'none' : '1px solid var(--border)', background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)', fontSize:13, fontWeight:500, cursor:'pointer' }),
};

interface SidebarProps {
  onStartCall?: (conversationId: string, targetUserIds: string[], type: 'audio' | 'video') => void;
}

export function Sidebar({ onStartCall }: SidebarProps) {
  const { data: session } = useSession();
  const { lang } = useSettings();
  const [tab, setTab] = useState('chat');
  const [search, setSearch] = useState('');

  const tabs = [
    { id:'chat',     label: t(lang,'chat.messages') },
    { id:'calls',    label: t(lang,'chat.calls') },
    { id:'business', label: t(lang,'chat.business') },
  ];

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        {session?.user?.image ? (
          <div style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden', flexShrink:0 }}>
            <Image src={session.user.image} alt="avatar" width={36} height={36} />
          </div>
        ) : (
          <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:16 }}>
            {session?.user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
        )}
        <span style={S.title}>{t(lang,'app.name')}</span>
        <button style={S.iconBtn}>
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <MenuDots />
      </div>

      {/* Search */}
      <div style={S.searchWrap}>
        <div style={S.searchBox}>
          <svg width="16" height="16" fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t(lang,'chat.search')} style={S.searchInput} />
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {tabs.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)} style={S.tab(tab === n.id)}>{n.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:'hidden' }}>
        {tab === 'chat' && <ConversationList search={search} />}
        {tab === 'calls' && <Empty label="Appels — Phase 2" />}
        {tab === 'business' && <Empty label="Hub Business — Phase 2" />}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:14 }}>{label}</div>;
}
