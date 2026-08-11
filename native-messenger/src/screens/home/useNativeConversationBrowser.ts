import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { api } from '@/services/api';
import type { Conversation } from '@/types/messenger';

type UseNativeConversationBrowserParams = {
  activeTab: NativeTabKey;
  conversationSearch: string;
  selected: Conversation | null;
  token?: string;
  setBusy: (busy: boolean) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setNotice: (message: string) => void;
};

export function useNativeConversationBrowser({
  activeTab,
  conversationSearch,
  selected,
  token,
  setBusy,
  setConversations,
  setNotice,
}: UseNativeConversationBrowserParams) {
  const conversationSearchRequestRef = useRef(0);

  const refreshConversations = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    setBusy(true);
    try {
      const query = conversationSearch.trim();
      const items = query ? await api.searchConversations(query, activeToken) : await api.conversations(activeToken);
      setConversations(items);
      setNotice(items.length ? '' : query ? 'Aucune conversation trouvée.' : 'Aucune conversation pour ce compte.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Chargement conversations impossible.');
    } finally {
      setBusy(false);
    }
  }, [conversationSearch, setBusy, setConversations, setNotice, token]);

  useEffect(() => {
    if (!token || activeTab !== 'chats' || selected) return;
    const query = conversationSearch.trim();
    const requestId = conversationSearchRequestRef.current + 1;
    conversationSearchRequestRef.current = requestId;
    const timer = setTimeout(() => {
      setBusy(true);
      (query ? api.searchConversations(query, token) : api.conversations(token))
        .then(items => {
          if (conversationSearchRequestRef.current !== requestId) return;
          setConversations(items);
          setNotice(items.length ? '' : query ? 'Aucune conversation trouvée.' : 'Aucune conversation pour ce compte.');
        })
        .catch(error => {
          if (conversationSearchRequestRef.current !== requestId) return;
          setNotice(error instanceof Error ? error.message : 'Recherche conversations impossible.');
        })
        .finally(() => {
          if (conversationSearchRequestRef.current === requestId) setBusy(false);
        });
    }, query ? 280 : 0);
    return () => clearTimeout(timer);
  }, [activeTab, conversationSearch, selected, setBusy, setConversations, setNotice, token]);

  return {
    refreshConversations,
  };
}
