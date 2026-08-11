import { create } from 'zustand';
import type { Conversation, Message, User } from '../types';
import {
  saveMessage,
  saveConversation,
  getMessages,
  deleteMessage as deleteLocalMessage,
  deleteConversation as deleteLocalConversation,
  preserveLocalMediaContent,
} from '../lib/db';

interface ChatStore {
  conversations:      Conversation[];
  activeConvId:       string | null;
  messages:           Record<string, Message[]>;
  typingUsers:        Record<string, string[]>;
  typingNames:        Record<string, Record<string, string>>; // convId → { userId: name }
  onlineUsers:        Set<string>;
  currentUser:        User | null;
  archivedConversationIds: Set<string>;
  blockedUserIds:     Set<string>;

  setCurrentUser:     (u: User) => void;
  setConversations:   (c: Conversation[]) => void;
  upsertConversation: (c: Conversation) => void;
  setActiveConv:      (id: string) => void;
  removeConversation: (id: string) => void;
  addMessage:         (msg: Message) => void;
  updateMessage:      (id: string, patch: Partial<Message>) => void;
  deleteMessage:      (convId: string, msgId: string) => void;
  setMessages:        (convId: string, msgs: Message[]) => void;
  loadLocalMessages:  (convId: string) => Promise<void>;
  setTyping:          (convId: string, userId: string, isTyping: boolean, userName?: string) => void;
  setOnline:          (userId: string, online: boolean) => void;
  markRead:           (convId: string) => void;
  markConversationMessagesRead: (convId: string, readerId: string, currentUserId: string) => void;
  archiveConversation: (convId: string) => void;
  unarchiveConversation: (convId: string) => void;
  blockUser:          (userId: string) => void;
  unblockUser:        (userId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations:  [],
  activeConvId:   null,
  messages:       {},
  typingUsers:    {},
  typingNames:    {},
  onlineUsers:    new Set(),
  currentUser:    null,
  archivedConversationIds: new Set(),
  blockedUserIds: new Set(),

  setCurrentUser: (u) => set({
    currentUser: u,
    archivedConversationIds: readIdSet(storageKey('archived-conversations', u.id)),
    blockedUserIds: readIdSet(storageKey('blocked-users', u.id)),
  }),

  setConversations: (convs) => {
    const ownerId = get().currentUser?.id;
    const visible = convs.filter(c => !isOfficialExpired(c));
    visible.forEach(c => saveConversation(c, ownerId));
    set({ conversations: sortConversations(visible) });
  },

  upsertConversation: (conv) => {
    if (isOfficialExpired(conv)) {
      get().removeConversation(conv.id);
      return;
    }
    saveConversation(conv, get().currentUser?.id).catch(() => {});
    set(s => {
      const exists = s.conversations.some(c => c.id === conv.id);
      const next = exists
        ? s.conversations.map(c => c.id === conv.id ? { ...c, ...conv } : c)
        : [conv, ...s.conversations];
      return { conversations: sortConversations(next) };
    });
  },

  setActiveConv: (id) => set({ activeConvId: id }),

  removeConversation: (id) => {
    deleteLocalConversation(id).catch(() => {});
    set(s => {
      const nextMessages = { ...s.messages };
      delete nextMessages[id];
      return {
        conversations: s.conversations.filter(c => c.id !== id),
        messages: nextMessages,
        activeConvId: s.activeConvId === id ? null : s.activeConvId,
      };
    });
  },

  addMessage: (msg) => {
    set(s => {
      const prev = s.messages[msg.conversationId] ?? [];
      const exists = prev.find(m => m.id === msg.id);
      const nextMsg = preserveLocalMediaContent(msg, exists);
      saveMessage(nextMsg, s.currentUser?.id).catch(() => {});
      const updated = sortMessages(exists ? prev.map(m => m.id === msg.id ? nextMsg : m) : [...prev, nextMsg]);
      // Mettre à jour lastMessage dans la conversation
      const convs = s.conversations.map(c => {
        if (c.id !== msg.conversationId) return c;
        const next = { ...c, lastMessage: nextMsg, updatedAt: nextMsg.createdAt };
        saveConversation(next, s.currentUser?.id).catch(() => {});
        return next;
      });
      return { messages: { ...s.messages, [msg.conversationId]: updated }, conversations: sortConversations(convs) };
    });
  },

  updateMessage: (id, patch) => {
    set(s => {
      const updated: Record<string, Message[]> = {};
      for (const [convId, msgs] of Object.entries(s.messages)) {
        updated[convId] = msgs.map(m => {
          if (m.id !== id) return m;
          const effectivePatch =
            patch.content === '' && preserveLocalMediaContent({ ...m, ...patch }, m).content === m.content
              ? Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'content')) as Partial<Message>
              : patch;
          const next = { ...m, ...effectivePatch };
          saveMessage(next, s.currentUser?.id).catch(() => {});
          return next;
        });
      }
      for (const convId of Object.keys(updated)) updated[convId] = sortMessages(updated[convId]);
      return { messages: updated };
    });
  },

  deleteMessage: (convId, msgId) => {
    if (msgId.startsWith('temp-')) deleteLocalMessage(msgId).catch(() => {});
    set(s => {
      const nextMessages = sortMessages((s.messages[convId] ?? []).filter(m => !(m.id === msgId && msgId.startsWith('temp-'))).map(m => {
          if (m.id !== msgId) return m;
          const next = { ...m, isDeleted: true, content: 'Ce message a été supprimé' };
          saveMessage(next, s.currentUser?.id).catch(() => {});
          return next;
        }));
      const visibleMessages = nextMessages.filter(m => !m.isDeleted);
      const lastVisible = visibleMessages.at(-1);
      const conversations = s.conversations.map(c => {
        if (c.id !== convId) return c;
        const next = {
          ...c,
          lastMessage: lastVisible,
          updatedAt: lastVisible?.createdAt ?? c.updatedAt,
        };
        saveConversation(next, s.currentUser?.id).catch(() => {});
        return next;
      });
      return {
        messages: {
          ...s.messages,
          [convId]: nextMessages,
        },
        conversations: sortConversations(conversations),
      };
    });
  },

  setMessages: (convId, msgs) => {
    set(s => {
      const existing = s.messages[convId] ?? [];
      const byId = new Map<string, Message>();
      for (const msg of existing) byId.set(msg.id, msg);
      for (const msg of msgs) {
        const nextMsg = preserveLocalMediaContent(msg, byId.get(msg.id));
        byId.set(msg.id, nextMsg);
        saveMessage(nextMsg, s.currentUser?.id).catch(() => {});
      }
      const merged = sortMessages(Array.from(byId.values())
        .filter(msg => msg.conversationId === convId));
      return { messages: { ...s.messages, [convId]: merged } };
    });
  },

  loadLocalMessages: async (convId) => {
    const msgs = await getMessages(convId, 50, get().currentUser?.id);
    if (msgs.length > 0) {
      set(s => ({ messages: { ...s.messages, [convId]: sortMessages(msgs) } }));
    }
  },

  setTyping: (convId, userId, isTyping, userName) => {
    set(s => {
      const current = s.typingUsers[convId] ?? [];
      const updated = isTyping
        ? [...new Set([...current, userId])]
        : current.filter(id => id !== userId);
      // Store name if provided
      const names = { ...(s.typingNames[convId] ?? {}) };
      if (isTyping && userName) names[userId] = userName;
      else if (!isTyping) delete names[userId];
      return {
        typingUsers: { ...s.typingUsers, [convId]: updated },
        typingNames: { ...s.typingNames, [convId]: names },
      };
    });
  },

  setOnline: (userId, online) => {
    set(s => {
      const next = new Set(s.onlineUsers);
      online ? next.add(userId) : next.delete(userId);
      return { onlineUsers: next };
    });
  },

  markRead: (convId) => {
    set(s => ({
      conversations: s.conversations.map(c =>
        c.id === convId ? markConversationReadLocally(c) : c
      ),
    }));
  },

  markConversationMessagesRead: (convId, readerId, currentUserId) => {
    set(s => ({
      messages: {
        ...s.messages,
        [convId]: (s.messages[convId] ?? []).map(m => {
          if (readerId === currentUserId) return m;
          if (m.senderId !== currentUserId || m.status === 'read') return m;
          const next = { ...m, status: 'read' as const };
          saveMessage(next, s.currentUser?.id).catch(() => {});
          return next;
        }),
      },
    }));
  },

  archiveConversation: (convId) => {
    set(s => {
      const next = new Set(s.archivedConversationIds);
      next.add(convId);
      writeIdSet(storageKey('archived-conversations', s.currentUser?.id), next);
      return {
        archivedConversationIds: next,
        activeConvId: s.activeConvId === convId ? null : s.activeConvId,
      };
    });
  },

  unarchiveConversation: (convId) => {
    set(s => {
      const next = new Set(s.archivedConversationIds);
      next.delete(convId);
      writeIdSet(storageKey('archived-conversations', s.currentUser?.id), next);
      return { archivedConversationIds: next };
    });
  },

  blockUser: (userId) => {
    if (!userId) return;
    set(s => {
      const next = new Set(s.blockedUserIds);
      next.add(userId);
      writeIdSet(storageKey('blocked-users', s.currentUser?.id), next);
      return { blockedUserIds: next };
    });
  },

  unblockUser: (userId) => {
    if (!userId) return;
    set(s => {
      const next = new Set(s.blockedUserIds);
      next.delete(userId);
      writeIdSet(storageKey('blocked-users', s.currentUser?.id), next);
      return { blockedUserIds: next };
    });
  },
}));

function storageKey(kind: string, userId?: string) {
  return userId ? `oracle-messenger:${kind}:${userId}` : '';
}

function readIdSet(key: string) {
  if (typeof window === 'undefined' || !key) return new Set<string>();
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  if (typeof window === 'undefined' || !key) return;
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {}
}

function sortConversations(convs: Conversation[]) {
  return [...convs].filter(c => !isOfficialExpired(c)).sort((a, b) => {
    const aPinned = Boolean(a.isPinned || a.isOfficial || a.type === 'official');
    const bPinned = Boolean(b.isPinned || b.isOfficial || b.type === 'official');
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function sortMessages(messages: Message[]) {
  return [...messages].sort((a, b) => {
    const diff = messageTime(a) - messageTime(b);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

function messageTime(message: Message) {
  const timestamp = new Date(message.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isOfficialExpired(conv: Conversation) {
  if (!conv.isOfficial && conv.type !== 'official') return false;
  if ((conv.unreadCount ?? 0) > 0) return false;
  if (!conv.officialExpiresAt) return false;
  const expiry = new Date(conv.officialExpiresAt).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
}

function markConversationReadLocally(conv: Conversation): Conversation {
  const isOfficial = Boolean(conv.isOfficial || conv.type === 'official');
  if (!isOfficial) return { ...conv, unreadCount: 0 };
  if (conv.officialExpiresAt) return { ...conv, unreadCount: 0 };
  if (!conv.lastMessage?.createdAt) return { ...conv, unreadCount: 0 };
  return {
    ...conv,
    unreadCount: 0,
    officialExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
