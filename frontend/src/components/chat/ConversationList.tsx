'use client';
import { useChatStore } from '../../store/chat';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import clsx from 'clsx';
import Image from 'next/image';

export function ConversationList() {
  const { conversations, activeConvId, setActiveConv, onlineUsers } = useChatStore();

  return (
    <div className="flex flex-col h-full">
      {conversations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-oracle-muted gap-3 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-oracle-surface flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-sm">Aucune conversation.<br />Commencez à discuter !</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {conversations.map(conv => {
            const other = conv.participants?.[0];
            const isOnline = other && onlineUsers.has(other.id);
            const isActive = conv.id === activeConvId;
            const name = conv.type === 'group' ? conv.name : other?.name ?? 'Inconnu';
            const avatar = conv.type === 'group' ? conv.avatar : other?.avatar;
            const lastMsg = conv.lastMessage;

            return (
              <li key={conv.id}>
                <button
                  onClick={() => setActiveConv(conv.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left',
                    isActive ? 'bg-oracle-surface' : 'hover:bg-oracle-surface/50'
                  )}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-oracle-blue/20 flex items-center justify-center overflow-hidden">
                      {avatar ? (
                        <Image src={avatar} alt={name ?? ''} width={48} height={48} className="object-cover" />
                      ) : (
                        <span className="text-lg font-semibold text-oracle-accent">
                          {(name ?? '?')[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-oracle-night" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-white truncate">{name}</span>
                      {lastMsg && (
                        <span className="text-[10px] text-oracle-muted flex-shrink-0 ml-2">
                          {formatDistanceToNow(new Date(lastMsg.createdAt), { locale: fr, addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-oracle-muted truncate">
                        {lastMsg?.isDeleted ? (
                          <span className="italic">Message supprimé</span>
                        ) : (
                          lastMsg?.content ?? 'Démarrer la conversation'
                        )}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 flex-shrink-0 w-5 h-5 bg-oracle-accent rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
