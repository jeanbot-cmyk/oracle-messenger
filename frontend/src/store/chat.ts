import { create } from 'zustand';
import type { Conversation, Message, User } from '../types';
import { saveMessage, saveConversation, getMessages, getConversations } from '../lib/db';

interface ChatStore {
  conversations:      Conversation[];
  activeConvId:       string | null;
  messages:           Record<string, Message[]>;
  typingUsers:        Record<string, string[]>;
  typingNames:        Record<string, Record<string, string>>; // convId → { userId: name }
  onlineUsers:        Set<string>;
  currentUser:        User | null;

  setCurrentUser:     (u: User) => void;
  setConversations:   (c: Conversation[]) => void;
  setActiveConv:      (id: string) => void;
  addMessage:         (msg: Message) => void;
  updateMessage:      (id: string, patch: Partial<Message>) => void;
  deleteMessage:      (convId: string, msgId: string) => void;
  setMessages:        (convId: string, msgs: Message[]) => void;
  loadLocalMessages:  (convId: string) => Promise<void>;
  setTyping:          (convId: string, userId: string, isTyping: boolean, userName?: string) => void;
  setOnline:          (userId: string, online: boolean) => void;
  markRead:           (convId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations:  [],
  activeConvId:   null,
  messages:       {},
  typingUsers:    {},
  typingNames:    {},
  onlineUsers:    new Set(),
  currentUser:    null,

  setCurrentUser: (u) => set({ currentUser: u }),

  setConversations: (convs) => {
    convs.forEach(c => saveConversation(c));
    set({ conversations: convs });
  },

  setActiveConv: (id) => set({ activeConvId: id }),

  addMessage: (msg) => {
    saveMessage(msg);
    set(s => {
      const prev = s.messages[msg.conversationId] ?? [];
      const exists = prev.find(m => m.id === msg.id);
      const updated = exists ? prev.map(m => m.id === msg.id ? msg : m) : [...prev, msg];
      // Mettre à jour lastMessage dans la conversation
      const convs = s.conversations.map(c =>
        c.id === msg.conversationId ? { ...c, lastMessage: msg, updatedAt: msg.createdAt } : c
      );
      return { messages: { ...s.messages, [msg.conversationId]: updated }, conversations: convs };
    });
  },

  updateMessage: (id, patch) => {
    set(s => {
      const updated: Record<string, Message[]> = {};
      for (const [convId, msgs] of Object.entries(s.messages)) {
        updated[convId] = msgs.map(m => m.id === id ? { ...m, ...patch } : m);
      }
      return { messages: updated };
    });
  },

  deleteMessage: (convId, msgId) => {
    set(s => ({
      messages: {
        ...s.messages,
        [convId]: (s.messages[convId] ?? []).map(m =>
          m.id === msgId ? { ...m, isDeleted: true, content: 'Ce message a été supprimé' } : m
        ),
      },
    }));
  },

  setMessages: (convId, msgs) => {
    msgs.forEach(m => saveMessage(m));
    set(s => ({ messages: { ...s.messages, [convId]: msgs } }));
  },

  loadLocalMessages: async (convId) => {
    const msgs = await getMessages(convId);
    if (msgs.length > 0) {
      set(s => ({ messages: { ...s.messages, [convId]: msgs } }));
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
        c.id === convId ? { ...c, unreadCount: 0 } : c
      ),
    }));
  },
}));
