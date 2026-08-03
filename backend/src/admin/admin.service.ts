import { Injectable, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SocketStateService } from '../gateway/socket-state.service';
import * as os from 'os';

@Injectable()
export class AdminService {
  private lastCpuSnapshot: { idle: number; total: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private socketState: SocketStateService,
  ) {}

  async getStats() {
    const [totalUsers, premiumUsers, totalMessages, totalConversations, pwaInstalls] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isPremium: true } }),
      this.prisma.message.count({ where: { isDeleted: false } }),
      this.prisma.conversation.count(),
      this.prisma.pwaInstall.count(),
    ]);
    const onlineUsers = this.socketState.getOnlineUserIds().length;
    return {
      totalUsers,
      premiumUsers,
      totalMessages,
      totalConversations,
      onlineUsers,
      pwaInstalls,
    };
  }

  getMetrics() {
    const cpu = this.getInstantCpuUsage();
    const load = os.loadavg()[0] ?? 0;
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    return {
      cpu,
      ramUsed: Math.round(usedMem / 1024 / 1024),
      ramTotal: Math.round(totalMem / 1024 / 1024),
      ramPct: Math.round((usedMem / totalMem) * 100),
      uptime: Math.round(os.uptime()),
      platform: os.platform(),
      loadAvg1m: Number(load.toFixed(2)),
    };
  }

  private getCpuSnapshot() {
    return os.cpus().reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      return { idle: acc.idle + cpu.times.idle, total: acc.total + total };
    }, { idle: 0, total: 0 });
  }

  private getInstantCpuUsage() {
    const current = this.getCpuSnapshot();
    const previous = this.lastCpuSnapshot;
    this.lastCpuSnapshot = current;
    if (!previous) return 0;
    const idleDelta = current.idle - previous.idle;
    const totalDelta = current.total - previous.total;
    if (totalDelta <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
  }

  async getRecentUsers(limit = 50) {
    const liveIds = new Set(this.socketState.getOnlineUserIds());
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id:true, name:true, email:true, isPremium:true, status:true, createdAt:true, pushToken:true },
    });
    return users.map(user => ({
      ...user,
      status: liveIds.has(user.id) ? 'online' : 'offline',
    }));
  }

  async sendPushToAll(payload: { title: string; body: string; url?: string }) {
    await this.notifications.sendToAll(payload);
    return { success: true, message: 'Notification envoyée à tous les utilisateurs' };
  }

  async trackPwaInstall(userId?: string, userAgent?: string) {
    if (!userId) return { tracked: false, total: await this.prisma.pwaInstall.count() };
    await this.prisma.pwaInstall.upsert({
      where: { userId },
      update: { userAgent },
      create: { userId, userAgent },
    });
    return { tracked: true, total: await this.prisma.pwaInstall.count() };
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
      select: { id: true, phone: true, status: true },
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
      if (this.socketState.hasUserSockets(user.id)) existing.online++;
      countryMap.set(country, existing);
    }

    return Array.from(countryMap.entries())
      .map(([country, stats]) => ({ country, ...stats }))
      .sort((a, b) => b.count - a.count);
  }
}
