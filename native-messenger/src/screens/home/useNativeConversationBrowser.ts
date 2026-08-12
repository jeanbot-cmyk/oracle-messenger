import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { sortConversations } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { readCachedConversations, writeCachedConversations } from '@/services/nativeConversationCache';
import type { Conversation } from '@/types/messenger';

type UseNativeConversationBrowserParams = {
  activeTab: NativeTabKey;
  conversationSearch: string;
  selected: Conversation | null;
  token?: string;
  ownerId?: string;
  setBusy: (busy: boolean) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setNotice: (message: string) => void;
};

export function useNativeConversationBrowser({
  activeTab,
  conversationSearch,
  selected,
  token,
  ownerId,
  setBusy,
  setConversations,
  setNotice,
}: UseNativeConversationBrowserParams) {
  const conversationSearchRequestRef = useRef(0);

  const refreshConversations = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    const query = conversationSearch.trim();
    let restoredFromCache = false;
    if (!query) {
      const cached = await readCachedConversations(ownerId || activeToken);
      if (cached.length) {
        restoredFromCache = true;
          setConversations(sortConversations(cached));
        setNotice('');
      }
    }
    setBusy(!restoredFromCache);
    try {
      const items = query ? await api.searchConversations(query, activeToken) : await api.conversations(activeToken);
      const sortedItems = sortConversations(items);
      setConversations(sortedItems);
      if (!query) await writeCachedConversations(ownerId || activeToken, sortedItems);
      setNotice(items.length ? '' : query ? 'Aucune conversation trouvée.' : 'Aucune conversation pour ce compte.');
    } catch (error) {
      setNotice(restoredFromCache
        ? 'Mode hors connexion : conversations affichées depuis le téléphone.'
        : error instanceof Error ? error.message : 'Chargement conversations impossible.');
    } finally {
      setBusy(false);
    }
  }, [conversationSearch, ownerId, setBusy, setConversations, setNotice, token]);

  useEffect(() => {
    if (!token || activeTab !== 'chats' || selected) return;
    const query = conversationSearch.trim();
    const requestId = conversationSearchRequestRef.current + 1;
    conversationSearchRequestRef.current = requestId;
    const timer = setTimeout(() => {
      void (async () => {
        let restoredFromCache = false;
        if (!query) {
          const cached = await readCachedConversations(ownerId || token);
          if (conversationSearchRequestRef.current !== requestId) return;
          if (cached.length) {
            restoredFromCache = true;
              setConversations(sortConversations(cached));
            setNotice('');
          }
        }
        setBusy(!restoredFromCache);
        try {
          const items = query ? await api.searchConversations(query, token) : await api.conversations(token);
          if (conversationSearchRequestRef.current !== requestId) return;
          const sortedItems = sortConversations(items);
          setConversations(sortedItems);
          if (!query) await writeCachedConversations(ownerId || token, sortedItems);
          setNotice(items.length ? '' : query ? 'Aucune conversation trouvée.' : 'Aucune conversation pour ce compte.');
        } catch (error) {
          if (conversationSearchRequestRef.current !== requestId) return;
          setNotice(restoredFromCache
            ? 'Mode hors connexion : conversations affichées depuis le téléphone.'
            : error instanceof Error ? error.message : 'Recherche conversations impossible.');
        } finally {
          if (conversationSearchRequestRef.current === requestId) setBusy(false);
        }
      })();
    }, query ? 280 : 0);
    return () => clearTimeout(timer);
  }, [activeTab, conversationSearch, ownerId, selected, setBusy, setConversations, setNotice, token]);

  return {
    refreshConversations,
  };
}
