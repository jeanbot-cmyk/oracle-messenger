import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SocketStateService } from '../gateway/socket-state.service';
import * as os from 'os';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private lastCpuSnapshot: { idle: number; total: number } | null = null;
  private readonly officialConversationName = 'O.Messenger';
  private readonly officialConversationAvatar = '/icons/oracle-system-avatar.svg';
  private readonly officialSystemEmail = 'system-aura@oracle-messenger.local';
  private readonly officialSystemGoogleId = 'system-aura-messenger';
  private readonly officialBroadcastConcurrency = 12;
  private readonly presenceHeartbeatTimeoutMs = Number(process.env.PRESENCE_HEARTBEAT_TIMEOUT_MS || 70_000);
  private readonly realUserWhere = { email: { not: this.officialSystemEmail } };

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private socketState: SocketStateService,
  ) {}

  private isSocketInRoom(socketId: string, room: string) {
    return this.socketState.server?.sockets.sockets.get(socketId)?.rooms.has(room) ?? false;
  }

  private parseNonNegativeInteger(value?: string | null) {
    const clean = String(value ?? '').trim();
    if (!clean) return null;
    const normalized = clean.replace(/[\s,_]/g, '');
    if (!/^\d+$/.test(normalized)) return null;
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
    return parsed;
  }

  private getPlayStoreDownloads() {
    const raw = process.env.PLAY_STORE_DOWNLOADS_TOTAL
      ?? process.env.PLAYSTORE_DOWNLOADS_TOTAL
      ?? process.env.GOOGLE_PLAY_INSTALLS_TOTAL
      ?? '';
    const count = this.parseNonNegativeInteger(raw);
    const hasRawValue = String(raw || '').trim().length > 0;
    if (count === null) {
      return {
        configured: false,
        count: null,
        source: hasRawValue ? 'invalid_configuration' : 'not_configured',
        reportedAt: null,
        note: hasRawValue
          ? 'PLAY_STORE_DOWNLOADS_TOTAL doit être un entier officiel exporté depuis Google Play Console.'
          : 'Configurez PLAY_STORE_DOWNLOADS_TOTAL depuis Google Play Console pour compter Play Store.',
      };
    }
    return {
      configured: true,
      count,
      source: process.env.PLAY_STORE_DOWNLOADS_SOURCE?.trim() || 'google_play_console',
      reportedAt: process.env.PLAY_STORE_DOWNLOADS_REPORTED_AT?.trim() || null,
      note: 'Valeur Play Store fournie par la configuration serveur.',
    };
  }

  private async countRealUsersByIds(userIds: string[]) {
    if (!userIds.length) return 0;
    return this.prisma.user.count({
      where: { ...this.realUserWhere, id: { in: userIds } },
    });
  }

  async getStats() {
    const connectedUserIds = this.socketState.getOnlineUserIds();
    const activePresenceUserIds = this.socketState.getActivePresenceUserIds(this.presenceHeartbeatTimeoutMs);
    const [
      totalUsers,
      googleRegisteredUsers,
      premiumUsers,
      totalMessages,
      totalConversations,
      pwaInstalls,
      realtimeConnectedUsers,
      activeRealtimeUsers,
    ] = await Promise.all([
      this.prisma.user.count({ where: this.realUserWhere }),
      this.prisma.user.count({ where: { ...this.realUserWhere, googleId: { not: this.officialSystemGoogleId } } }),
      this.prisma.user.count({ where: { ...this.realUserWhere, isPremium: true } }),
      this.prisma.message.count({ where: { isDeleted: false } }),
      this.prisma.conversation.count(),
      this.prisma.pwaInstall.count(),
      this.countRealUsersByIds(connectedUserIds),
      this.countRealUsersByIds(activePresenceUserIds),
    ]);
    const playStore = this.getPlayStoreDownloads();
    const playStoreCount = playStore.count ?? 0;
    const knownDownloads = pwaInstalls + playStoreCount;
    return {
      totalUsers,
      googleRegisteredUsers,
      premiumUsers,
      totalMessages,
      totalConversations,
      onlineUsers: realtimeConnectedUsers,
      realtimeConnectedUsers,
      activeRealtimeUsers,
      realtimeSocketConnections: this.socketState.getConnectedSocketCount(),
      pwaInstalls,
      playStoreInstalls: playStore.count,
      totalDownloads: knownDownloads,
      totalDownloadsComplete: playStore.configured,
      downloads: {
        knownTotal: knownDownloads,
        complete: playStore.configured,
        sources: {
          pwa: {
            configured: true,
            count: pwaInstalls,
            source: 'PwaInstall table',
          },
          playStore,
        },
      },
      realtime: {
        connectedUsers: realtimeConnectedUsers,
        activeUsers: activeRealtimeUsers,
        socketConnections: this.socketState.getConnectedSocketCount(),
        heartbeatMaxAgeMs: this.presenceHeartbeatTimeoutMs,
        source: 'Socket.IO server memory',
      },
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
      select: { id:true, name:true, email:true, isPremium:true, status:true, lastSeen:true, createdAt:true, pushToken:true },
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

  private getOfficialOpenedAt(conv: any, userId: string) {
    const participant = conv.participants.find((pt: any) => pt.userId === userId);
    const lastMessage = conv.messages?.[0] ?? null;
    if (!participant?.lastReadAt || !lastMessage?.createdAt) return null;
    const readAt = new Date(participant.lastReadAt);
    const messageAt = new Date(lastMessage.createdAt);
    if (Number.isNaN(readAt.getTime()) || Number.isNaN(messageAt.getTime())) return null;
    return readAt.getTime() >= messageAt.getTime() ? readAt : null;
  }

  private getOfficialExpiresAt(conv: any, userId: string) {
    const openedAt = this.getOfficialOpenedAt(conv, userId);
    if (!openedAt) return null;
    return new Date(openedAt.getTime() + 24 * 60 * 60 * 1000);
  }

  private async getOfficialUnreadCount(conv: any, userId: string) {
    const participant = conv.participants.find((pt: any) => pt.userId === userId);
    return this.prisma.message.count({
      where: {
        conversationId: conv.id,
        senderId: { not: userId },
        isDeleted: false,
        ...(participant?.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}),
      },
    });
  }

  private async toOfficialConversationSummary(conv: any, userId: string) {
    const unreadCount = await this.getOfficialUnreadCount(conv, userId);
    const officialOpenedAt = unreadCount > 0 ? null : this.getOfficialOpenedAt(conv, userId)?.toISOString() ?? null;
    const officialExpiresAt = unreadCount > 0 ? null : this.getOfficialExpiresAt(conv, userId)?.toISOString() ?? null;
    const systemParticipant = conv.participants.find((pt: any) => pt.user?.email === this.officialSystemEmail);
    const others = [{
      id: systemParticipant?.userId ?? systemParticipant?.user?.id ?? 'oracle-messenger-official',
      name: this.officialConversationName,
      username: 'o_messenger',
      avatar: this.officialConversationAvatar,
      status: 'online',
      lastSeen: null,
    }];
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
      officialOpenedAt,
      officialExpiresAt,
      officialState: {
        received: true,
        unread: unreadCount > 0,
        opened_at: officialOpenedAt,
        expires_at: officialExpiresAt,
        openedAt: officialOpenedAt,
        expiresAt: officialExpiresAt,
      },
      updatedAt: conv.updatedAt,
    };
  }

  private async getOrCreateOfficialSystemUser() {
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: this.officialSystemEmail },
      select: { id: true },
    });
    const existingByGoogleId = existingByEmail ? null : await this.prisma.user.findUnique({
      where: { googleId: this.officialSystemGoogleId },
      select: { id: true },
    });
    const existing = existingByEmail ?? existingByGoogleId;
    const username = await this.getAvailableOfficialUsername(existing?.id);
    const googleId = await this.getAvailableOfficialGoogleId(existing?.id);
    const data = {
      googleId,
      email: this.officialSystemEmail,
      name: this.officialConversationName,
      username,
      avatar: this.officialConversationAvatar,
      status: 'online',
    };

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          googleId,
          email: this.officialSystemEmail,
          name: this.officialConversationName,
          username,
          avatar: this.officialConversationAvatar,
          status: 'online',
        },
      });
    }

    return this.prisma.user.create({
      data,
    });
  }

  private async getAvailableOfficialUsername(ownerId?: string) {
    const candidates = ['o_messenger', 'oracle_messenger_official', 'o_messenger_official'];
    for (const username of candidates) {
      const existing = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (!existing || existing.id === ownerId) return username;
    }
    return `oracle_messenger_system_${Date.now()}`;
  }

  private async getAvailableOfficialGoogleId(ownerId?: string) {
    const candidates = [this.officialSystemGoogleId, 'oracle-messenger-system-account'];
    for (const googleId of candidates) {
      const existing = await this.prisma.user.findUnique({
        where: { googleId },
        select: { id: true },
      });
      if (!existing || existing.id === ownerId) return googleId;
    }
    return `oracle-messenger-system-${Date.now()}`;
  }

  private officialParticipantUserSelect() {
    return {
      id: true,
      email: true,
      name: true,
      username: true,
      avatar: true,
      status: true,
      lastSeen: true,
    };
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private async deliverOfficialMessageToUser(
    userId: string,
    systemUserId: string,
    message: {
      type: string;
      content: string;
      caption: string;
      mediaUrl: string;
    },
  ) {
    const conv = await this.getOrCreateOfficialConversationForUser(userId, systemUserId);
    const msg = await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: systemUserId,
        content: message.content,
        type: message.type,
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
        participants: { include: { user: { select: this.officialParticipantUserSelect() } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const officialSummary = await this.toOfficialConversationSummary(updatedConv, userId);

    const room = `conv:${conv.id}`;
    this.socketState.emitToUser(userId, 'conversation:upsert', officialSummary);
    this.socketState.server?.to(room).emit('message:new', msg);
    for (const socketId of this.socketState.getSocketIds(userId)) {
      if (this.isSocketInRoom(socketId, room)) continue;
      this.socketState.server?.to(socketId).emit('message:new', msg);
    }

    const notificationBody = message.type === 'image'
      ? 'Photo officielle'
      : message.type === 'video'
        ? 'Vidéo officielle'
        : message.type === 'audio' || message.type === 'voice'
          ? 'Message vocal officiel'
          : message.type === 'file' || message.type === 'document'
            ? 'Fichier officiel'
            : message.caption;
    void this.notifications.sendPush(userId, {
      title: this.officialConversationName,
      body: notificationBody,
      type: 'official-message',
      conversationId: conv.id,
      url: `oraclemessenger://notification?conversationId=${encodeURIComponent(conv.id)}`,
      tag: `official-${conv.id}`,
      image: message.type === 'image' && message.mediaUrl ? message.mediaUrl : undefined,
    }).catch(error => {
      this.logger.warn(`Official push failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
    });

    return { conversationId: conv.id, messageId: msg.id };
  }

  private isDedicatedOfficialConversation(conv: any, userId: string, systemUserId: string) {
    const participants = Array.isArray(conv?.participants) ? conv.participants : [];
    const participantIds = participants.map((participant: any) => participant.userId);
    if (!participantIds.includes(userId) || !participantIds.includes(systemUserId)) return false;
    const realParticipants = participants.filter((participant: any) => participant.user?.email !== this.officialSystemEmail);
    return realParticipants.length === 1 && realParticipants[0]?.userId === userId;
  }

  private async getOrCreateOfficialConversationForUser(userId: string, systemUserId: string) {
    const candidates = await this.prisma.conversation.findMany({
      where: {
        type: 'official',
        participants: { some: { userId } },
      },
      include: {
        participants: { include: { user: { select: { id: true, email: true, name: true, username: true, avatar: true, status: true, lastSeen: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const existing = candidates.find(conv => this.isDedicatedOfficialConversation(conv, userId, systemUserId));
    if (existing) {
      return this.prisma.conversation.update({
        where: { id: existing.id },
        data: {
          name: this.officialConversationName,
          avatar: this.officialConversationAvatar,
        },
        include: {
          participants: { include: { user: { select: { id: true, email: true, name: true, username: true, avatar: true, status: true, lastSeen: true } } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
    }

    return this.prisma.conversation.create({
      data: {
        type: 'official',
        name: this.officialConversationName,
        avatar: this.officialConversationAvatar,
        participants: {
          create: [{ userId: systemUserId }, { userId }],
        },
      },
      include: {
        participants: { include: { user: { select: { id: true, email: true, name: true, username: true, avatar: true, status: true, lastSeen: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  async broadcastSalesMessage(adminId: string, content: string, mediaUrl?: string, type = 'text') {
    const systemUser = await this.getOrCreateOfficialSystemUser();
    const cleanText = content?.trim() || '';
    const cleanMediaUrl = mediaUrl?.trim() || '';
    const contentMedia = this.parseBroadcastMediaPayload(cleanText);
    const effectiveMediaUrl = cleanMediaUrl || contentMedia?.url?.trim() || '';
    const effectiveCaption = contentMedia ? String(contentMedia.caption || '').trim() : cleanText;
    if (!effectiveCaption && !effectiveMediaUrl) return { success: false, sent: 0, failed: 0, total: 0, message: 'Contenu requis' };

    // Get or create one official O.Messenger conversation for each user.
    const users = await this.prisma.user.findMany({
      where: { ...this.realUserWhere, id: { not: systemUser.id } },
      select: { id: true },
    });

    const messageType = ['image', 'video', 'audio', 'voice', 'file', 'document'].includes(type)
      ? type
      : effectiveMediaUrl
        ? 'file'
        : 'text';
    const messageContent = messageType === 'text'
      ? effectiveCaption
      : JSON.stringify({
          url: effectiveMediaUrl,
          name: contentMedia?.name || effectiveCaption || 'Message officiel',
          mime: contentMedia?.mime || this.inferBroadcastMime(messageType, effectiveMediaUrl),
          size: contentMedia?.size,
          checksum: contentMedia?.checksum,
          caption: contentMedia?.caption || effectiveCaption || undefined,
          official: true,
        });
    const officialMessage = {
      type: messageType,
      content: messageContent,
      caption: effectiveCaption,
      mediaUrl: effectiveMediaUrl,
    };

    this.logger.log(`Official broadcast started by ${adminId}: ${users.length} recipient(s), type=${messageType}`);
    let sent = 0;
    let failed = 0;
    for (const batch of this.chunk(users, this.officialBroadcastConcurrency)) {
      const results = await Promise.allSettled(batch.map(user => this.deliverOfficialMessageToUser(user.id, systemUser.id, officialMessage)));
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          sent++;
          return;
        }
        failed++;
        const userId = batch[index]?.id ?? 'unknown';
        this.logger.warn(`Official broadcast failed for user ${userId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      });
    }

    this.logger.log(`Official broadcast finished: sent=${sent}, failed=${failed}, total=${users.length}`);
    return { success: failed === 0, sent, failed, total: users.length };
  }

  private parseBroadcastMediaPayload(content: string): {
    url?: string;
    name?: string;
    mime?: string;
    size?: number;
    checksum?: string;
    caption?: string;
  } | null {
    if (!content?.trim().startsWith('{')) return null;
    try {
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.url !== 'string') return null;
      return {
        url: parsed.url,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        mime: typeof parsed.mime === 'string' ? parsed.mime : undefined,
        size: typeof parsed.size === 'number' ? parsed.size : undefined,
        checksum: typeof parsed.checksum === 'string' ? parsed.checksum : undefined,
        caption: typeof parsed.caption === 'string' ? parsed.caption : undefined,
      };
    } catch {
      return null;
    }
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
      select: { id: true, phone: true, status: true, lastSeen: true },
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
