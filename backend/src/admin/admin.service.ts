import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SocketStateService } from '../gateway/socket-state.service';
import * as os from 'os';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private lastCpuSnapshot: { idle: number; total: number } | null = null;
  private readonly officialConversationName = 'O.messenger';
  private readonly officialConversationAvatar = '/icons/oracle-system-avatar.svg';
  private readonly officialSystemEmail = 'system-aura@oracle-messenger.local';
  private readonly realUserWhere = { email: { not: this.officialSystemEmail } };

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private socketState: SocketStateService,
  ) {}

  async getStats() {
    const [totalUsers, premiumUsers, totalMessages, totalConversations, pwaInstalls] = await Promise.all([
      this.prisma.user.count({ where: this.realUserWhere }),
      this.prisma.user.count({ where: { ...this.realUserWhere, isPremium: true } }),
      this.prisma.message.count({ where: { isDeleted: false } }),
      this.prisma.conversation.count(),
      this.prisma.pwaInstall.count(),
    ]);
    const onlineUserIds = this.socketState.getOnlineUserIds();
    const onlineUsers = await this.prisma.user.count({
      where: { ...this.realUserWhere, id: { in: onlineUserIds.length ? onlineUserIds : [''] } },
    });
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
      where: this.realUserWhere,
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

  private toOfficialConversationSummary(conv: any, userId: string, unreadCount = 1) {
    const others = conv.participants.filter((pt: any) => pt.userId !== userId).map((pt: any) => pt.user);
    return {
      id: conv.id,
      type: conv.type,
      name: this.officialConversationName,
      avatar: this.officialConversationAvatar,
      participants: others,
      lastMessage: conv.messages?.[0] ?? null,
      unreadCount,
      isPinned: true,
      isOfficial: true,
      isVerified: true,
      updatedAt: conv.updatedAt,
    };
  }

  private async getOrCreateOfficialSystemUser() {
    return this.prisma.user.upsert({
      where: { email: this.officialSystemEmail },
      update: {
        name: this.officialConversationName,
        username: 'o_messenger',
        avatar: this.officialConversationAvatar,
        status: 'online',
      },
      create: {
        googleId: 'system-aura-messenger',
        email: this.officialSystemEmail,
        name: this.officialConversationName,
        username: 'o_messenger',
        avatar: this.officialConversationAvatar,
        status: 'online',
      },
    });
  }

  async broadcastSalesMessage(adminId: string, content: string, mediaUrl?: string, type = 'text') {
    const systemUser = await this.getOrCreateOfficialSystemUser();
    const cleanText = content?.trim() || '';
    const cleanMediaUrl = mediaUrl?.trim() || '';
    if (!cleanText && !cleanMediaUrl) return { success: false, sent: 0, failed: 0, total: 0, message: 'Contenu requis' };

    // Get or create one official O.messenger conversation for each user.
    const users = await this.prisma.user.findMany({
      where: { id: { not: systemUser.id } },
      select: { id: true },
    });

    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        let conv = await this.prisma.conversation.findFirst({
          where: {
            type: 'official',
            participants: { some: { userId: user.id } },
          },
          include: {
            participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        });

        if (!conv) {
          conv = await this.prisma.conversation.create({
            data: {
              type: 'official',
              name: this.officialConversationName,
              avatar: this.officialConversationAvatar,
              participants: {
                create: [{ userId: systemUser.id }, { userId: user.id }],
              },
            },
            include: {
              participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
              messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          });
        } else if (!conv.participants.some((participant: any) => participant.userId === systemUser.id)) {
          conv = await this.prisma.conversation.update({
            where: { id: conv.id },
            data: {
              name: this.officialConversationName,
              avatar: this.officialConversationAvatar,
              participants: { create: [{ userId: systemUser.id }] },
            },
            include: {
              participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
              messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          });
        }

        const messageType = ['image', 'video', 'audio', 'voice', 'file', 'document'].includes(type)
          ? type
          : cleanMediaUrl
            ? 'file'
          : 'text';
        const messageContent = messageType === 'text'
          ? cleanText
          : JSON.stringify({
              url: cleanMediaUrl,
              name: cleanText || 'Message officiel',
              mime: this.inferBroadcastMime(messageType, cleanMediaUrl),
              official: true,
            });
        const msg = await this.prisma.message.create({
          data: {
            conversationId: conv.id,
            senderId: systemUser.id,
            content: messageContent,
            type: messageType,
            status: 'sent',
          },
          include: { sender: { select: { id:true, name:true, username:true, avatar:true } } },
        });
        const updatedConv = await this.prisma.conversation.update({
          where: { id: conv.id },
          data: {
            name: this.officialConversationName,
            avatar: this.officialConversationAvatar,
            updatedAt: new Date(),
          },
          include: {
            participants: { include: { user: { select: { id: true, name: true, username: true, avatar: true, status: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        });
        const officialSummary = this.toOfficialConversationSummary(updatedConv, user.id);

        // Émettre en temps réel via socket si l'utilisateur est connecté
        this.socketState.emitToUser(user.id, 'conversation:upsert', officialSummary);
        this.socketState.emitToUser(user.id, 'message:new', msg);
        // Émettre aussi dans la room de la conversation
        this.socketState.server?.to(`conv:${conv.id}`).emit('message:new', msg);

        sent++;
      } catch (error) {
        failed++;
        this.logger.warn(`Official broadcast failed for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Push notification pour les utilisateurs hors ligne
    const notificationBody = type === 'image'
      ? 'Photo officielle'
      : type === 'video'
        ? 'Vidéo officielle'
        : type === 'audio' || type === 'voice'
          ? 'Message vocal officiel'
          : type === 'file' || type === 'document'
            ? 'Fichier officiel'
            : cleanText;
    await this.notifications.sendToAll({ title: this.officialConversationName, body: notificationBody }).catch(() => {});

    return { success: failed === 0, sent, failed, total: users.length };
  }

  private inferBroadcastMime(type: string, url: string) {
    if (type === 'image') return 'image/jpeg';
    if (type === 'video') return 'video/mp4';
    if (type === 'audio' || type === 'voice') return 'audio/mpeg';
    const lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.doc')) return 'application/msword';
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/octet-stream';
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
