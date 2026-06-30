import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService) {}

  async create(authorId: string, dto: { content: string; caption?: string; type: string; bg: string }) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.prisma.story.create({
      data: { authorId, content: dto.content, caption: dto.caption, type: dto.type, bg: dto.bg, expiresAt },
      include: { author: { select: { id: true, name: true, avatar: true } }, views: true },
    });
  }

  async findAll(requesterId: string) {
    const now = new Date();
    const stories = await this.prisma.story.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        views: { select: { userId: true } },
      },
    });
    return stories.map(s => ({
      ...s,
      views: s.views.map(v => v.userId),
      seen: s.views.some(v => v.userId === requesterId),
    }));
  }

  async markViewed(storyId: string, userId: string) {
    await this.prisma.storyView.upsert({
      where: { storyId_userId: { storyId, userId } },
      create: { storyId, userId },
      update: { viewedAt: new Date() },
    });
  }

  async delete(storyId: string, authorId: string) {
    await this.prisma.story.deleteMany({ where: { id: storyId, authorId } });
  }
}
