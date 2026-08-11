import { useState } from 'react';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';

export function useNativeHomeUiState() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [activeTab, setActiveTab] = useState<NativeTabKey>('chats');

  return {
    loading,
    setLoading,
    busy,
    setBusy,
    notice,
    setNotice,
    conversationSearch,
    setConversationSearch,
    messageSearch,
    setMessageSearch,
    activeTab,
    setActiveTab,
  };
}
