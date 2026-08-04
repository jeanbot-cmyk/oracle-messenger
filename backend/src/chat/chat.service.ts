import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedReactions = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏', '😡']);
  private readonly allowedMessageTypes = new Set(['text', 'image', 'video', 'audio', 'voice', 'file', 'document']);
  private readonly maxMessageContentLength = 20_000;
  private readonly officialConversationType = 'official';
  private readonly officialConversationName = 'Aura Messenger';
  private readonly officialConversationAvatar = '/icons/icon-192.png';
  private readonly officialSystemEmail = 'system-aura@oracle-messenger.local';

  private isMediaType(type?: string | null) {
    return ['image', 'video', 'audio', 'voice', 'file', 'document'].includes(String(type ?? '').toLowerCase());
  }

  private normalizeMessageType(type?: string | null) {
    const normalized = String(type || 'text').toLowerCase().trim();
    if (!this.allowedMessageTypes.has(normalized)) {
      throw new BadRequestException('Type de message invalide');
    }
    return normalized;
  }

  private normalizeMessageContent(content?: string | null) {
    const value = String(content ?? '').trim();
    if (!value) throw new BadRequestException('Message vide');
    if (value.length > this.maxMessageContentLength) {
      throw new BadRequestException('Message trop long');
    }
    return value;
  }

  private unreadWhere(conversationId: string, userId: string, lastReadAt?: Date | null) {
    return {
      conversationId,
      senderId: { not: userId },
      isDeleted: false,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    };
  }

  private toConversationSummary(conv: any, userId: string, unreadCount: number) {
    const isOfficial = conv.type === this.officialConversationType;
    const others = conv.participants.filter((pt: any) => pt.userId !== userId).map((pt: any) => pt.user);
    const lastMessage = conv.messages?.[0] ?? null;
    const officialExpiresAt = isOfficial && conv.viewerLastReadAt && lastMessage
      ? new Date(new Date(conv.viewerLastReadAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : undefined;
    return {
      id: conv.id,
      type: conv.type,
      name: isOfficial ? this.officialConversationName : conv.name,
      avatar: isOfficial ? this.officialConversationAvatar : conv.avatar,
      participants: others,
      lastMessage,
      unreadCount,
      isPinned: isOfficial,
      isOfficial,
      isVerified: isOfficial,
      officialExpiresAt,
      updatedAt: conv.updatedAt,
    };
  }

  private officialConversationHasExpired(conv: any, lastReadAt?: Date | null) {
    if (conv.type !== this.officialConversationType) return false;
    const lastMessage = conv.messages?.[0];
    if (!lastMessage || !lastReadAt) return false;
    const messageCreatedAt = new Date(lastMessage.createdAt).getTime();
    const readAt = new Date(lastReadAt).getTime();
    if (!Number.isFinite(messageCreatedAt) || !Number.isFinite(readAt)) return false;
    if (readAt < messageCreatedAt) return false;
    return Date.now() - readAt >= 24 * 60 * 60 * 1000;
  }

  // ── Conversations ──────────────────────────────────────────────────────────
  async getConversations(userId: string) {
    const participations = await this.prisma.participant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { reactions: true } },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const summaries = await Promise.all(participations.map(async p => {
      const conv = p.conversation;
      const unread = await this.prisma.message.count({
        where: this.unreadWhere(conv.id, userId, p.lastReadAt),
      });
      if (unread === 0 && this.officialConversationHasExpired(conv, p.lastReadAt)) return null;
      return this.toConversationSummary({ ...conv, viewerLastReadAt: p.lastReadAt }, userId, unread);
    }));
    return summaries.filter(Boolean).sort((a: any, b: any) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
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
            messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { reactions: true } },
      },
    });
    if (!conv) throw new NotFoundException();
    if (this.officialConversationHasExpired(conv, participant.lastReadAt)) {
      throw new NotFoundException('Message officiel expiré');
    }

    const unread = await this.prisma.message.count({
      where: this.unreadWhere(conv.id, userId, participant.lastReadAt),
    });
    return this.toConversationSummary({ ...conv, viewerLastReadAt: participant.lastReadAt }, userId, unread);
  }

  async deleteConversationForUser(conversationId: string, userId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { id: true },
    });
    if (!participant) throw new ForbiddenException();

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });
    if (conv?.type === this.officialConversationType) {
      throw new ForbiddenException('La conversation officielle ne peut pas être supprimée');
    }

    await this.prisma.participant.delete({ where: { id: participant.id } });

    const remaining = await this.prisma.participant.count({ where: { conversationId } });
    if (remaining === 0) {
      await this.prisma.conversation.delete({ where: { id: conversationId } });
    }

    return { ok: true };
  }

  async getOrCreateDirect(userId: string, participantId: string) {
    if (!participantId || participantId === userId) {
      throw new BadRequestException('Destinataire invalide');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Contact introuvable');

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
        messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { reactions: true } },
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
          messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { reactions: true } },
        },
      });
    }

    await this.rememberConversationContacts(userId, participantId);

    // Return same shape as getConversations — filter out self from participants
    return this.toConversationSummary(conv, userId, 0);
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  async getMessages(conversationId: string, userId: string, before?: string) {
    // Vérifier que l'utilisateur est participant
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException();

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    });
    if (!conv) throw new NotFoundException();
    if (this.officialConversationHasExpired(conv, participant.lastReadAt)) {
      throw new NotFoundException('Message officiel expiré');
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: {
        sender: { select: { id: true, name: true, username: true, avatar: true } },
        reactions: { select: { emoji: true, userId: true, updatedAt: true } },
      },
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
    const normalizedType = this.normalizeMessageType(type);
    const normalizedContent = this.normalizeMessageContent(content);

    const convMeta = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });
    if (convMeta?.type === this.officialConversationType) {
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { email: true },
      });
      if (sender?.email !== this.officialSystemEmail) {
        throw new ForbiddenException('Cette conversation officielle ne reçoit pas de réponses');
      }
    }

    if (replyToId) {
      const replyTo = await this.prisma.message.findUnique({
        where: { id: replyToId },
        select: { conversationId: true, isDeleted: true },
      });
      if (!replyTo || replyTo.conversationId !== conversationId || replyTo.isDeleted) {
        throw new BadRequestException('Réponse invalide');
      }
    }

    const msg = await this.prisma.message.create({
      data: { conversationId, senderId, content: normalizedContent, type: normalizedType, replyToId },
      include: {
        sender: { select: { id: true, name: true, username: true, avatar: true } },
        replyTo: true,
        reactions: { select: { emoji: true, userId: true, updatedAt: true } },
      },
    });

    // Mettre à jour updatedAt de la conversation
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    return msg;
  }

  async markMediaSavedLocally(messageId: string, userId: string, checksum?: string, size?: number) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: { select: { userId: true } } } } },
    });
    if (!msg) throw new NotFoundException();
    if (!this.isMediaType(msg.type)) return { cleared: false, message: msg };
    if (!checksum || !/^[a-f0-9]{64}$/i.test(checksum)) return { cleared: false, message: msg };

    const participantIds = msg.conversation.participants.map(p => p.userId);
    if (!participantIds.includes(userId)) throw new ForbiddenException();

    await this.prisma.messageLocalSave.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, checksum, size: Number.isFinite(size) ? Math.max(0, Math.floor(size ?? 0)) : undefined },
      update: { checksum, size: Number.isFinite(size) ? Math.max(0, Math.floor(size ?? 0)) : undefined },
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
    void days;
    return { count: 0 };
  }

  async updateMessageStatus(messageId: string, status: 'sent' | 'delivered' | 'read') {
    return this.prisma.message.update({
      where: { id: messageId },
      data: { status },
    });
  }

  async markMessageDelivered(messageId: string, receiverId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: { select: { userId: true } } } } },
    });
    if (!msg) throw new NotFoundException();
    const participantIds = msg.conversation.participants.map(p => p.userId);
    if (!participantIds.includes(receiverId)) throw new ForbiddenException();
    if (msg.senderId === receiverId) return msg;
    if (msg.status === 'read' || msg.status === 'delivered') return msg;
    return this.prisma.message.update({
      where: { id: messageId },
      data: { status: 'delivered' },
    });
  }

  async reactToMessage(messageId: string, userId: string, emoji?: string | null) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: { select: { userId: true } } } } },
    });
    if (!msg) throw new NotFoundException();
    const participantIds = msg.conversation.participants.map(p => p.userId);
    if (!participantIds.includes(userId)) throw new ForbiddenException();
    if (msg.isDeleted) throw new ForbiddenException('Message supprimé');

    const normalizedEmoji = String(emoji ?? '').trim();
    if (!normalizedEmoji) {
      await this.prisma.messageReaction.deleteMany({ where: { messageId, userId } });
    } else {
      if (!this.allowedReactions.has(normalizedEmoji)) throw new ForbiddenException('Réaction non autorisée');
      await this.prisma.messageReaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, emoji: normalizedEmoji },
        update: { emoji: normalizedEmoji },
      });
    }

    return this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        reactions: { select: { emoji: true, userId: true, updatedAt: true } },
      },
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
    if (msg.isDeleted) throw new ForbiddenException('Message supprimé');
    if (msg.type !== 'text') throw new BadRequestException('Seuls les messages texte peuvent être modifiés');
    const normalizedContent = this.normalizeMessageContent(content);
    return this.prisma.message.update({ where: { id: messageId }, data: { content: normalizedContent, isEdited: true } });
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

  private async rememberConversationContacts(userId: string, participantId: string) {
    await this.prisma.$transaction([
      this.prisma.contact.upsert({
        where: { ownerId_contactUserId: { ownerId: userId, contactUserId: participantId } },
        create: { ownerId: userId, contactUserId: participantId, source: 'conversation' },
        update: { source: 'conversation' },
      }),
      this.prisma.contact.upsert({
        where: { ownerId_contactUserId: { ownerId: participantId, contactUserId: userId } },
        create: { ownerId: participantId, contactUserId: userId, source: 'conversation' },
        update: { source: 'conversation' },
      }),
    ]);
  }
}
