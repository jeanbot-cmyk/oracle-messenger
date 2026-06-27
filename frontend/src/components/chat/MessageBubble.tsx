'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import clsx from 'clsx';
import type { Message } from '../../types';
import { useChatStore } from '../../store/chat';

interface Props {
  message: Message;
  isOwn: boolean;
  onReply: (msg: Message) => void;
  onDelete: (id: string) => void;
  onEdit: (msg: Message) => void;
}

function StatusIcon({ status }: { status: Message['status'] }) {
  if (status === 'sending') return <span className="text-[10px] text-white/40">⏳</span>;
  if (status === 'sent')     return <span className="text-[10px] text-white/50">✓</span>;
  if (status === 'delivered') return <span className="text-[10px] text-white/60">✓✓</span>;
  if (status === 'read')     return <span className="text-[10px] text-oracle-accent">✓✓</span>;
  return null;
}

export function MessageBubble({ message, isOwn, onReply, onDelete, onEdit }: Props) {
  const [showMenu, setShowMenu] = useState(false);

  if (message.isDeleted) {
    return (
      <div className={clsx('flex', isOwn ? 'justify-end' : 'justify-start')}>
        <div className="px-4 py-2 rounded-2xl bg-oracle-surface/50 border border-oracle-border">
          <p className="text-xs text-oracle-muted italic">Ce message a été supprimé</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx('flex group', isOwn ? 'justify-end' : 'justify-start')}
      onContextMenu={e => { e.preventDefault(); setShowMenu(true); }}
    >
      <div className="relative max-w-[75%]">
        {/* Reply preview */}
        {message.replyTo && (
          <div className={clsx(
            'mb-1 px-3 py-1.5 rounded-xl border-l-2 border-oracle-accent bg-oracle-surface/60 text-xs text-oracle-muted',
            isOwn ? 'ml-auto' : ''
          )}>
            <p className="font-medium text-oracle-accent text-[10px] mb-0.5">{message.replyTo.sender?.name}</p>
            <p className="truncate">{message.replyTo.content}</p>
          </div>
        )}

        {/* Bubble */}
        <div className={clsx(
          'px-4 py-2.5 relative',
          isOwn ? 'bubble-out text-white' : 'bubble-in text-oracle-text'
        )}>
          {message.type === 'text' && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
          )}

          {/* Time + status */}
          <div className={clsx('flex items-center gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
            <span className="text-[10px] opacity-60">
              {format(new Date(message.createdAt), 'HH:mm')}
            </span>
            {message.isEdited && <span className="text-[10px] opacity-50">modifié</span>}
            {isOwn && <StatusIcon status={message.status} />}
          </div>
        </div>

        {/* Context menu */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className={clsx(
              'absolute z-50 bg-oracle-surface border border-oracle-border rounded-2xl shadow-2xl py-1 min-w-[160px]',
              isOwn ? 'right-0' : 'left-0', 'bottom-full mb-1'
            )}>
              {[
                { label: 'Répondre', icon: '↩️', action: () => { onReply(message); setShowMenu(false); } },
                ...(isOwn ? [
                  { label: 'Modifier', icon: '✏️', action: () => { onEdit(message); setShowMenu(false); } },
                  { label: 'Supprimer', icon: '🗑️', action: () => { onDelete(message.id); setShowMenu(false); } },
                ] : []),
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-oracle-text hover:bg-oracle-border/30 transition-colors">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
