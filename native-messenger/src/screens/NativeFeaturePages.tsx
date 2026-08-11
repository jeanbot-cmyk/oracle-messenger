import { useMemo } from 'react';
import type { AuthSession, Conversation } from '@/types/messenger';
import { AdminPage } from './features/AdminPage';
import { BusinessPage } from './features/BusinessPage';
import { CallsPage } from './features/CallsPage';
import { ContactsPage } from './features/ContactsPage';
import { GalleryPage } from './features/GalleryPage';
import { MenuPage } from './features/MenuPage';
import { PaymentsPage } from './features/PaymentsPage';
import { ProfilePage } from './features/ProfilePage';
import { StoriesPage } from './features/StoriesPage';
import { ToolsPage } from './features/ToolsPage';

export type NativeTabKey = 'chats' | 'calls' | 'stories' | 'tools' | 'menu' | 'contacts' | 'gallery' | 'ai' | 'flyers' | 'videos' | 'payments' | 'business' | 'profile' | 'admin';

export const NATIVE_TABS: { key: NativeTabKey; label: string }[] = [
  { key: 'chats', label: 'Discussions' },
  { key: 'calls', label: 'Appels' },
  { key: 'stories', label: 'Actus' },
  { key: 'tools', label: 'Outils' },
  { key: 'menu', label: 'Menu' },
];

type FeatureProps = {
  tab: NativeTabKey;
  session: AuthSession;
  onOpenConversation: (conversation: Conversation) => void;
  onRefreshConversations: () => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenTab: (tab: NativeTabKey) => void;
};

export function NativeFeaturePage({ tab, session, onOpenConversation, onRefreshConversations, onLogout, onOpenTab }: FeatureProps) {
  const token = session.token;
  if (tab === 'calls') return <CallsPage token={token} onOpenContacts={() => onOpenTab('contacts')} />;
  if (tab === 'contacts') return <ContactsPage token={token} onOpenConversation={onOpenConversation} onRefreshConversations={onRefreshConversations} />;
  if (tab === 'stories') return <StoriesPage token={token} userId={session.user.id} />;
  if (tab === 'gallery') return <GalleryPage token={token} userId={session.user.id} />;
  if (tab === 'tools') return <ToolsPage token={token} ownerId={session.user.id || session.user.email || token} userName={session.user.name || session.user.email || 'Utilisateur'} />;
  if (tab === 'ai') return <ToolsPage token={token} ownerId={session.user.id || session.user.email || token} userName={session.user.name || session.user.email || 'Utilisateur'} initialMode="ai" />;
  if (tab === 'flyers') return <ToolsPage token={token} ownerId={session.user.id || session.user.email || token} userName={session.user.name || session.user.email || 'Utilisateur'} initialMode="flyer" />;
  if (tab === 'videos') return <ToolsPage token={token} ownerId={session.user.id || session.user.email || token} userName={session.user.name || session.user.email || 'Utilisateur'} initialMode="video" />;
  if (tab === 'payments') return <PaymentsPage token={token} />;
  if (tab === 'business') return <BusinessPage token={token} />;
  if (tab === 'profile') return <ProfilePage session={session} onLogout={onLogout} />;
  if (tab === 'admin') return <AdminPage token={token} />;
  if (tab === 'menu') return <MenuPage isAdmin={isAdminSession(session)} onOpenTab={onOpenTab} onLogout={onLogout} />;
  return null;
}

export function isAdminSession(session: AuthSession | null) {
  const email = session?.user?.email?.toLowerCase();
  return email === 'tchingankonggeorges@gmail.com' || email === 'tchingangankonggeorges@gmail.com';
}

export function useVisibleTabs(_session: AuthSession | null) {
  return useMemo(() => NATIVE_TABS, []);
}
