import type { Message } from '@/types/messenger';

type SocketLike = {
  emit: (event: string, payload: Record<string, unknown>) => void;
};

function normalizedStatus(message: Message) {
  return String(message.status || 'sent').toLowerCase();
}

export function isIncomingMessage(message: Message, currentUserId?: string | null) {
  return Boolean(currentUserId && message.senderId && message.senderId !== currentUserId);
}

export function needsDeliveredAck(message: Message, currentUserId?: string | null) {
  if (!isIncomingMessage(message, currentUserId)) return false;
  return !['delivered', 'received', 'read', 'seen'].includes(normalizedStatus(message));
}

export function emitDeliveredAck(
  socket: SocketLike,
  message: Message,
  currentUserId?: string | null,
  extra: Record<string, unknown> = {},
) {
  if (!needsDeliveredAck(message, currentUserId)) return false;
  socket.emit('message:delivered', {
    messageId: message.id,
    conversationId: message.conversationId,
    clientReceivedAt: new Date().toISOString(),
    ...extra,
  });
  return true;
}

export function emitDeliveredAcks(socket: SocketLike, messages: Message[], currentUserId?: string | null) {
  let count = 0;
  for (const message of messages) {
    if (emitDeliveredAck(socket, message, currentUserId)) count += 1;
  }
  return count;
}

export function latestIncomingMessage(messages: Message[], currentUserId?: string | null) {
  if (!currentUserId) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isIncomingMessage(message, currentUserId)) return message;
  }
  return null;
}
