import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { unlink } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedReactions = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏', '😡']);
  private readonly allowedMessageTypes = new Set(['text', 'image', 'video', 'audio', 'voice', 'file', 'document', 'contact', 'location', 'gif', 'sticker']);
  private readonly maxMessageContentLength = 20_000;
  private readonly officialConversationType = 'official';
  private readonly officialConversationName = 'O.messenger';
  private readonly officialConversationAvatar = '/icons/oracle-system-avatar.svg';
  private readonly officialSystemEmail = 'system-aura@oracle-messenger.local';
  private readonly officialMessageTtlMs = 24 * 60 * 60 * 1000;

  private isMediaType(type?: string | null) {
    return ['image', 'video', 'audio', 'voice', 'file', 'document', 'gif', 'sticker'].includes(String(type ?? '').toLowerCase());
  }

  private uploadRoot() {
    return process.env.MEDIA_UPLOAD_DIR || join(process.cwd(), 'uploads');
  }

  private uploadedFilePathFromContent(content?: string | null) {
    const raw = String(content ?? '').trim();
    if (!raw) return null;

    let source = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
        source = parsed.url;
      }
    } catch {}

    try {
      source = new URL(source).pathname;
    } catch {}

    const marker = '/uploads/';
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) return null;

    const relative = decodeURIComponent(source.slice(markerIndex + marker.length)).replace(/\\/g, '/');
    if (!relative || relative.split('/').some(part => part === '..')) return null;

    const root = resolve(this.uploadRoot());
    const absolute = resolve(root, relative);
    if (absolute !== root && !absolute.startsWith(`${root}/`)) return null;
    return absolute;
  }

  private mediaPayloadFromContent(content?: string | null) {
    const raw = String(content ?? '').trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const payload = parsed as Record<string, unknown>;
      return {
        url: typeof payload.url === 'string' ? payload.url : '',
        checksum: typeof payload.checksum === 'string' && /^[a-f0-9]{64}$/i.test(payload.checksum)
          ? payload.checksum.toLowerCase()
          : undefined,
        size: Number.isFinite(Number(payload.size)) && Number(payload.size) > 0
          ? Math.floor(Number(payload.size))
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private async removeTemporaryUploadedFile(content?: string | null) {
    const filePath = this.uploadedFilePathFromContent(content);
    if (!filePath) return false;
    try {
      await unlink(filePath);
      return true;
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn('[media] temporary upload cleanup failed', { filePath, error: error?.message ?? error });
        return false;
      }
      return true;
    }
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

  private getOfficialExpiresAt(conv: any) {
    const lastMessage = conv.messages?.[0] ?? null;
    if (conv.type !== this.officialConversationType || !conv.viewerLastReadAt || !lastMessage?.createdAt) return undefined;
    const readAt = new Date(conv.viewerLastReadAt);
    const messageAt = new Date(lastMessage.createdAt);
    if (Number.isNaN(readAt.getTime()) || Number.isNaN(messageAt.getTime())) return undefined;
    if (readAt.getTime() < messageAt.getTime()) return undefined;
    return new Date(readAt.getTime() + this.officialMessageTtlMs);
  }

  private isOfficialExpired(conv: any) {
    const expiresAt = this.getOfficialExpiresAt(conv);
    return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
  }

  async isOfficialConversation(conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });
    return conv?.type === this.officialConversationType;
  }

  private toConversationSummary(conv: any, userId: string, unreadCount: number) {
    const isOfficial = conv.type === this.officialConversationType;
    const others = conv.participants.filter((pt: any) => pt.userId !== userId).map((pt: any) => pt.user);
    const lastMessage = conv.messages?.[0] ?? null;
    const officialExpiresAt = this.getOfficialExpiresAt(conv)?.toISOString();
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

  private async getUnreadCountsForUser(userId: string, conversationIds: string[]) {
    const ids = [...new Set(conversationIds.filter(Boolean))];
    if (!ids.length) return new Map<string, number>();

    const rows = await this.prisma.$queryRaw<Array<{ conversationId: string; unreadCount: bigint | number }>>(Prisma.sql`
      SELECT m."conversationId", COUNT(*) AS "unreadCount"
      FROM "Message" m
      INNER JOIN "Participant" p
        ON p."conversationId" = m."conversationId"
       AND p."userId" = ${userId}
      WHERE m."conversationId" IN (${Prisma.join(ids)})
        AND m."senderId" <> ${userId}
        AND m."isDeleted" = false
        AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
      GROUP BY m."conversationId"
    `);

    return new Map(rows.map(row => [row.conversationId, Number(row.unreadCount)]));
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

    const unreadByConversation = await this.getUnreadCountsForUser(
      userId,
      participations.map(p => p.conversation.id),
    );

    const summaries = participations.map(p => {
      const conv = p.conversation;
      const convWithViewer = { ...conv, viewerLastReadAt: p.lastReadAt };
      if (this.isOfficialExpired(convWithViewer)) return null;
      const unread = unreadByConversation.get(conv.id) ?? 0;
      return this.toConversationSummary(convWithViewer, userId, unread);
    });
    return summaries.filter(Boolean).sort((a: any, b: any) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  async searchConversations(userId: string, query: string) {
    const q = String(query ?? '').trim();
    if (!q) return [];
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          {
            participants: {
              some: {
                userId: { not: userId },
                user: {
                  OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { username: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
          {
            messages: {
              some: {
                isDeleted: false,
                content: { contains: q, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { reactions: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });

    const unreadByConversation = await this.getUnreadCountsForUser(
      userId,
      conversations.map(conv => conv.id),
    );

    const summaries = conversations.map(conv => {
      const participant = conv.participants.find((item: any) => item.userId === userId);
      const convWithViewer = { ...conv, viewerLastReadAt: participant?.lastReadAt };
      if (this.isOfficialExpired(convWithViewer)) return null;
      const unread = unreadByConversation.get(conv.id) ?? 0;
      return this.toConversationSummary(convWithViewer, userId, unread);
    });
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
    const convWithViewer = { ...conv, viewerLastReadAt: participant.lastReadAt };
    if (this.isOfficialExpired(convWithViewer)) throw new NotFoundException();
    const unread = await this.prisma.message.count({
      where: this.unreadWhere(conv.id, userId, participant.lastReadAt),
    });
    return this.toConversationSummary(convWithViewer, userId, unread);
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
      select: { id: true, email: true },
    });
    if (!target) throw new NotFoundException('Contact introuvable');
    if (target.email === this.officialSystemEmail) {
      throw new ForbiddenException('Le compte système ne peut pas être appelé');
    }

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
    if (this.isOfficialExpired({ ...conv, viewerLastReadAt: participant.lastReadAt })) {
      throw new NotFoundException();
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
    const normalizedChecksum = String(checksum || '').toLowerCase();
    const normalizedSize = Number.isFinite(Number(size)) ? Math.floor(Number(size)) : 0;
    if (!/^[a-f0-9]{64}$/.test(normalizedChecksum) || normalizedSize <= 0) {
      throw new BadRequestException('Confirmation média invalide');
    }

    const participantIds = msg.conversation.participants.map(p => p.userId);
    if (!participantIds.includes(userId)) throw new ForbiddenException();
    if (msg.senderId === userId && participantIds.length > 1) {
      throw new BadRequestException('Le destinataire doit confirmer la sauvegarde locale');
    }

    const expected = this.mediaPayloadFromContent(msg.content);
    if (expected?.size && expected.size !== normalizedSize) {
      return {
        cleared: false,
        ackConfirmed: false,
        mediaDelivery: {
          state: 'LOCAL_SAVE_REJECTED',
          reason: 'SIZE_MISMATCH',
          expectedSize: expected.size,
          receivedSize: normalizedSize,
          serverRetained: true,
        },
      };
    }
    if (expected?.checksum && expected.checksum !== normalizedChecksum) {
      return {
        cleared: false,
        ackConfirmed: false,
        mediaDelivery: {
          state: 'LOCAL_SAVE_REJECTED',
          reason: 'CHECKSUM_MISMATCH',
          expectedChecksum: expected.checksum,
          receivedChecksum: normalizedChecksum,
          serverRetained: true,
        },
      };
    }

    const now = new Date();
    await this.prisma.messageLocalSave.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: {
        messageId,
        userId,
        checksum: normalizedChecksum,
        size: normalizedSize,
        deliveryState: 'ACK_CONFIRMED',
        downloadedAt: now,
        locallySavedAt: now,
        ackConfirmedAt: now,
      } as any,
      update: {
        checksum: normalizedChecksum,
        size: normalizedSize,
        deliveryState: 'ACK_CONFIRMED',
        downloadedAt: now,
        locallySavedAt: now,
        ackConfirmedAt: now,
      } as any,
    });

    const recipientIds = participantIds.filter(id => id !== msg.senderId);
    const ackConfirmedCount = await this.prisma.messageLocalSave.count({
      where: {
        messageId,
        userId: { in: recipientIds.length ? recipientIds : participantIds },
        ...({ deliveryState: 'ACK_CONFIRMED' } as any),
      },
    });
    const requiredAckCount = recipientIds.length ? recipientIds.length : participantIds.length;
    const allRecipientsSaved = requiredAckCount > 0 && ackConfirmedCount >= requiredAckCount;
    const serverFileCleaned = allRecipientsSaved
      ? await this.removeTemporaryUploadedFile(msg.content)
      : false;

    return {
      cleared: false,
      ackConfirmed: true,
      message: msg,
      mediaDelivery: {
        state: 'ACK_CONFIRMED',
        ackConfirmedCount,
        requiredAckCount,
        serverRetained: !serverFileCleaned,
        serverFileCleaned,
      },
    };
  }

  async getPendingMedia(userId: string, limit = 50) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    return this.prisma.message.findMany({
      where: {
        senderId: { not: userId },
        isDeleted: false,
        type: { in: ['image', 'video', 'audio', 'voice', 'file', 'document', 'gif', 'sticker'] },
        conversation: { participants: { some: { userId } } },
        localSaves: {
          none: {
            userId,
            ...({ deliveryState: 'ACK_CONFIRMED' } as any),
          },
        },
      },
      include: {
        sender: { select: { id: true, name: true, username: true, avatar: true } },
        reactions: { select: { emoji: true, userId: true, updatedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
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

  private async rememberMediaDelivered(messageId: string, userId: string) {
    const existing = await this.prisma.messageLocalSave.findUnique({
      where: { messageId_userId: { messageId, userId } },
      select: { deliveryState: true },
    });
    if (existing?.deliveryState === 'ACK_CONFIRMED') return;
    if (existing) {
      await this.prisma.messageLocalSave.update({
        where: { messageId_userId: { messageId, userId } },
        data: { deliveryState: 'DELIVERED' } as any,
      });
      return;
    }
    await this.prisma.messageLocalSave.create({
      data: {
        messageId,
        userId,
        deliveryState: 'DELIVERED',
      } as any,
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
    if (this.isMediaType(msg.type)) await this.rememberMediaDelivered(messageId, receiverId);
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
    if (msg.isDeleted) return msg;
    const hasTemporaryUpload = this.isMediaType(msg.type) && Boolean(this.uploadedFilePathFromContent(msg.content));
    if (hasTemporaryUpload) {
      const temporaryMediaRemoved = await this.removeTemporaryUploadedFile(msg.content);
      if (!temporaryMediaRemoved) {
        throw new BadRequestException('Suppression média temporaire impossible. Réessayez.');
      }
    }
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
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: {
        id: true,
        lastReadAt: true,
        conversation: {
          select: {
            type: true,
            messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
          },
        },
      },
    });
    if (!participant) throw new ForbiddenException();

    if (participant.conversation.type === this.officialConversationType) {
      const latest = participant.conversation.messages?.[0];
      if (!latest) return participant;
      if (participant.lastReadAt && participant.lastReadAt.getTime() >= latest.createdAt.getTime()) {
        return participant;
      }
    }

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

  async getKnownCallableUserIds(userId: string): Promise<string[]> {
    const [contacts, participations] = await Promise.all([
      this.prisma.contact.findMany({
        where: {
          ownerId: userId,
          contactUser: { email: { not: this.officialSystemEmail } },
        },
        select: { contactUserId: true },
      }),
      this.prisma.participant.findMany({
        where: { userId },
        select: {
          conversation: {
            select: {
              type: true,
              participants: {
                select: {
                  userId: true,
                  user: { select: { email: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    return [...new Set([
      ...contacts.map(contact => contact.contactUserId),
      ...participations.flatMap(item => {
        if (item.conversation.type === this.officialConversationType) return [];
        return item.conversation.participants
          .filter(participant => participant.user.email !== this.officialSystemEmail)
          .map(participant => participant.userId);
      }),
    ].filter(id => id && id !== userId))];
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
