import { Injectable, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SocketStateService } from '../gateway/socket-state.service';
import * as os from 'os';

@Injectable()
export class AdminService {
  private pwaInstalls = new Set<string>(); // userId → installé

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private socketState: SocketStateService,
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

        const msg = await this.prisma.message.create({
          data: {
            conversationId: conv.id,
            senderId: adminId,
            content,
            type: 'text',
            status: 'sent',
          },
          include: { sender: { select: { id:true, name:true, username:true, avatar:true } } },
        });

        // Émettre en temps réel via socket si l'utilisateur est connecté
        this.socketState.emitToUser(user.id, 'message:new', msg);
        // Émettre aussi dans la room de la conversation
        this.socketState.server?.to(`conv:${conv.id}`).emit('message:new', msg);

        sent++;
      } catch {}
    }

    // Push notification pour les utilisateurs hors ligne
    await this.notifications.sendToAll({ title: 'Oracle Messenger', body: content }).catch(() => {});

    return { success: true, sent, total: users.length };
  }

  // ── Statistiques par pays (basé sur l'indicatif du numéro de téléphone) ────
  async getCountryStats() {
    const users = await this.prisma.user.findMany({
      select: { phone: true, status: true },
      where: { phone: { not: null } },
    });

    // Mapping indicatif → pays
    const DIAL_MAP: Record<string, string> = {
      '+225': "Côte d'Ivoire", '+237': 'Cameroun', '+221': 'Sénégal',
      '+223': 'Mali', '+226': 'Burkina Faso', '+224': 'Guinée',
      '+228': 'Togo', '+229': 'Bénin', '+227': 'Niger',
      '+243': 'Congo (RDC)', '+242': 'Congo', '+241': 'Gabon',
      '+33': 'France', '+32': 'Belgique', '+41': 'Suisse',
      '+1': 'USA/Canada', '+44': 'Royaume-Uni', '+49': 'Allemagne',
      '+234': 'Nigeria', '+233': 'Ghana', '+254': 'Kenya',
      '+27': 'Afrique du Sud', '+212': 'Maroc', '+213': 'Algérie',
      '+216': 'Tunisie', '+20': 'Égypte', '+91': 'Inde',
      '+86': 'Chine', '+55': 'Brésil', '+52': 'Mexique',
      '+34': 'Espagne', '+39': 'Italie', '+351': 'Portugal',
      '+7': 'Russie', '+380': 'Ukraine', '+90': 'Turquie',
      '+966': 'Arabie Saoudite', '+971': 'Émirats arabes',
    };

    const countryMap = new Map<string, { count: number; online: number }>();

    for (const user of users) {
      if (!user.phone) continue;
      // Trouver l'indicatif le plus long qui correspond
      const match = Object.keys(DIAL_MAP)
        .filter(d => user.phone!.startsWith(d))
        .sort((a, b) => b.length - a.length)[0];
      const country = match ? DIAL_MAP[match] : 'Autre';
      const existing = countryMap.get(country) ?? { count: 0, online: 0 };
      existing.count++;
      if (user.status === 'online') existing.online++;
      countryMap.set(country, existing);
    }

    return Array.from(countryMap.entries())
      .map(([country, stats]) => ({ country, ...stats }))
      .sort((a, b) => b.count - a.count);
  }
}
