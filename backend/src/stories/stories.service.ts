import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

  private async visibleAuthorIds(userId: string) {
    const [participants, contacts] = await Promise.all([
      this.prisma.participant.findMany({
        where: {
          userId: { not: userId },
          conversation: {
            participants: { some: { userId } },
          },
        },
        select: { userId: true },
      }),
      this.prisma.contact.findMany({
        where: { ownerId: userId },
        select: { contactUserId: true },
      }),
    ]);

    return [...new Set([
      userId,
      ...participants.map(p => p.userId),
      ...contacts.map(c => c.contactUserId),
    ])];
  }

  async create(authorId: string, dto: { content: string; caption?: string; type: string; bg: string }) {
    const type = dto.type === 'image' ? 'image' : dto.type === 'text' ? 'text' : '';
    if (!type) throw new BadRequestException('Type de story invalide');

    const content = String(dto.content ?? '').trim();
    if (!content) throw new BadRequestException('Contenu de story requis');
    if (type === 'text' && content.length > 200) throw new BadRequestException('Texte trop long');
    if (type === 'image') {
      if (!content.startsWith('data:image/')) throw new BadRequestException('Image invalide');
      if (content.length > 7_000_000) throw new BadRequestException('Image trop lourde');
    }

    const caption = dto.caption ? String(dto.caption).trim().slice(0, 120) : undefined;
    const bg = /^#[0-9a-fA-F]{6}$/.test(dto.bg ?? '') ? dto.bg : '#102A2A';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.story.create({
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
    return stories.map(s => {
      const audienceViews = s.views.filter(v => v.userId !== s.authorId);
      return {
      ...s,
      views: audienceViews.map(v => v.userId),
      viewCount: audienceViews.length,
      viewers: s.authorId === requesterId
        ? audienceViews.map(v => ({
            id: v.user.id,
            name: v.user.name,
            username: v.user.username,
            avatar: v.user.avatar,
            viewedAt: v.viewedAt,
          }))
        : [],
      seen: audienceViews.some(v => v.userId === requesterId),
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
    return { ok: true };
  }

  async delete(storyId: string, authorId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId }, select: { authorId: true } });
    if (!story) throw new NotFoundException('Story introuvable');
    if (story.authorId !== authorId) throw new ForbiddenException('Suppression non autorisée');
    await this.prisma.story.delete({ where: { id: storyId } });
  }
}
