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
  private readonly messageStatusRank: Record<string, number> = {
    failed: 0,
    error: 0,
    sending: 1,
    pending: 1,
    queued: 1,
    uploading: 1,
    sent: 2,
    delivered: 3,
    received: 3,
    read: 4,
    seen: 4,
  };
  private readonly maxMessageContentLength = 20_000;
  private readonly officialConversationType = 'official';
  private readonly officialConversationName = 'O.Messenger';
  private readonly officialConversationAvatar = '/icons/oracle-system-avatar.svg';
  private readonly officialSystemEmail = 'system-aura@oracle-messenger.local';
  private readonly officialMessageTtlMs = 24 * 60 * 60 * 1000;
  private readonly groupAdminRole = 'admin';
  private readonly groupMemberRole = 'member';
  private readonly groupPolicyAll = 'ALL_PARTICIPANTS';
  private readonly groupPolicyAdminsOnly = 'ADMINS_ONLY';
  private readonly activeInvitationStatuses = ['PENDING', 'INVITED'];

  private readonly userPublicSelect = {
    id: true,
    email: true,
    name: true,
    username: true,
    avatar: true,
    phone: true,
    status: true,
    lastSeen: true,
  } as const;

  private readonly messageInclude = {
    sender: { select: { id: true, name: true, username: true, avatar: true } },
    replyTo: true,
    reactions: { select: { emoji: true, userId: true, updatedAt: true } },
  } as const;

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

  private normalizeMessageStatus(status?: string | null) {
    const normalized = String(status || 'sent').toLowerCase().trim();
    if (normalized === 'seen') return 'read';
    if (normalized === 'received') return 'delivered';
    if (['sending', 'pending', 'queued', 'uploading'].includes(normalized)) return 'sending';
    if (['failed', 'error'].includes(normalized)) return 'failed';
    if (['sent', 'delivered', 'read'].includes(normalized)) return normalized;
    return 'sent';
  }

  private strongestMessageStatus(current?: string | null, incoming?: string | null) {
    const currentStatus = this.normalizeMessageStatus(current);
    const incomingStatus = this.normalizeMessageStatus(incoming);
    const currentRank = this.messageStatusRank[currentStatus] ?? 0;
    const incomingRank = this.messageStatusRank[incomingStatus] ?? 0;
    return incomingRank >= currentRank ? incomingStatus : currentStatus;
  }

  private normalizeGroupRole(role?: string | null) {
    const normalized = String(role || this.groupMemberRole).toLowerCase().trim();
    return normalized === this.groupAdminRole ? this.groupAdminRole : this.groupMemberRole;
  }

  private isGroupAdmin(participant?: { role?: string | null } | null) {
    return this.normalizeGroupRole(participant?.role) === this.groupAdminRole;
  }

  private normalizeGroupDescription(description?: string | null) {
    const value = String(description ?? '').trim().slice(0, 1200);
    return value || null;
  }

  private normalizeGroupMessagePolicy(policy?: string | null) {
    const value = String(policy ?? this.groupPolicyAll).trim().toUpperCase();
    if (['ADMINS_ONLY', 'ADMIN_ONLY', 'ADMINS'].includes(value)) return this.groupPolicyAdminsOnly;
    return this.groupPolicyAll;
  }

  private participantCanSend(participant: { role?: string | null; canSendMessages?: boolean | null } | null | undefined, policy?: string | null) {
    if (!participant) return false;
    if (participant.canSendMessages === false) return false;
    const normalizedPolicy = this.normalizeGroupMessagePolicy(policy);
    if (normalizedPolicy === this.groupPolicyAdminsOnly) return this.isGroupAdmin(participant);
    return true;
  }

  private normalizeGroupInvitationStatus(status?: string | null) {
    const value = String(status ?? '').trim().toUpperCase();
    if (['INVITED', 'PENDING', 'ACCEPTED', 'DECLINED', 'REMOVED', 'LEFT'].includes(value)) return value;
    return 'PENDING';
  }

  private toGroupInvitationSummary(invitation: any) {
    const conversation = invitation.conversation ?? {};
    return {
      id: invitation.id,
      conversationId: invitation.conversationId,
      invitedUserId: invitation.invitedUserId,
      invitedById: invitation.invitedById,
      status: this.normalizeGroupInvitationStatus(invitation.status),
      respondedAt: invitation.respondedAt,
      cancelledAt: invitation.cancelledAt,
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt,
      group: {
        id: invitation.conversationId,
        name: conversation.name,
        avatar: conversation.avatar,
        description: conversation.description,
      },
      invitedUser: invitation.invitedUser ? {
        ...invitation.invitedUser,
      } : undefined,
      invitedBy: invitation.invitedBy ? {
        ...invitation.invitedBy,
      } : undefined,
    };
  }

  private normalizeGroupName(name?: string | null) {
    const value = String(name ?? '').trim().slice(0, 90);
    if (!value) throw new BadRequestException('Donnez un nom au groupe.');
    return value;
  }

  private normalizeGroupAvatar(avatar?: string | null) {
    const value = String(avatar ?? '').trim().slice(0, 1000);
    return value || null;
  }

  private normalizeMessageContent(content?: string | null) {
    const value = String(content ?? '').trim();
    if (!value) throw new BadRequestException('Message vide');
    if (value.length > this.maxMessageContentLength) {
      throw new BadRequestException('Message trop long');
    }
    return value;
  }

  private normalizeClientMessageId(clientMessageId?: string | null) {
    const value = String(clientMessageId ?? '').trim();
    if (!value) return undefined;
    return value.slice(0, 160);
  }

  private unreadWhere(conversationId: string, userId: string, lastReadAt?: Date | null) {
    const safeLastReadAt = this.safeStoredReadAt(lastReadAt);
    return {
      conversationId,
      senderId: { not: userId },
      isDeleted: false,
      ...(safeLastReadAt ? { createdAt: { gt: safeLastReadAt } } : {}),
    };
  }

  private getOfficialOpenedAt(conv: any) {
    const lastMessage = conv.messages?.[0] ?? null;
    if (conv.type !== this.officialConversationType || !conv.viewerLastReadAt || !lastMessage?.createdAt) return undefined;
    const readAt = new Date(conv.viewerLastReadAt);
    const messageAt = new Date(lastMessage.createdAt);
    if (Number.isNaN(readAt.getTime()) || Number.isNaN(messageAt.getTime())) return undefined;
    if (readAt.getTime() < messageAt.getTime()) return undefined;
    return readAt;
  }

  private getOfficialExpiresAt(conv: any) {
    const readAt = this.getOfficialOpenedAt(conv);
    if (!readAt) return undefined;
    return new Date(readAt.getTime() + this.officialMessageTtlMs);
  }

  private isOfficialExpired(conv: any) {
    const expiresAt = this.getOfficialExpiresAt(conv);
    return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
  }

  private isDedicatedOfficialConversationForViewer(conv: any, userId: string) {
    if (conv?.type !== this.officialConversationType) return true;
    const participants = Array.isArray(conv?.participants) ? conv.participants : [];
    if (!participants.some((participant: any) => participant.userId === userId)) return false;
    if (!participants.some((participant: any) => participant.user?.email === this.officialSystemEmail)) return false;
    const realParticipants = participants.filter((participant: any) => participant.user?.email !== this.officialSystemEmail);
    return realParticipants.length === 1 && realParticipants[0]?.userId === userId;
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
    const systemParticipant = isOfficial
      ? conv.participants.find((pt: any) => pt.user?.email === this.officialSystemEmail)
      : null;
    const viewerParticipant = conv.participants.find((pt: any) => pt.userId === userId);
    const viewerIsGroupAdmin = conv.type === 'group' && this.isGroupAdmin(viewerParticipant);
    const participants = isOfficial
      ? [{
          id: systemParticipant?.userId ?? systemParticipant?.user?.id ?? 'oracle-messenger-official',
          name: this.officialConversationName,
          username: 'o_messenger',
          avatar: this.officialConversationAvatar,
          status: 'online',
          lastSeen: null,
          role: this.groupAdminRole,
          canSendMessages: false,
        }]
      : conv.participants
        .filter((pt: any) => conv.type === 'group' || pt.userId !== userId)
        .map((pt: any) => ({
          ...pt.user,
          role: this.normalizeGroupRole(pt.role),
          canSendMessages: pt.canSendMessages !== false,
          joinedAt: pt.joinedAt,
        }));
    const lastMessage = conv.messages?.[0] ?? null;
    const officialOpenedAt = this.getOfficialOpenedAt(conv)?.toISOString();
    const officialExpiresAt = this.getOfficialExpiresAt(conv)?.toISOString();
    const messagePolicy = this.normalizeGroupMessagePolicy(conv.messagePolicy);
    const pendingInvitations = viewerIsGroupAdmin && Array.isArray(conv.invitations)
      ? conv.invitations.map((invitation: any) => this.toGroupInvitationSummary(invitation))
      : undefined;
    return {
      id: conv.id,
      type: conv.type,
      name: isOfficial ? this.officialConversationName : conv.name,
      avatar: isOfficial ? this.officialConversationAvatar : conv.avatar,
      description: conv.description ?? null,
      messagePolicy,
      participants,
      participantCount: Array.isArray(conv.participants) ? conv.participants.length : participants.length,
      currentUserRole: this.normalizeGroupRole(viewerParticipant?.role),
      currentUserCanSendMessages: conv.type === 'group'
        ? this.participantCanSend(viewerParticipant, messagePolicy)
        : !isOfficial,
      pendingInvitations,
      lastMessage,
      unreadCount,
      isPinned: isOfficial ? true : Boolean(conv.isPinned),
      isOfficial,
      isVerified: isOfficial,
      officialOpenedAt,
      officialExpiresAt,
      officialState: isOfficial ? {
        received: true,
        unread: unreadCount > 0,
        opened_at: officialOpenedAt ?? null,
        expires_at: officialExpiresAt ?? null,
        openedAt: officialOpenedAt ?? null,
        expiresAt: officialExpiresAt ?? null,
      } : undefined,
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
        AND (p."lastReadAt" IS NULL OR p."lastReadAt" > NOW() OR m."createdAt" > p."lastReadAt")
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
            participants: { include: { user: { select: this.userPublicSelect } } },
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
      if (!this.isDedicatedOfficialConversationForViewer(convWithViewer, userId)) return null;
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
        participants: { include: { user: { select: this.userPublicSelect } } },
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
      if (!this.isDedicatedOfficialConversationForViewer(convWithViewer, userId)) return null;
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
        participants: { include: { user: { select: this.userPublicSelect } } },
        invitations: {
          orderBy: { updatedAt: 'desc' },
          include: {
            invitedUser: { select: this.userPublicSelect },
            invitedBy: { select: this.userPublicSelect },
            conversation: { select: { id: true, name: true, avatar: true, description: true } },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { reactions: true } },
      },
    });
    if (!conv) throw new NotFoundException();
    const convWithViewer = { ...conv, viewerLastReadAt: participant.lastReadAt };
    if (!this.isDedicatedOfficialConversationForViewer(convWithViewer, userId)) throw new NotFoundException();
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
        participants: { include: { user: { select: this.userPublicSelect } } },
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
          participants: { include: { user: { select: this.userPublicSelect } } },
          messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { reactions: true } },
        },
      });
    }

    await this.rememberConversationContacts(userId, participantId);

    // Return same shape as getConversations — filter out self from participants
    return this.toConversationSummary(conv, userId, 0);
  }

  private groupSummaryInclude() {
    return {
      participants: { include: { user: { select: this.userPublicSelect } } },
      invitations: {
        orderBy: { updatedAt: 'desc' as const },
        include: {
          invitedUser: { select: this.userPublicSelect },
          invitedBy: { select: this.userPublicSelect },
          conversation: { select: { id: true, name: true, avatar: true, description: true } },
        },
      },
      messages: { take: 1, orderBy: { createdAt: 'desc' as const }, include: { reactions: true } },
    };
  }

  private async loadConversationSummary(conversationId: string, userId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenException('Vous ne faites pas partie de ce groupe.');
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: this.groupSummaryInclude(),
    });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    const unread = await this.prisma.message.count({
      where: this.unreadWhere(conversationId, userId, participant.lastReadAt),
    });
    return this.toConversationSummary({ ...conversation, viewerLastReadAt: participant.lastReadAt }, userId, unread);
  }

  private async createGroupSystemMessage(conversationId: string, senderId: string, content: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const message = await client.message.create({
      data: { conversationId, senderId, content, type: 'system' },
      include: {
        sender: { select: { id: true, name: true, username: true, avatar: true } },
        replyTo: true,
        reactions: { select: { emoji: true, userId: true, updatedAt: true } },
      },
    });
    await client.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return message;
  }

  private invitationInclude() {
    return {
      invitedUser: { select: this.userPublicSelect },
      invitedBy: { select: this.userPublicSelect },
      conversation: { select: { id: true, name: true, avatar: true, description: true } },
    };
  }

  async createGroup(userId: string, dto: { name?: string; participantIds?: string[]; avatar?: string; description?: string }) {
    const name = this.normalizeGroupName(dto?.name || 'Nouveau groupe');
    const candidateIds = Array.isArray(dto?.participantIds) ? dto.participantIds : [];
    const participantIds = [...new Set(candidateIds.map(id => String(id || '').trim()).filter(id => id && id !== userId))].slice(0, 99);
    if (!participantIds.length) throw new BadRequestException('Sélectionnez au moins une personne à inviter.');

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: participantIds },
        email: { not: this.officialSystemEmail },
      },
      select: this.userPublicSelect,
    });
    if (!users.length) throw new BadRequestException('Aucun utilisateur valide à inviter.');

    const result = await this.prisma.$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: { id: userId }, select: this.userPublicSelect });
      const conversation = await tx.conversation.create({
        data: {
          type: 'group',
          name,
          avatar: this.normalizeGroupAvatar(dto?.avatar),
          description: this.normalizeGroupDescription(dto?.description),
          messagePolicy: this.groupPolicyAll,
          participants: {
            create: [{ userId, role: this.groupAdminRole, canSendMessages: true }] as any,
          },
        },
      });

      const invitations = [];
      for (const user of users) {
        invitations.push(await tx.groupInvitation.upsert({
          where: { conversationId_invitedUserId: { conversationId: conversation.id, invitedUserId: user.id } },
          create: {
            conversationId: conversation.id,
            invitedUserId: user.id,
            invitedById: userId,
            status: 'PENDING',
          },
          update: {
            invitedById: userId,
            status: 'PENDING',
            respondedAt: null,
            cancelledAt: null,
          },
          include: this.invitationInclude(),
        }));
      }

      const invitedNames = users.map(user => user.name || user.username).filter(Boolean).slice(0, 6).join(', ');
      const suffix = users.length > 6 ? ` et ${users.length - 6} autre(s)` : '';
      const systemMessage = await this.createGroupSystemMessage(
        conversation.id,
        userId,
        `${actor?.name || 'Un administrateur'} a invité ${invitedNames}${suffix} à rejoindre le groupe.`,
        tx,
      );

      const fullConversation = await tx.conversation.findUnique({
        where: { id: conversation.id },
        include: this.groupSummaryInclude(),
      });
      return { conversation: fullConversation, invitations, systemMessage };
    });

    return {
      conversation: this.toConversationSummary(result.conversation, userId, 0),
      invitations: result.invitations.map(invitation => this.toGroupInvitationSummary(invitation)),
      systemMessage: result.systemMessage,
    };
  }

  async addGroupParticipants(conversationId: string, userId: string, participantIdsInput: string[]) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
    if (!conversation || conversation.type !== 'group') throw new NotFoundException('Groupe introuvable');
    const actor = conversation.participants.find(participant => participant.userId === userId);
    if (!actor) {
      throw new ForbiddenException('Vous ne faites pas partie de ce groupe.');
    }
    if (!this.isGroupAdmin(actor)) throw new ForbiddenException('Seuls les administrateurs peuvent inviter des membres.');

    const existingIds = new Set(conversation.participants.map(participant => participant.userId));
    const candidateIds = Array.isArray(participantIdsInput) ? participantIdsInput : [];
    const participantIds = [...new Set(candidateIds.map(id => String(id || '').trim()).filter(id => id && !existingIds.has(id)))].slice(0, 99);
    if (!participantIds.length) throw new BadRequestException('Aucun nouveau contact à inviter.');

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: participantIds },
        email: { not: this.officialSystemEmail },
      },
      select: this.userPublicSelect,
    });
    if (!users.length) throw new BadRequestException('Aucun utilisateur valide à inviter.');

    const result = await this.prisma.$transaction(async tx => {
      const actorUser = await tx.user.findUnique({ where: { id: userId }, select: this.userPublicSelect });
      const invitations = [];
      for (const user of users) {
        invitations.push(await tx.groupInvitation.upsert({
          where: { conversationId_invitedUserId: { conversationId, invitedUserId: user.id } },
          create: {
            conversationId,
            invitedUserId: user.id,
            invitedById: userId,
            status: 'PENDING',
          },
          update: {
            invitedById: userId,
            status: 'PENDING',
            respondedAt: null,
            cancelledAt: null,
          },
          include: this.invitationInclude(),
        }));
      }

      const invitedNames = users.map(user => user.name || user.username).filter(Boolean).slice(0, 6).join(', ');
      const suffix = users.length > 6 ? ` et ${users.length - 6} autre(s)` : '';
      const systemMessage = await this.createGroupSystemMessage(
        conversationId,
        userId,
        `${actorUser?.name || 'Un administrateur'} a invité ${invitedNames}${suffix} à rejoindre le groupe.`,
        tx,
      );
      const updated = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: this.groupSummaryInclude(),
      });
      return { conversation: updated, invitations, systemMessage };
    });
    return {
      conversation: this.toConversationSummary(result.conversation, userId, 0),
      invitations: result.invitations.map(invitation => this.toGroupInvitationSummary(invitation)),
      systemMessage: result.systemMessage,
    };
  }

  async updateGroup(conversationId: string, userId: string, dto: { name?: string; avatar?: string | null; description?: string | null; messagePolicy?: string }) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
    if (!conversation || conversation.type !== 'group') throw new NotFoundException('Groupe introuvable');
    const actor = conversation.participants.find(participant => participant.userId === userId);
    if (!actor) throw new ForbiddenException('Vous ne faites pas partie de ce groupe.');
    if (!this.isGroupAdmin(actor)) throw new ForbiddenException('Seuls les administrateurs peuvent modifier le groupe.');

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (Object.prototype.hasOwnProperty.call(dto || {}, 'name')) data.name = this.normalizeGroupName(dto.name);
    if (Object.prototype.hasOwnProperty.call(dto || {}, 'avatar')) data.avatar = this.normalizeGroupAvatar(dto.avatar);
    if (Object.prototype.hasOwnProperty.call(dto || {}, 'description')) data.description = this.normalizeGroupDescription(dto.description);
    if (Object.prototype.hasOwnProperty.call(dto || {}, 'messagePolicy')) data.messagePolicy = this.normalizeGroupMessagePolicy(dto.messagePolicy);
    if (Object.keys(data).length <= 1) throw new BadRequestException('Aucune modification à appliquer.');

    const result = await this.prisma.$transaction(async tx => {
      const updated = await tx.conversation.update({
        where: { id: conversationId },
        data: data as any,
        include: this.groupSummaryInclude(),
      });
      let systemMessage: any = null;
      if (Object.prototype.hasOwnProperty.call(data, 'messagePolicy')) {
        const nextPolicy = this.normalizeGroupMessagePolicy(String(data.messagePolicy));
        if (nextPolicy !== this.normalizeGroupMessagePolicy(conversation.messagePolicy)) {
          systemMessage = await this.createGroupSystemMessage(
            conversationId,
            userId,
            nextPolicy === this.groupPolicyAdminsOnly
              ? 'Les administrateurs ont activé le mode de publication réservé aux administrateurs.'
              : 'Tous les participants peuvent maintenant envoyer des messages.',
            tx,
          );
        }
      }
      return { conversation: updated, systemMessage };
    });
    return {
      conversation: this.toConversationSummary(result.conversation, userId, 0),
      systemMessage: result.systemMessage,
    };
  }

  async removeGroupParticipant(conversationId: string, userId: string, participantId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
    if (!conversation || conversation.type !== 'group') throw new NotFoundException('Groupe introuvable');
    const actor = conversation.participants.find(participant => participant.userId === userId);
    if (!actor) throw new ForbiddenException('Vous ne faites pas partie de ce groupe.');
    if (!this.isGroupAdmin(actor)) throw new ForbiddenException('Seuls les administrateurs peuvent retirer un membre.');
    if (participantId === userId) throw new BadRequestException('Utilisez “Supprimer de mon compte” pour quitter le groupe.');

    const target = conversation.participants.find(participant => participant.userId === participantId);
    if (!target) throw new NotFoundException('Membre introuvable dans ce groupe.');
    const adminCount = conversation.participants.filter(participant => this.isGroupAdmin(participant)).length;
    if (this.isGroupAdmin(target) && adminCount <= 1) {
      throw new BadRequestException('Le groupe doit conserver au moins un administrateur.');
    }

    const result = await this.prisma.$transaction(async tx => {
      await tx.participant.delete({ where: { id: target.id } });
      await tx.groupInvitation.upsert({
        where: { conversationId_invitedUserId: { conversationId, invitedUserId: participantId } },
        create: {
          conversationId,
          invitedUserId: participantId,
          invitedById: userId,
          status: 'REMOVED',
          respondedAt: new Date(),
        },
        update: { status: 'REMOVED', respondedAt: new Date(), cancelledAt: new Date() },
      });
      const targetName = target.user?.name || target.user?.email || 'Un membre';
      const systemMessage = await this.createGroupSystemMessage(conversationId, userId, `${targetName} a été retiré du groupe.`, tx);
      const updated = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: this.groupSummaryInclude(),
      });
      return { updated, systemMessage };
    });
    if (!result.updated) throw new NotFoundException('Groupe introuvable');
    return {
      conversation: this.toConversationSummary(result.updated, userId, 0),
      removedUserId: participantId,
      systemMessage: result.systemMessage,
    };
  }

  async setGroupParticipantRole(conversationId: string, userId: string, participantId: string, roleInput: string) {
    const role = this.normalizeGroupRole(roleInput);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
    if (!conversation || conversation.type !== 'group') throw new NotFoundException('Groupe introuvable');
    const actor = conversation.participants.find(participant => participant.userId === userId);
    if (!actor) throw new ForbiddenException('Vous ne faites pas partie de ce groupe.');
    if (!this.isGroupAdmin(actor)) throw new ForbiddenException('Seuls les administrateurs peuvent gérer les rôles.');
    if (participantId === userId) throw new BadRequestException('Votre propre rôle ne peut pas être modifié ici.');

    const target = conversation.participants.find(participant => participant.userId === participantId);
    if (!target) throw new NotFoundException('Membre introuvable dans ce groupe.');
    const adminCount = conversation.participants.filter(participant => this.isGroupAdmin(participant)).length;
    if (this.isGroupAdmin(target) && role !== this.groupAdminRole && adminCount <= 1) {
      throw new BadRequestException('Le groupe doit conserver au moins un administrateur.');
    }

    const result = await this.prisma.$transaction(async tx => {
      await tx.participant.update({
        where: { id: target.id },
        data: { role } as any,
      });
      const targetName = target.user?.name || target.user?.email || 'Un membre';
      const systemMessage = await this.createGroupSystemMessage(
        conversationId,
        userId,
        role === this.groupAdminRole
          ? `${targetName} est maintenant administrateur du groupe.`
          : `${targetName} n'est plus administrateur du groupe.`,
        tx,
      );
      const updated = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: this.groupSummaryInclude(),
      });
      return { updated, systemMessage };
    });
    if (!result.updated) throw new NotFoundException('Groupe introuvable');
    return {
      conversation: this.toConversationSummary(result.updated, userId, 0),
      systemMessage: result.systemMessage,
    };
  }

  async setGroupParticipantPermission(conversationId: string, userId: string, participantId: string, canSendMessagesInput: boolean) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
    if (!conversation || conversation.type !== 'group') throw new NotFoundException('Groupe introuvable');
    const actor = conversation.participants.find(participant => participant.userId === userId);
    if (!actor) throw new ForbiddenException('Vous ne faites pas partie de ce groupe.');
    if (!this.isGroupAdmin(actor)) throw new ForbiddenException('Seuls les administrateurs peuvent gérer les permissions.');
    const target = conversation.participants.find(participant => participant.userId === participantId);
    if (!target) throw new NotFoundException('Membre introuvable dans ce groupe.');
    if (participantId === userId && canSendMessagesInput === false) throw new BadRequestException('Vous ne pouvez pas bloquer votre propre écriture.');

    const result = await this.prisma.$transaction(async tx => {
      await tx.participant.update({
        where: { id: target.id },
        data: { canSendMessages: Boolean(canSendMessagesInput) } as any,
      });
      const targetName = target.user?.name || target.user?.email || 'Un membre';
      const systemMessage = await this.createGroupSystemMessage(
        conversationId,
        userId,
        canSendMessagesInput
          ? `${targetName} peut de nouveau envoyer des messages.`
          : `${targetName} est temporairement en lecture seule.`,
        tx,
      );
      const updated = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: this.groupSummaryInclude(),
      });
      return { updated, systemMessage };
    });
    if (!result.updated) throw new NotFoundException('Groupe introuvable');
    return {
      conversation: this.toConversationSummary(result.updated, userId, 0),
      systemMessage: result.systemMessage,
    };
  }

  async getPendingGroupInvitations(userId: string) {
    const invitations = await this.prisma.groupInvitation.findMany({
      where: {
        invitedUserId: userId,
        status: { in: this.activeInvitationStatuses },
        conversation: { type: 'group' },
      },
      include: this.invitationInclude(),
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return invitations.map(invitation => this.toGroupInvitationSummary(invitation));
  }

  async acceptGroupInvitation(invitationId: string, userId: string) {
    const invitation = await this.prisma.groupInvitation.findUnique({
      where: { id: invitationId },
      include: {
        ...this.invitationInclude(),
        conversation: {
          include: {
            participants: { include: { user: { select: { id: true, email: true, name: true } } } },
          },
        },
      },
    });
    if (!invitation || invitation.invitedUserId !== userId) throw new NotFoundException('Invitation introuvable');
    if (invitation.conversation.type !== 'group') throw new NotFoundException('Groupe introuvable');
    if (!this.activeInvitationStatuses.includes(this.normalizeGroupInvitationStatus(invitation.status))) {
      throw new BadRequestException('Cette invitation n’est plus en attente.');
    }
    if (invitation.conversation.participants.some(participant => participant.userId === userId)) {
      await this.prisma.groupInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      return {
        conversation: await this.loadConversationSummary(invitation.conversationId, userId),
        invitation: this.toGroupInvitationSummary({ ...invitation, status: 'ACCEPTED', respondedAt: new Date() }),
        systemMessage: null,
      };
    }

    const result = await this.prisma.$transaction(async tx => {
      const now = new Date();
      await tx.groupInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED', respondedAt: now, cancelledAt: null },
      });
      await tx.participant.create({
        data: { conversationId: invitation.conversationId, userId, role: this.groupMemberRole, canSendMessages: true } as any,
      });
      const systemMessage = await this.createGroupSystemMessage(
        invitation.conversationId,
        userId,
        `${invitation.invitedUser?.name || 'Un utilisateur'} a rejoint le groupe.`,
        tx,
      );
      const updatedInvitation = await tx.groupInvitation.findUnique({
        where: { id: invitationId },
        include: this.invitationInclude(),
      });
      const updatedConversation = await tx.conversation.findUnique({
        where: { id: invitation.conversationId },
        include: this.groupSummaryInclude(),
      });
      return { updatedInvitation, updatedConversation, systemMessage };
    });

    await this.rememberConversationContacts(invitation.invitedById, userId).catch(() => null);
    return {
      conversation: this.toConversationSummary(result.updatedConversation, userId, 0),
      invitation: this.toGroupInvitationSummary(result.updatedInvitation),
      systemMessage: result.systemMessage,
    };
  }

  async declineGroupInvitation(invitationId: string, userId: string) {
    const invitation = await this.prisma.groupInvitation.findUnique({
      where: { id: invitationId },
      include: this.invitationInclude(),
    });
    if (!invitation || invitation.invitedUserId !== userId) throw new NotFoundException('Invitation introuvable');
    if (!this.activeInvitationStatuses.includes(this.normalizeGroupInvitationStatus(invitation.status))) {
      throw new BadRequestException('Cette invitation n’est plus en attente.');
    }
    const updated = await this.prisma.groupInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED', respondedAt: new Date() },
      include: this.invitationInclude(),
    });
    return { invitation: this.toGroupInvitationSummary(updated) };
  }

  async cancelGroupInvitation(conversationId: string, userId: string, invitationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });
    if (!conversation || conversation.type !== 'group') throw new NotFoundException('Groupe introuvable');
    const actor = conversation.participants.find(participant => participant.userId === userId);
    if (!actor) throw new ForbiddenException('Vous ne faites pas partie de ce groupe.');
    if (!this.isGroupAdmin(actor)) throw new ForbiddenException('Seuls les administrateurs peuvent annuler une invitation.');
    const invitation = await this.prisma.groupInvitation.findUnique({
      where: { id: invitationId },
      include: this.invitationInclude(),
    });
    if (!invitation || invitation.conversationId !== conversationId) throw new NotFoundException('Invitation introuvable');
    if (!this.activeInvitationStatuses.includes(this.normalizeGroupInvitationStatus(invitation.status))) {
      throw new BadRequestException('Cette invitation n’est plus en attente.');
    }

    const result = await this.prisma.$transaction(async tx => {
      const updatedInvitation = await tx.groupInvitation.update({
        where: { id: invitationId },
        data: { status: 'REMOVED', cancelledAt: new Date(), respondedAt: new Date() },
        include: this.invitationInclude(),
      });
      const systemMessage = await this.createGroupSystemMessage(
        conversationId,
        userId,
        `L'invitation de ${invitation.invitedUser?.name || 'ce contact'} a été annulée.`,
        tx,
      );
      const updatedConversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: this.groupSummaryInclude(),
      });
      return { updatedInvitation, updatedConversation, systemMessage };
    });
    return {
      conversation: this.toConversationSummary(result.updatedConversation, userId, 0),
      invitation: this.toGroupInvitationSummary(result.updatedInvitation),
      systemMessage: result.systemMessage,
      invitedUserId: invitation.invitedUserId,
    };
  }

  async leaveGroup(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
    if (!conversation || conversation.type !== 'group') throw new NotFoundException('Groupe introuvable');
    const actor = conversation.participants.find(participant => participant.userId === userId);
    if (!actor) throw new ForbiddenException('Vous ne faites pas partie de ce groupe.');
    const remainingParticipants = conversation.participants.filter(participant => participant.userId !== userId);
    const adminCount = conversation.participants.filter(participant => this.isGroupAdmin(participant)).length;
    if (this.isGroupAdmin(actor) && adminCount <= 1 && remainingParticipants.length > 0) {
      throw new BadRequestException('Nommez un autre administrateur avant de quitter le groupe.');
    }

    const result = await this.prisma.$transaction(async tx => {
      const systemMessage = remainingParticipants.length
        ? await this.createGroupSystemMessage(
            conversationId,
            userId,
            `${actor.user?.name || 'Un membre'} a quitté le groupe.`,
            tx,
          )
        : null;
      await tx.participant.delete({ where: { id: actor.id } });
      await tx.groupInvitation.upsert({
        where: { conversationId_invitedUserId: { conversationId, invitedUserId: userId } },
        create: {
          conversationId,
          invitedUserId: userId,
          invitedById: userId,
          status: 'LEFT',
          respondedAt: new Date(),
        },
        update: { status: 'LEFT', respondedAt: new Date(), cancelledAt: null },
      });
      if (!remainingParticipants.length) {
        await tx.conversation.delete({ where: { id: conversationId } });
        return { systemMessage, remainingParticipantIds: [] as string[] };
      }
      return { systemMessage, remainingParticipantIds: remainingParticipants.map(participant => participant.userId) };
    });
    return {
      conversationId,
      leftUserId: userId,
      systemMessage: result.systemMessage,
      remainingParticipantIds: result.remainingParticipantIds,
    };
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
        participants: { include: { user: { select: { id: true, email: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    });
    if (!conv) throw new NotFoundException();
    const convWithViewer = { ...conv, viewerLastReadAt: participant.lastReadAt };
    if (!this.isDedicatedOfficialConversationForViewer(convWithViewer, userId)) {
      throw new NotFoundException();
    }
    if (this.isOfficialExpired(convWithViewer)) {
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

  async createMessage(conversationId: string, senderId: string, content: string, type = 'text', replyToId?: string, clientMessageId?: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { userId_conversationId: { userId: senderId, conversationId } },
    });
    if (!participant) throw new ForbiddenException();
    const normalizedType = this.normalizeMessageType(type);
    const normalizedContent = this.normalizeMessageContent(content);
    const normalizedClientMessageId = this.normalizeClientMessageId(clientMessageId);

    const convMeta = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, messagePolicy: true },
    });
    if (convMeta?.type === 'group' && !this.participantCanSend(participant, convMeta.messagePolicy)) {
      throw new ForbiddenException(
        this.normalizeGroupMessagePolicy(convMeta.messagePolicy) === this.groupPolicyAdminsOnly
          ? 'Seuls les administrateurs peuvent envoyer des messages dans ce groupe.'
          : 'Vous ne pouvez pas envoyer de message dans ce groupe actuellement.',
      );
    }
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

    if (normalizedClientMessageId) {
      const existing = await this.prisma.message.findFirst({
        where: { senderId, clientMessageId: normalizedClientMessageId },
        include: this.messageInclude,
      });
      if (existing) {
        if (existing.conversationId !== conversationId) {
          throw new BadRequestException('Identifiant local déjà utilisé dans une autre conversation.');
        }
        return existing;
      }
    }

    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        clientMessageId: normalizedClientMessageId,
        content: normalizedContent,
        type: normalizedType,
        replyToId,
      },
      include: this.messageInclude,
    }).catch(async error => {
      if (
        normalizedClientMessageId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.message.findFirst({
          where: { senderId, clientMessageId: normalizedClientMessageId, conversationId },
          include: this.messageInclude,
        });
        if (existing) return existing;
      }
      throw error;
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
    const deliveredMessage = await this.markMessageDelivered(messageId, userId);
    const serverFileCleaned = allRecipientsSaved
      ? await this.removeTemporaryUploadedFile(msg.content)
      : false;

    return {
      cleared: serverFileCleaned,
      ackConfirmed: true,
      message: deliveredMessage,
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
    const existing = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { status: true },
    });
    const nextStatus = this.strongestMessageStatus(existing?.status, status);
    return this.prisma.message.update({
      where: { id: messageId },
      data: { status: nextStatus },
    });
  }

  private async rememberMessageDelivered(messageId: string, userId: string) {
    const existing = await this.prisma.messageLocalSave.findUnique({
      where: { messageId_userId: { messageId, userId } },
      select: { deliveryState: true },
    });
    if (existing?.deliveryState === 'ACK_CONFIRMED') return;
    const deliveredAt = new Date();
    if (existing) {
      await this.prisma.messageLocalSave.update({
        where: { messageId_userId: { messageId, userId } },
        data: {
          deliveryState: 'DELIVERED',
          downloadedAt: deliveredAt,
        } as any,
      });
      return;
    }
    await this.prisma.messageLocalSave.create({
      data: {
        messageId,
        userId,
        deliveryState: 'DELIVERED',
        downloadedAt: deliveredAt,
      } as any,
    });
  }

  private async rememberMessageRead(messageId: string, userId: string, readAt = new Date()) {
    await this.prisma.messageLocalSave.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: {
        messageId,
        userId,
        deliveryState: 'ACK_CONFIRMED',
        downloadedAt: readAt,
        ackConfirmedAt: readAt,
      } as any,
      update: {
        deliveryState: 'ACK_CONFIRMED',
        downloadedAt: readAt,
        ackConfirmedAt: readAt,
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
    await this.rememberMessageDelivered(messageId, receiverId);
    const deliveredStatus = this.strongestMessageStatus(msg.status, 'delivered');
    if (deliveredStatus !== 'delivered') return msg;

    const recipientIds = participantIds.filter(id => id !== msg.senderId);
    const deliveredCount = await this.prisma.messageLocalSave.count({
      where: {
        messageId,
        userId: { in: recipientIds },
        ...({ deliveryState: { in: ['DELIVERED', 'ACK_CONFIRMED'] } } as any),
      },
    });
    if (recipientIds.length > 1 && deliveredCount < recipientIds.length) return msg;

    return this.prisma.message.update({
      where: { id: messageId },
      data: { status: deliveredStatus },
    });
  }

  async markPendingMessagesDeliveredForUser(userId: string, conversationId?: string, limit = 200) {
    const messages = await this.prisma.message.findMany({
      where: {
        ...(conversationId ? { conversationId } : {}),
        senderId: { not: userId },
        isDeleted: false,
        conversation: { participants: { some: { userId } } },
        localSaves: {
          none: {
            userId,
            ...({ deliveryState: { in: ['DELIVERED', 'ACK_CONFIRMED'] } } as any),
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 500)),
      select: { id: true },
    });

    const updated: Array<{ id: string; conversationId: string; status?: string; updatedAt?: Date | string }> = [];
    for (const item of messages.reverse()) {
      const message = await this.markMessageDelivered(item.id, userId).catch(() => null);
      if (message) {
        updated.push({
          id: message.id,
          conversationId: message.conversationId,
          status: message.status,
          updatedAt: message.updatedAt,
        });
      }
    }
    return updated;
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

  async markConversationRead(conversationId: string, readerId: string, readUpToMessageId?: string) {
    const readAt = await this.resolveReadBoundary(conversationId, readerId, readUpToMessageId);
    if (readAt === null) return [];
    const participant = await this.markRead(conversationId, readerId, readAt);
    const effectiveReadAt = participant.lastReadAt;
    if (!effectiveReadAt) return [];

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: readerId },
        status: { not: 'read' },
        isDeleted: false,
        createdAt: { lte: effectiveReadAt },
      },
      select: { id: true, senderId: true, createdAt: true },
    });

    await Promise.all(messages.map(message => this.rememberMessageRead(message.id, readerId, effectiveReadAt)));

    const participants = await this.prisma.participant.findMany({
      where: { conversationId },
      select: { userId: true, lastReadAt: true },
    });

    const readMessageIds = messages
      .filter(message => {
        const recipients = participants.filter(participant => participant.userId !== message.senderId);
        return recipients.length > 0 && recipients.every(participant => {
          const participantReadAt = this.safeStoredReadAt(participant.lastReadAt);
          return participantReadAt && participantReadAt.getTime() >= message.createdAt.getTime();
        });
      })
      .map(message => message.id);

    if (!readMessageIds.length) return [];

    await this.prisma.message.updateMany({
      where: { id: { in: readMessageIds }, status: { not: 'read' } },
      data: { status: 'read' },
    });

    return this.prisma.message.findMany({
      where: { id: { in: readMessageIds } },
      select: { id: true, conversationId: true, status: true, updatedAt: true },
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

  async updateMediaMessageContent(messageId: string, userId: string, content: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException();
    if (msg.senderId !== userId) throw new ForbiddenException();
    if (msg.isDeleted) throw new ForbiddenException('Message supprimé');
    if (!this.isMediaType(msg.type)) throw new BadRequestException('Seuls les messages média peuvent être finalisés');
    const normalizedContent = this.normalizeMessageContent(content);
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: normalizedContent },
      include: this.messageInclude,
    });
    await this.prisma.conversation.update({ where: { id: updated.conversationId }, data: { updatedAt: new Date() } });
    return updated;
  }

  private clampReadBoundary(readAt?: Date | null) {
    const now = new Date();
    if (!readAt) return now;
    const value = readAt instanceof Date ? readAt : new Date(readAt);
    if (Number.isNaN(value.getTime())) return now;
    return value.getTime() > now.getTime() ? now : value;
  }

  private safeStoredReadAt(readAt?: Date | null) {
    if (!readAt) return null;
    const value = readAt instanceof Date ? readAt : new Date(readAt);
    if (Number.isNaN(value.getTime())) return null;
    return value.getTime() > Date.now() ? null : value;
  }

  private async resolveReadBoundary(conversationId: string, userId: string, readUpToMessageId?: string) {
    if (readUpToMessageId) {
      const target = await this.prisma.message.findUnique({
        where: { id: readUpToMessageId },
        select: { conversationId: true, senderId: true, isDeleted: true, createdAt: true },
      });
      if (!target || target.conversationId !== conversationId || target.isDeleted) {
        throw new BadRequestException('Message de lecture invalide');
      }
      if (target.senderId === userId) return null;
      return this.clampReadBoundary(target.createdAt);
    }

    const latestIncoming = await this.prisma.message.findFirst({
      where: {
        conversationId,
        senderId: { not: userId },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return latestIncoming?.createdAt ? this.clampReadBoundary(latestIncoming.createdAt) : new Date();
  }

  async markRead(conversationId: string, userId: string, readAt?: Date) {
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

    const nextReadAt = this.clampReadBoundary(readAt ?? participant.conversation.messages?.[0]?.createdAt ?? new Date());
    const currentReadAt = this.safeStoredReadAt(participant.lastReadAt);
    if (currentReadAt && currentReadAt.getTime() >= nextReadAt.getTime()) {
      return participant;
    }

    if (participant.conversation.type === this.officialConversationType) {
      const latest = participant.conversation.messages?.[0];
      if (!latest) return participant;
      if (currentReadAt && currentReadAt.getTime() >= latest.createdAt.getTime()) {
        return participant;
      }
    }

    return this.prisma.participant.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: { lastReadAt: nextReadAt },
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

  async getParticipantPresence(conversationId: string) {
    const parts = await this.prisma.participant.findMany({
      where: { conversationId },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            status: true,
            lastSeen: true,
          },
        },
      },
    });
    return parts.map(part => ({
      userId: part.userId,
      status: part.user?.status ?? 'offline',
      lastSeen: part.user?.lastSeen ?? null,
    }));
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

  async getExistingCallableUserIds(userIds: string[], requesterId: string): Promise<string[]> {
    const ids = [...new Set((userIds ?? []).filter(id => id && id !== requesterId))];
    if (!ids.length) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        email: { not: this.officialSystemEmail },
      },
      select: { id: true },
    });
    return users.map(user => user.id);
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
