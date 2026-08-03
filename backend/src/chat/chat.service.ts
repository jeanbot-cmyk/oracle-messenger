import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  private isMediaType(type?: string | null) {
    return ['image', 'video', 'audio', 'voice', 'file', 'document'].includes(String(type ?? '').toLowerCase());
  }

  private unreadWhere(conversationId: string, userId: string, lastReadAt?: Date | null) {
    return {
      conversationId,
      senderId: { not: userId },
      isDeleted: false,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    };
  }

  // ── Conversations ──────────────────────────────────────────────────────────
  async getConversations(userId: string) {
    const participations = await this.prisma.participant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    return Promise.all(participations.map(async p => {
      const conv = p.conversation;
      const others = conv.participants.filter(pt => pt.userId !== userId).map(pt => pt.user);
      const unread = await this.prisma.message.count({
        where: this.unreadWhere(conv.id, userId, p.lastReadAt),
      });
      return {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        avatar: conv.avatar,
        participants: others,
        lastMessage: conv.messages[0] ?? null,
        unreadCount: unread,
        isPinned: false,
        updatedAt: conv.updatedAt,
      };
    }));
  }

  async getConversation(conversationId: string, userId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException();

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!conv) throw new NotFoundException();

    const others = conv.participants.filter(p => p.userId !== userId).map(p => p.user);
    const unread = await this.prisma.message.count({
      where: this.unreadWhere(conv.id, userId, participant.lastReadAt),
    });
    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      avatar: conv.avatar,
      participants: others,
      lastMessage: conv.messages[0] ?? null,
      unreadCount: unread,
      isPinned: false,
      updatedAt: conv.updatedAt,
    };
  }

  async deleteConversationForUser(conversationId: string, userId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { id: true },
    });
    if (!participant) throw new ForbiddenException();

    await this.prisma.participant.delete({ where: { id: participant.id } });

    const remaining = await this.prisma.participant.count({ where: { conversationId } });
    if (remaining === 0) {
      await this.prisma.conversation.delete({ where: { id: conversationId } });
    }

    return { ok: true };
  }

  async getOrCreateDirect(userId: string, participantId: string) {
    // Chercher une conversation directe existante
    let conv = await this.prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: participantId } } },
        ],
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: {
          type: 'direct',
          participants: { create: [{ userId }, { userId: participantId }] },
        },
        include: {
          participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      });
    }

    // Return same shape as getConversations — filter out self from participants
    const others = conv.participants.filter(p => p.userId !== userId).map(p => p.user);
    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      avatar: conv.avatar,
      participants: others,
      lastMessage: conv.messages[0] ?? null,
      unreadCount: 0,
      isPinned: false,
      updatedAt: conv.updatedAt,
    };
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  async getMessages(conversationId: string, userId: string, before?: string) {
    await this.cleanupOldTextMessages(5).catch(() => null);

    // Vérifier que l'utilisateur est participant
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException();

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { sender: { select: { id: true, name: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return messages.reverse();
  }

  async createMessage(conversationId: string, senderId: string, content: string, type = 'text', replyToId?: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId: senderId, conversationId } },
    });
    if (!participant) throw new ForbiddenException();

    const msg = await this.prisma.message.create({
      data: { conversationId, senderId, content, type, replyToId },
      include: { sender: { select: { id: true, name: true, username: true, avatar: true } }, replyTo: true },
    });

    // Mettre à jour updatedAt de la conversation
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    return msg;
  }

  async markMediaSavedLocally(messageId: string, userId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: { select: { userId: true } } } } },
    });
    if (!msg) throw new NotFoundException();
    if (!this.isMediaType(msg.type)) return { cleared: false, message: msg };

    const participantIds = msg.conversation.participants.map(p => p.userId);
    if (!participantIds.includes(userId)) throw new ForbiddenException();

    await this.prisma.messageLocalSave.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: {},
    });

    const savedCount = await this.prisma.messageLocalSave.count({
      where: { messageId, userId: { in: participantIds } },
    });
    const allParticipantsSaved = savedCount >= participantIds.length;
    const hasServerPayload = typeof msg.content === 'string' && msg.content.trim().length > 0;

    if (!allParticipantsSaved || !hasServerPayload) return { cleared: false, message: msg };

    const cleared = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: '' },
    });
    return { cleared: true, message: cleared };
  }

  async cleanupOldTextMessages(days = 5) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.message.updateMany({
      where: {
        type: 'text',
        isDeleted: false,
        createdAt: { lt: cutoff },
        content: { not: '' },
      },
      data: {
        content: '',
        isDeleted: true,
      },
    });
  }

  async updateMessageStatus(messageId: string, status: 'sent' | 'delivered' | 'read') {
    return this.prisma.message.update({
      where: { id: messageId },
      data: { status },
    });
  }

  async markConversationRead(conversationId: string, readerId: string) {
    await this.markRead(conversationId, readerId);
    return this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: readerId },
        status: { not: 'read' },
      },
      data: { status: 'read' },
    });
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException();
    if (msg.senderId !== userId) throw new ForbiddenException();
    return this.prisma.message.update({ where: { id: messageId }, data: { isDeleted: true, content: '' } });
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException();
    if (msg.senderId !== userId) throw new ForbiddenException();
    return this.prisma.message.update({ where: { id: messageId }, data: { content, isEdited: true } });
  }

  async markRead(conversationId: string, userId: string) {
    return this.prisma.participant.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: { lastReadAt: new Date() },
    });
  }

  async isParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { id: true },
    });
    return !!participant;
  }

  async getParticipantIds(conversationId: string): Promise<string[]> {
    const parts = await this.prisma.participant.findMany({ where: { conversationId } });
    return parts.map(p => p.userId);
  }
}
