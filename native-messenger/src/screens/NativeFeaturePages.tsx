import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AuthSession, Conversation } from '@/types/messenger';
import type { NativeCallDiagnosticEntry } from '@/hooks/nativeCallUtils';
import { AdminPage } from './features/AdminPage';
import { BusinessPage } from './features/BusinessPage';
import { CallsPage } from './features/CallsPage';
import { ContactsPage } from './features/ContactsPage';
import { GalleryPage } from './features/GalleryPage';
import { MenuPage } from './features/MenuPage';
import { PaymentsPage } from './features/PaymentsPage';
import { ProfilePage } from './features/ProfilePage';
import { SpiritualityPage } from './features/SpiritualityPage';
import { StoriesPage } from './features/StoriesPage';
import { ToolsPage } from './features/ToolsPage';
import { WebPage } from './features/WebPage';
import { useLanguage } from '@/services/language';
import { colors } from '@/theme/colors';

export type NativeTabKey =
  | 'chats'
  | 'calls'
  | 'stories'
  | 'storyCamera'
  | 'tools'
  | 'meeting'
  | 'translate'
  | 'notes'
  | 'events'
  | 'menu'
  | 'contacts'
  | 'gallery'
  | 'web'
  | 'spirituality'
  | 'ai'
  | 'flyers'
  | 'videos'
  | 'payments'
  | 'business'
  | 'profile'
  | 'admin';

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
  onStartCallFromPeer: (peerId: string, type: 'audio' | 'video') => Promise<void>;
  onRefreshConversations: () => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenTab: (tab: NativeTabKey) => void;
  onBackToChats?: () => void;
  callDiagnostics?: NativeCallDiagnosticEntry[];
  onClearCallDiagnostics?: () => void;
  isAdmin?: boolean;
};

export function NativeFeaturePage({ tab, session, onOpenConversation, onStartCallFromPeer, onRefreshConversations, onLogout, onOpenTab, onBackToChats, callDiagnostics, onClearCallDiagnostics, isAdmin }: FeatureProps) {
  const token = session.token;
  const ownerId = session.user.id || session.user.email || token;
  const userName = session.user.name || session.user.email || 'Utilisateur';
  if (tab === 'calls') return <CallsPage token={token} ownerId={ownerId} onOpenContacts={() => onOpenTab('contacts')} onStartCallFromPeer={onStartCallFromPeer} callDiagnostics={callDiagnostics || []} onClearCallDiagnostics={onClearCallDiagnostics || (() => undefined)} isAdmin={Boolean(isAdmin)} />;
  if (tab === 'contacts') return <ContactsPage token={token} user={session.user} onOpenConversation={onOpenConversation} onRefreshConversations={onRefreshConversations} onBack={onBackToChats || (() => onOpenTab('chats'))} />;
  if (tab === 'stories') return <StoriesPage token={token} userId={session.user.id} onBack={onBackToChats || (() => onOpenTab('chats'))} />;
  if (tab === 'storyCamera') return <StoriesPage token={token} userId={session.user.id} initialMode="camera" onBack={onBackToChats || (() => onOpenTab('chats'))} />;
  if (tab === 'gallery') return <GalleryPage token={token} userId={session.user.id} />;
  if (tab === 'web') return <WebPage />;
  if (tab === 'spirituality') return <SpiritualityPage />;
  if (tab === 'tools') return <ToolsPage token={token} ownerId={ownerId} userName={userName} initialMode="directory" onOpenTab={onOpenTab} />;
  if (tab === 'meeting') return <ToolsPage token={token} ownerId={ownerId} userName={userName} initialMode="meeting" onOpenTab={onOpenTab} />;
  if (tab === 'ai') return <ToolsPage token={token} ownerId={ownerId} userName={userName} initialMode="ai" onOpenTab={onOpenTab} />;
  if (tab === 'flyers') return <ToolsPage token={token} ownerId={ownerId} userName={userName} initialMode="flyer" onOpenTab={onOpenTab} />;
  if (tab === 'videos') return <ToolsPage token={token} ownerId={ownerId} userName={userName} initialMode="video" onOpenTab={onOpenTab} />;
  if (tab === 'translate') return <ToolsPage token={token} ownerId={ownerId} userName={userName} initialMode="translate" onOpenTab={onOpenTab} />;
  if (tab === 'notes') return <ToolsPage token={token} ownerId={ownerId} userName={userName} initialMode="notes" onOpenTab={onOpenTab} />;
  if (tab === 'events') return <ToolsPage token={token} ownerId={ownerId} userName={userName} initialMode="events" onOpenTab={onOpenTab} />;
  if (tab === 'payments') return <PaymentsPage token={token} />;
  if (tab === 'business') return <BusinessPage token={token} onBack={onBackToChats || (() => onOpenTab('chats'))} onOpenAiTools={() => onOpenTab('ai')} />;
  if (tab === 'profile') return <ProfilePage session={session} onLogout={onLogout} onBack={onBackToChats || (() => onOpenTab('chats'))} />;
  if (tab === 'admin') return <AdminPage token={token} onBack={onBackToChats || (() => onOpenTab('chats'))} />;
  if (tab === 'menu') return <MenuPage isAdmin={isAdminSession(session)} onOpenTab={onOpenTab} onLogout={onLogout} />;
  return (
    <View style={styles.fallbackPage}>
      <Text style={styles.fallbackTitle}>Rubrique indisponible</Text>
      <Text style={styles.fallbackText}>Cette page n’a pas pu être chargée. Revenez aux discussions puis réessayez.</Text>
    </View>
  );
}

export function isAdminSession(session: AuthSession | null) {
  const email = session?.user?.email?.toLowerCase();
  const phone = session?.user?.phone;
  return (
    email === 'tchingankonggeorges@gmail.com' ||
    email === 'tchingangankonggeorges@gmail.com' ||
    phone === '+2250504673829' ||
    phone === '+2250700508618'
  );
}

export function useVisibleTabs(_session: AuthSession | null) {
  const { t } = useLanguage();
  return useMemo(() => [
    { key: 'chats' as const, label: t('nav.chats') },
    { key: 'calls' as const, label: t('nav.calls') },
    { key: 'stories' as const, label: t('nav.stories') },
    { key: 'tools' as const, label: t('nav.tools') },
    { key: 'menu' as const, label: t('nav.menu') },
  ], [t]);
}

const styles = StyleSheet.create({
  fallbackPage: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.background },
  fallbackTitle: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: '900', textAlign: 'center' },
  fallbackText: { color: colors.muted, fontSize: 14, lineHeight: 21, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});
