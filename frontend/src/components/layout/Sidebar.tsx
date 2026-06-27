'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { ConversationList } from '../chat/ConversationList';
import { MenuDots } from './MenuDots';
import Image from 'next/image';
import clsx from 'clsx';

const NAV = [
  { id: 'chat',     icon: '💬', label: 'Messages' },
  { id: 'calls',    icon: '📞', label: 'Appels' },
  { id: 'business', icon: '💼', label: 'Business' },
  { id: 'notes',    icon: '📝', label: 'Notes' },
  { id: 'settings', icon: '⚙️', label: 'Paramètres' },
];

export function Sidebar() {
  const { data: session } = useSession();
  const [tab, setTab] = useState('chat');
  const [search, setSearch] = useState('');

  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full border-r border-oracle-border bg-oracle-surface/30">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-oracle-border">
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-base">Oracle Messenger</h1>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-oracle-border/30 text-oracle-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {session?.user?.image && (
            <div className="w-8 h-8 rounded-full overflow-hidden border border-oracle-border flex-shrink-0">
              <Image src={session.user.image} alt="avatar" width={32} height={32} />
            </div>
          )}
          <MenuDots />
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 bg-oracle-night/60 border border-oracle-border rounded-2xl px-3 py-2">
          <svg className="w-4 h-4 text-oracle-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="flex-1 bg-transparent text-sm text-white placeholder-oracle-muted outline-none"
          />
        </div>
      </div>

      {/* Nav tabs */}
      <div className="flex px-4 gap-1 pb-2">
        {NAV.slice(0, 3).map(n => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={clsx(
              'flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors',
              tab === n.id ? 'bg-oracle-blue text-white' : 'text-oracle-muted hover:text-white'
            )}>
            {n.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'chat' && <ConversationList />}
        {tab === 'calls' && (
          <div className="flex items-center justify-center h-full text-oracle-muted text-sm">
            Appels — Phase 2
          </div>
        )}
        {tab === 'business' && (
          <div className="flex items-center justify-center h-full text-oracle-muted text-sm">
            Hub Business — Phase 2
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-around px-4 py-3 border-t border-oracle-border">
        {NAV.map(n => (
          <button key={n.id} onClick={() => setTab(n.id)}
            className={clsx(
              'flex flex-col items-center gap-0.5 transition-colors',
              tab === n.id ? 'text-oracle-accent' : 'text-oracle-muted hover:text-white'
            )}>
            <span className="text-lg">{n.icon}</span>
            <span className="text-[9px]">{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
