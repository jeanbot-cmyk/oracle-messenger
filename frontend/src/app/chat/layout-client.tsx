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

  useSocket(); // Initialise la connexion socket

  useEffect(() => {
    if (!token) return;
    // Charger le profil utilisateur
    api.users.me(token).then(setCurrentUser).catch(() => {});
    // Charger les conversations
    api.conversations.list(token).then(setConversations).catch(() => {});
  }, [token]);

  return (
    <div className="flex h-screen overflow-hidden bg-oracle-night">
      <Sidebar />
      <ChatWindow />
    </div>
  );
}
