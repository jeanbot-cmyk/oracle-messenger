import { useMemo } from 'react';
import type { AuthSession, Conversation } from '@/types/messenger';
import { AdminPage } from './features/AdminPage';
import { BusinessPage } from './features/BusinessPage';
import { ContactsPage } from './features/ContactsPage';
import { GalleryPage } from './features/GalleryPage';
import { PaymentsPage } from './features/PaymentsPage';
import { ProfilePage } from './features/ProfilePage';
import { StoriesPage } from './features/StoriesPage';
import { ToolsPage } from './features/ToolsPage';

export type NativeTabKey = 'chats' | 'contacts' | 'stories' | 'gallery' | 'tools' | 'ai' | 'flyers' | 'videos' | 'payments' | 'business' | 'profile' | 'admin';

export const NATIVE_TABS: { key: NativeTabKey; label: string }[] = [
  { key: 'chats', label: 'Chats' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'stories', label: 'Stories' },
  { key: 'gallery', label: 'Galerie' },
  { key: 'tools', label: 'Outils' },
  { key: 'ai', label: 'IA' },
  { key: 'flyers', label: 'Flyers' },
  { key: 'videos', label: 'Vidéos' },
  { key: 'payments', label: 'Paiements' },
  { key: 'business', label: 'Business' },
  { key: 'profile', label: 'Profil' },
  { key: 'admin', label: 'Admin' },
];

type FeatureProps = {
  tab: NativeTabKey;
  session: AuthSession;
  onOpenConversation: (conversation: Conversation) => void;
  onRefreshConversations: () => Promise<void>;
  onLogout: () => Promise<void>;
};

export function NativeFeaturePage({ tab, session, onOpenConversation, onRefreshConversations, onLogout }: FeatureProps) {
  const token = session.token;
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
  return null;
}

export function isAdminSession(session: AuthSession | null) {
  const email = session?.user?.email?.toLowerCase();
  return email === 'tchingankonggeorges@gmail.com' || email === 'tchingangankonggeorges@gmail.com';
}

export function useVisibleTabs(session: AuthSession | null) {
  return useMemo(() => NATIVE_TABS.filter(tab => tab.key !== 'admin' || isAdminSession(session)), [session]);
}
