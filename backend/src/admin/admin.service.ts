import { Injectable, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as os from 'os';

@Injectable()
export class AdminService {
  private pwaInstalls = new Set<string>(); // userId → installé

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async getStats() {
    const [totalUsers, premiumUsers, totalMessages, totalConversations, onlineUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isPremium: true } }),
      this.prisma.message.count({ where: { isDeleted: false } }),
      this.prisma.conversation.count(),
      this.prisma.user.count({ where: { status: 'online' } }),
    ]);
    return {
      totalUsers,
      premiumUsers,
      totalMessages,
      totalConversations,
      onlineUsers,
      pwaInstalls: this.pwaInstalls.size,
    };
  }

  getMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return acc + ((total - cpu.times.idle) / total) * 100;
    }, 0) / cpus.length;
    return {
      cpu: Math.round(cpuUsage),
      ramUsed: Math.round(usedMem / 1024 / 1024),
      ramTotal: Math.round(totalMem / 1024 / 1024),
      ramPct: Math.round((usedMem / totalMem) * 100),
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
    };
  }

  async getRecentUsers(limit = 50) {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id:true, name:true, email:true, isPremium:true, status:true, createdAt:true, pushToken:true },
    });
  }

  async sendPushToAll(payload: { title: string; body: string; url?: string }) {
    await this.notifications.sendToAll(payload);
    return { success: true, message: 'Notification envoyée à tous les utilisateurs' };
  }

  trackPwaInstall(userId?: string) {
    if (userId) this.pwaInstalls.add(userId);
    return { tracked: true, total: this.pwaInstalls.size };
  }

  async broadcastSalesMessage(adminId: string, content: string, mediaUrl?: string) {
    // Get or create a "Oracle Officiel" conversation for each user
    const users = await this.prisma.user.findMany({
      where: { id: { not: adminId } },
      select: { id: true },
    });

    let sent = 0;
    for (const user of users) {
      try {
        // Find existing direct conv between admin and user
        let conv = await this.prisma.conversation.findFirst({
          where: {
            type: 'direct',
            participants: { every: { userId: { in: [adminId, user.id] } } },
          },
          include: { participants: true },
        });

        if (!conv) {
          conv = await this.prisma.conversation.create({
            data: {
              type: 'direct',
              participants: {
                create: [{ userId: adminId }, { userId: user.id }],
              },
            },
            include: { participants: true },
          });
        }

        await this.prisma.message.create({
          data: {
            conversationId: conv.id,
            senderId: adminId,
            content,
            type: 'text',
            status: 'sent',
          },
        });
        sent++;
      } catch {}
    }

    // Also send push notification
    await this.notifications.sendToAll({ title: 'Oracle Messenger', body: content }).catch(() => {});

    return { success: true, sent, total: users.length };
  }
}
