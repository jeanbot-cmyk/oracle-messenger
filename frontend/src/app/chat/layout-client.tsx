'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Sidebar } from '../../components/layout/Sidebar';
import { ChatWindow } from '../../components/chat/ChatWindow';
import { useChatStore } from '../../store/chat';
import { useSocket } from '../../hooks/useSocket';
import { api } from '../../lib/api';

export function ChatLayout() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken ?? '';
  const { setConversations, setCurrentUser } = useChatStore();
  useSocket();

  useEffect(() => {
    if (!token) return;
    api.users.me(token).then(setCurrentUser).catch(() => {});
    api.conversations.list(token).then(setConversations).catch(() => {});
  }, [token]);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg-app)' }}>
      <Sidebar />
      <ChatWindow />
    </div>
  );
}
