import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SocketStateService } from '../gateway/socket-state.service';

type StoryInteractionRow = {
  id: string;
  storyId: string;
  userId: string;
  type: string;
  content: string | null;
  emoji: string | null;
  createdAt: Date;
  name: string | null;
  username: string | null;
  avatar: string | null;
};

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);
  private readonly officialSystemEmail = 'system-aura@oracle-messenger.local';
  private readonly visibleAuthorCache = new Map<string, { ids: string[]; at: number }>();
  private readonly visibleAuthorCacheMs = 15_000;

  constructor(
    private prisma: PrismaService,
    private socketState: SocketStateService,
  ) {}

  private async visibleAuthorIds(userId: string, useCache = true) {
    const cached = this.visibleAuthorCache.get(userId);
    if (useCache && cached && Date.now() - cached.at < this.visibleAuthorCacheMs) {
      return cached.ids;
    }
    const [conversationParticipants, contacts, contactedBy] = await Promise.all([
      this.prisma.participant.findMany({
        where: {
          userId: { not: userId },
          conversation: {
            type: { in: ['direct', 'group'] },
            participants: { some: { userId } },
          },
          user: { email: { not: this.officialSystemEmail } },
        },
        select: { userId: true },
      }),
      this.prisma.contact.findMany({
        where: {
          ownerId: userId,
          contactUser: { email: { not: this.officialSystemEmail } },
        },
        select: { contactUserId: true },
      }),
      this.prisma.contact.findMany({
        where: {
          contactUserId: userId,
          owner: { email: { not: this.officialSystemEmail } },
        },
        select: { ownerId: true },
      }),
    ]);

    const ids = [...new Set([
      userId,
      ...conversationParticipants.map(p => p.userId),
      ...contacts.map(c => c.contactUserId),
      ...contactedBy.map(c => c.ownerId),
    ])];
    this.visibleAuthorCache.set(userId, { ids, at: Date.now() });
    return ids;
  }

  private async emitStoryChanged(authorId: string, storyId: string, action: 'created' | 'deleted' | 'interacted') {
    const audienceIds = await this.visibleAuthorIds(authorId, false);
    const payload = {
      action,
      storyId,
      authorId,
      at: new Date().toISOString(),
    };
    for (const userId of audienceIds) {
      this.socketState.emitToUser(userId, 'story:changed', payload);
    }
    this.logger.log(`story:${action} storyId=${storyId} authorId=${authorId} audience=${audienceIds.length}`);
  }

  private async storyInteractions(storyIds: string[]) {
    if (!storyIds.length) return [];
    return this.prisma.$queryRaw<StoryInteractionRow[]>`
      SELECT
        si."id",
        si."storyId",
        si."userId",
        si."type",
        si."content",
        si."emoji",
        si."createdAt",
        u."name",
        u."username",
        u."avatar"
      FROM "StoryInteraction" si
      INNER JOIN "User" u ON u."id" = si."userId"
      WHERE si."storyId" IN (${Prisma.join(storyIds)})
      ORDER BY si."createdAt" DESC
    `;
  }

  async create(authorId: string, dto: { content: string; caption?: string; type: string; bg: string }) {
    const type = dto.type === 'image' ? 'image' : dto.type === 'text' ? 'text' : dto.type === 'video' ? 'video' : '';
    if (!type) throw new BadRequestException('Type de story invalide');

    const content = String(dto.content ?? '').trim();
    if (!content) throw new BadRequestException('Contenu de story requis');
    if (type === 'text' && content.length > 200) throw new BadRequestException('Texte trop long');
    if (type === 'image') {
      if (!content.startsWith('data:image/')) throw new BadRequestException('Image invalide');
      if (content.length > 7_000_000) throw new BadRequestException('Image trop lourde');
    }
    if (type === 'video') {
      const isUploadedUrl = /^https?:\/\/.+/i.test(content);
      const isInlineVideo = content.startsWith('data:video/');
      if (!isUploadedUrl && !isInlineVideo) throw new BadRequestException('Vidéo invalide');
      if (isInlineVideo && content.length > 35_000_000) throw new BadRequestException('Vidéo trop lourde');
    }

    const caption = dto.caption ? String(dto.caption).trim().slice(0, 120) : undefined;
    const bg = /^#[0-9a-fA-F]{6}$/.test(dto.bg ?? '') ? dto.bg : '#102A2A';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const story = await this.prisma.story.create({
      data: { authorId, content, caption, type, bg, expiresAt },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        views: {
          select: {
            userId: true,
            viewedAt: true,
            user: { select: { id: true, name: true, username: true, avatar: true } },
          },
          orderBy: { viewedAt: 'desc' },
        },
      },
    });
    await this.emitStoryChanged(authorId, story.id, 'created').catch(error => {
      this.logger.warn(`story:created emit failed storyId=${story.id} authorId=${authorId}: ${error?.message ?? error}`);
    });
    return story;
  }

  async findAll(requesterId: string) {
    const now = new Date();
    const visibleAuthorIds = await this.visibleAuthorIds(requesterId);
    const stories = await this.prisma.story.findMany({
      where: {
        expiresAt: { gt: now },
        authorId: { in: visibleAuthorIds },
      },
      orderBy: { createdAt: 'desc' },
      take: 160,
      select: {
        id: true,
        authorId: true,
        content: true,
        caption: true,
        type: true,
        bg: true,
        expiresAt: true,
        createdAt: true,
        author: { select: { id: true, name: true, avatar: true } },
      },
    });
    const storyIds = stories.map(story => story.id);
    if (!storyIds.length) return [];

    const ownStoryIds = stories.filter(story => story.authorId === requesterId).map(story => story.id);
    const [viewCounts, requesterViews, ownStoryViews, storyInteractions] = await Promise.all([
      this.prisma.storyView.groupBy({
        by: ['storyId'],
        where: { storyId: { in: storyIds } },
        _count: { _all: true },
      }),
      this.prisma.storyView.findMany({
        where: { storyId: { in: storyIds }, userId: requesterId },
        select: { storyId: true },
      }),
      ownStoryIds.length
        ? this.prisma.storyView.findMany({
          where: { storyId: { in: ownStoryIds }, userId: { not: requesterId } },
          select: {
            storyId: true,
            userId: true,
            viewedAt: true,
            user: { select: { id: true, name: true, username: true, avatar: true } },
          },
          orderBy: { viewedAt: 'desc' },
        })
        : Promise.resolve([]),
      this.storyInteractions(storyIds).catch(error => {
        this.logger.warn(`story:interactions unavailable: ${error?.message ?? error}`);
        return [] as StoryInteractionRow[];
      }),
    ]);

    const viewCountByStory = new Map(viewCounts.map(item => [item.storyId, item._count._all]));
    const seenStoryIds = new Set(requesterViews.map(view => view.storyId));
    const viewersByStory = new Map<string, typeof ownStoryViews>();
    for (const view of ownStoryViews) {
      const current = viewersByStory.get(view.storyId) || [];
      current.push(view);
      viewersByStory.set(view.storyId, current);
    }
    const interactionsByStory = new Map<string, StoryInteractionRow[]>();
    for (const interaction of storyInteractions) {
      const current = interactionsByStory.get(interaction.storyId) || [];
      current.push(interaction);
      interactionsByStory.set(interaction.storyId, current);
    }

    return stories.map(s => {
      const mine = s.authorId === requesterId;
      const audienceViews = mine ? viewersByStory.get(s.id) || [] : [];
      const seen = seenStoryIds.has(s.id);
      const interactions = interactionsByStory.get(s.id) || [];
      const likes = interactions.filter(item => item.type === 'like');
      const comments = interactions.filter(item => item.type === 'comment');
      const reactions = interactions.filter(item => item.type === 'reaction');
      const requesterInteraction = interactions.find(item => item.userId === requesterId && ['like', 'reaction'].includes(item.type));
      return {
      ...s,
      views: mine ? audienceViews.map(v => v.userId) : seen ? [requesterId] : [],
      viewCount: viewCountByStory.get(s.id) || 0,
      likeCount: likes.length,
      commentCount: comments.length,
      reactionCount: reactions.length,
      myReaction: requesterInteraction ? { type: requesterInteraction.type, emoji: requesterInteraction.emoji } : null,
      interactions: (mine ? interactions : interactions.slice(0, 12)).map(item => ({
        id: item.id,
        type: item.type,
        content: item.content,
        emoji: item.emoji,
        createdAt: item.createdAt,
        user: {
          id: item.userId,
          name: item.name,
          username: item.username,
          avatar: item.avatar,
        },
      })),
      viewers: mine
        ? audienceViews.map(v => ({
            id: v.user.id,
            name: v.user.name,
            username: v.user.username,
            avatar: v.user.avatar,
            viewedAt: v.viewedAt,
          }))
        : [],
      seen,
    };
    });
  }

  async markViewed(storyId: string, userId: string) {
    const visibleAuthorIds = await this.visibleAuthorIds(userId);
    const exists = await this.prisma.story.findFirst({
      where: {
        id: storyId,
        expiresAt: { gt: new Date() },
        authorId: { in: visibleAuthorIds },
      },
      select: { id: true, authorId: true },
    });
    if (!exists) throw new NotFoundException('Story introuvable');
    if (exists.authorId === userId) return { ok: true, ownStory: true };
    await this.prisma.storyView.upsert({
      where: { storyId_userId: { storyId, userId } },
      create: { storyId, userId },
      update: { viewedAt: new Date() },
    });
    this.socketState.emitToUser(exists.authorId, 'story:viewed', {
      storyId,
      authorId: exists.authorId,
      viewerId: userId,
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  async interact(storyId: string, userId: string, dto: { type?: string; content?: string; emoji?: string }) {
    const visibleAuthorIds = await this.visibleAuthorIds(userId);
    const story = await this.prisma.story.findFirst({
      where: {
        id: storyId,
        expiresAt: { gt: new Date() },
        authorId: { in: visibleAuthorIds },
      },
      select: { id: true, authorId: true },
    });
    if (!story) throw new NotFoundException('Story introuvable');
    if (story.authorId === userId) throw new ForbiddenException('Interaction indisponible sur votre propre story');

    const type = String(dto.type || '').trim().toLowerCase();
    if (!['like', 'reaction', 'comment'].includes(type)) {
      throw new BadRequestException('Type d’interaction invalide');
    }
    const content = String(dto.content || '').trim().slice(0, 240);
    const emoji = String(dto.emoji || '').trim().slice(0, 16);
    if (type === 'comment' && !content) throw new BadRequestException('Commentaire requis');
    if (type === 'reaction' && !emoji) throw new BadRequestException('Emoji requis');

    if (type === 'like') {
      await this.prisma.$executeRaw`
        DELETE FROM "StoryInteraction"
        WHERE "storyId" = ${storyId} AND "userId" = ${userId} AND "type" = 'like'
      `;
    }
    if (type === 'reaction') {
      await this.prisma.$executeRaw`
        DELETE FROM "StoryInteraction"
        WHERE "storyId" = ${storyId} AND "userId" = ${userId} AND "type" = 'reaction'
      `;
    }
    await this.prisma.$executeRaw`
      INSERT INTO "StoryInteraction" ("id", "storyId", "userId", "type", "content", "emoji", "createdAt")
      VALUES (${randomUUID()}, ${storyId}, ${userId}, ${type}, ${type === 'comment' ? content : null}, ${type === 'reaction' ? emoji : null}, NOW())
    `;
    this.socketState.emitToUser(story.authorId, 'story:interacted', {
      storyId,
      authorId: story.authorId,
      userId,
      type,
      at: new Date().toISOString(),
    });
    await this.emitStoryChanged(story.authorId, storyId, 'interacted').catch(error => {
      this.logger.warn(`story:interacted emit failed storyId=${storyId} authorId=${story.authorId}: ${error?.message ?? error}`);
    });
    return { ok: true };
  }

  async delete(storyId: string, authorId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId }, select: { authorId: true } });
    if (!story) throw new NotFoundException('Story introuvable');
    if (story.authorId !== authorId) throw new ForbiddenException('Suppression non autorisée');
    await this.prisma.story.delete({ where: { id: storyId } });
    await this.emitStoryChanged(authorId, storyId, 'deleted').catch(error => {
      this.logger.warn(`story:deleted emit failed storyId=${storyId} authorId=${authorId}: ${error?.message ?? error}`);
    });
  }
}
