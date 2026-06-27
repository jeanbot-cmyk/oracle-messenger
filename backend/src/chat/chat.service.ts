import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

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

    return participations.map(p => {
      const conv = p.conversation;
      const others = conv.participants.filter(pt => pt.userId !== userId).map(pt => pt.user);
      const unread = 0; // calculé côté client via IndexedDB
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
    });
  }

  async getOrCreateDirect(userId: string, participantId: string) {
    // Chercher une conversation directe existante
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: participantId } } },
        ],
      },
      include: { participants: { include: { user: true } }, messages: { take: 1, orderBy: { createdAt: 'desc' } } },
    });
    if (existing) return existing;

    // Créer une nouvelle conversation directe
    return this.prisma.conversation.create({
      data: {
        type: 'direct',
        participants: {
          create: [{ userId }, { userId: participantId }],
        },
      },
      include: { participants: { include: { user: true } }, messages: true },
    });
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  async getMessages(conversationId: string, userId: string, before?: string) {
    // Vérifier que l'utilisateur est participant
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException();

    return this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { sender: { select: { id: true, name: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
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

  async getParticipantIds(conversationId: string): Promise<string[]> {
    const parts = await this.prisma.participant.findMany({ where: { conversationId } });
    return parts.map(p => p.userId);
  }
}
