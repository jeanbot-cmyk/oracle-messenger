'use client';
import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '../lib/socket';
import { useChatStore } from '../store/chat';
import { useNotifications } from './useNotifications';
import type { Conversation, Message } from '../types';
import { isMediaMessage, persistMessageMedia } from '../lib/db';

function attachmentPreview(msg: Message) {
  if (msg.isDeleted) return 'Message supprimé';
  const content = msg.content ?? '';
  let src = content.trim();
  try {
    const parsed = JSON.parse(src);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') src = parsed.url.trim();
  } catch {}
  const type = String(msg.type);
  if (type === 'image' || src.startsWith('data:image')) return 'Photo';
  if (type === 'video' || src.startsWith('data:video')) return 'Vidéo';
  if (type === 'audio' || type === 'voice' || src.startsWith('data:audio')) return 'Audio';
  if (type === 'file' || type === 'document' || src.startsWith('data:') || (src.length > 500 && /^[A-Za-z0-9+/=\r\n]+$/.test(src))) return 'Fichier';
  return content;
}

function hasMediaPayload(msg: Message) {
  return isMediaMessage(msg.type) && typeof msg.content === 'string' && msg.content.trim().length > 0;
}

const MEDIA_SAVE_RETRY_LIMIT = 8;
const mediaSaveRetries = new Map<string, { attempts: number; timer?: ReturnType<typeof setTimeout> }>();

function clearMediaRetry(messageId: string) {
  const existing = mediaSaveRetries.get(messageId);
  if (existing?.timer) clearTimeout(existing.timer);
  mediaSaveRetries.delete(messageId);
}

function scheduleMediaRetry(socket: any, msg: Message, options: { confirmDelivered?: boolean }) {
  const existing = mediaSaveRetries.get(msg.id) ?? { attempts: 0 };
  if (existing.attempts >= MEDIA_SAVE_RETRY_LIMIT) return;
  if (existing.timer) clearTimeout(existing.timer);

  const attempts = existing.attempts + 1;
  const delay = Math.min(45_000, 1500 * 2 ** Math.max(0, attempts - 1));
  const timer = setTimeout(() => {
    void persistMediaThenConfirm(socket, msg, options);
  }, delay);

  mediaSaveRetries.set(msg.id, { attempts, timer });
}

async function persistMediaThenConfirm(socket: any, msg: Message, options: { confirmDelivered?: boolean } = {}) {
  if (!hasMediaPayload(msg)) return true;
  try {
    const saved = await persistMessageMedia(msg, useChatStore.getState().currentUser?.id);
    if (!saved?.checksum) {
      scheduleMediaRetry(socket, msg, options);
      return false;
    }
    useChatStore.getState().updateMessage(msg.id, { content: saved.content });
    socket.emit('message:media-saved', {
      messageId: msg.id,
      checksum: saved.checksum,
      size: saved.size,
      opfsPath: saved.opfsPath,
    });
    if (options.confirmDelivered) {
      socket.emit('message:delivered', { messageId: msg.id });
    }
    clearMediaRetry(msg.id);
    return true;
  } catch (error) {
    console.warn('[media] local persistence failed; server cleanup blocked', {
      messageId: msg.id,
      error,
    });
    scheduleMediaRetry(socket, msg, options);
    return false;
  }
}

export function useSocket() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken;
  const userId = session?.user?.id ?? '';
  const store = useChatStore();
  const joined = useRef<Set<string>>(new Set());
  const { notifyMessage, requestPermission } = useNotifications();

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;

    // Demander permission notifs dès la connexion
    requestPermission();

    socket.on('connect', () => {});

    socket.on('message:new', (msg: Message) => {
      store.addMessage(msg);
      // Notifier seulement si le message vient de quelqu'un d'autre
      if (msg.senderId !== userId) {
        if (hasMediaPayload(msg)) {
          void persistMediaThenConfirm(socket, msg, { confirmDelivered: true });
        } else {
          socket.emit('message:delivered', { messageId: msg.id });
        }
        const senderName = msg.sender?.name ?? 'Nouveau message';
        const content = attachmentPreview(msg);
        notifyMessage(senderName, content, msg.conversationId);
        // Sonnerie moderne à la réception
        import('../lib/sounds').then(({ playMessageSound }) => playMessageSound()).catch(() => {});
      } else {
        void persistMediaThenConfirm(socket, msg);
      }
    });

    socket.on('conversation:upsert', (conversation: Conversation) => {
      useChatStore.getState().upsertConversation(conversation);
    });

    socket.on('message:update', ({ id, patch }: { id: string; patch: Partial<Message> }) => {
      store.updateMessage(id, patch);
    });

    // When the other user reads the conversation → mark all our messages as read
    socket.on('conversation:read', ({ conversationId, userId: readerUserId }: { conversationId: string; userId: string }) => {
      if (readerUserId === userId) return; // ignore own read events
      useChatStore.getState().markConversationMessagesRead(conversationId, readerUserId, userId);
    });

    socket.on('message:delete', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      store.deleteMessage(conversationId, messageId);
    });

    socket.on('typing:start', ({ conversationId, userId: uid, userName }: any) => {
      store.setTyping(conversationId, uid, true, userName);
    });
    socket.on('typing:stop', ({ conversationId, userId: uid }: any) => {
      store.setTyping(conversationId, uid, false);
    });

    socket.on('user:online',  ({ userId: uid }: any) => store.setOnline(uid, true));
    socket.on('user:offline', ({ userId: uid }: any) => store.setOnline(uid, false));

    return () => {
      socket.off('connect');
      socket.off('message:new');
      socket.off('conversation:upsert');
      socket.off('message:update');
      socket.off('conversation:read');
      socket.off('message:delete');
      socket.off('message:error');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('user:online');
      socket.off('user:offline');
    };
  }, [token, userId]);

  function joinConversation(convId: string) {
    if (!token || joined.current.has(convId)) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit('conversation:join', { conversationId: convId });
    joined.current.add(convId);
  }

  function sendTyping(convId: string, isTyping: boolean) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId: convId });
  }

  function sendMessage(convId: string, content: string, type = 'text', replyToId?: string, replyTo?: Message | null) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;

    // Détecter automatiquement le type si base64
    let resolvedType = type;
    if (type === 'text' && content.startsWith('data:')) {
      if (content.startsWith('data:image')) resolvedType = 'image';
      else if (content.startsWith('data:video')) resolvedType = 'video';
      else if (content.startsWith('data:audio')) resolvedType = 'audio';
      else resolvedType = 'file';
    }

    // Add optimistic message immediately so UI feels instant
    const tempId = `temp-${Date.now()}`;
    const optimistic: any = {
      id: tempId,
      conversationId: convId,
      senderId: userId,
      content,
      type: resolvedType,
      status: 'sending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isEdited: false,
      isDeleted: false,
      replyTo: replyTo ?? null,
      sender: { id: userId, name: '', username: '', avatar: undefined },
    };
    useChatStore.getState().addMessage(optimistic);

    socket.emit('message:send', { conversationId: convId, content, type: resolvedType, replyToId }, (ack: any) => {
      // When server confirms, replace temp message with real one
      if (ack?.id) {
        useChatStore.getState().deleteMessage(convId, tempId);
        useChatStore.getState().addMessage({ ...ack, status: ack.status ?? 'sent' });
        persistMediaThenConfirm(socket, { ...ack, status: ack.status ?? 'sent' });
      }
    });
  }

  function deleteMessage(convId: string, messageId: string) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit('message:delete', { conversationId: convId, messageId });
    store.deleteMessage(convId, messageId);
  }

  function editMessage(messageId: string, content: string) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit('message:edit', { messageId, content });
    store.updateMessage(messageId, { content, isEdited: true });
  }

  function markRead(convId: string, messageId?: string) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit('message:read', { conversationId: convId, messageId });
  }

  function reactToMessage(messageId: string, emoji?: string | null) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    socket.emit('message:react', { messageId, emoji: emoji ?? null });
  }

  function confirmMediaSavedForMessages(msgs: Message[]) {
    if (!token) return;
    const socket = getSocket(token);
    if (!socket) return;
    for (const msg of msgs) {
      if (!hasMediaPayload(msg)) continue;
      void persistMediaThenConfirm(socket, msg, { confirmDelivered: msg.senderId !== userId });
    }
  }

  return { joinConversation, sendTyping, sendMessage, deleteMessage, editMessage, markRead, reactToMessage, confirmMediaSavedForMessages };
}
