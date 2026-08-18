import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody, Ack,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from '../chat/chat.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CallsService, type LogCallDto } from '../calls/calls.service';
import { SocketStateService } from './socket-state.service';
import { AiAutoService } from '../ai-auto/ai-auto.service';
import { BusinessService } from '../business/business.service';

type PendingWebRtcSignal = {
  kind: 'offer' | 'answer' | 'ice';
  callId: string;
  fromUserId: string;
  targetUserId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  queuedAt: number;
};

type ClientVersionInfo = {
  app?: string;
  platform?: string;
  versionName?: string;
  versionCode: number;
  updateUrl?: string;
  fallbackUpdateUrl?: string;
  connectedAt: number;
};

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowed = (process.env.CORS_ORIGINS ?? 'https://messenger.oracle-plus.online')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      const localDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin ?? ''));
      if (!origin || allowed.includes(origin) || localDevOrigin) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'), false);
    },
    credentials: false,
  },
  maxHttpBufferSize: 25 * 1024 * 1024,
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // userId → socketId (en mémoire — suffisant pour 1 instance)
  // userSockets moved to SocketStateService

  private readonly callNoAnswerTimeoutMs = Number(process.env.CALL_NO_ANSWER_TIMEOUT_MS || 300_000);
  private readonly presenceHeartbeatTimeoutMs = Number(process.env.PRESENCE_HEARTBEAT_TIMEOUT_MS || 30_000);
  private readonly presenceOfflineGraceMs = Number(process.env.PRESENCE_OFFLINE_GRACE_MS || 8_000);
  private readonly presenceBackgroundGraceMs = Number(process.env.PRESENCE_BACKGROUND_GRACE_MS || 8_000);
  private readonly presenceLockedGraceMs = Number(process.env.PRESENCE_LOCKED_GRACE_MS || 15 * 60_000);
  private readonly maxAudioCallParticipants = Number(process.env.MAX_AUDIO_CALL_PARTICIPANTS || 100);
  private readonly maxVideoCallParticipants = Number(process.env.MAX_VIDEO_CALL_PARTICIPANTS || 10);
  private readonly maxPendingWebRtcSignalsPerTarget = 80;
  private readonly minCallVersionCode = Number(process.env.MIN_CALL_CLIENT_VERSION_CODE || 2026081510);
  private readonly updateUrl = process.env.ORACLE_MESSENGER_UPDATE_URL || 'market://details?id=online.oracle_plus.messenger';
  private readonly fallbackUpdateUrl = process.env.ORACLE_MESSENGER_FALLBACK_UPDATE_URL || 'https://play.google.com/store/apps/details?id=online.oracle_plus.messenger';
  private readonly strictRealtimeMode = process.env.ORACLE_STRICT_REALTIME === 'true';

  // callId → appel actif. La durée est comptée uniquement après acceptation réelle.
  private activeCalls = new Map<string, {
    callerId: string; callerName: string; callerPhone?: string | null; originalCallerId: string; originalCallerName: string; conversationId: string;
    type: 'audio' | 'video'; startedAt: number; answered: boolean; answeredAt?: number;
    mediaProvider?: 'livekit' | 'webrtc';
    participants: Set<string>;
    answeredUserIds: Set<string>;
    ending?: boolean; endingBy?: string;
  }>();
  private pendingWebRtcSignals = new Map<string, PendingWebRtcSignal[]>();
  private socketClientVersions = new Map<string, ClientVersionInfo>();
  private callTimeouts = new Map<string, NodeJS.Timeout>();
  private offlineTimers = new Map<string, NodeJS.Timeout>();
  private deliverySyncAt = new Map<string, number>();
  private cleanupTimer?: NodeJS.Timeout;
  private presenceCleanupTimer?: NodeJS.Timeout;
  private businessReminderTimer?: NodeJS.Timeout;
  private businessReminderRunning = false;
  private redisPub?: Redis;
  private redisSub?: Redis;

  constructor(
    private jwt: JwtService,
    private chat: ChatService,
    private users: UsersService,
    private notif: NotificationsService,
    private callsSvc: CallsService,
    private socketState: SocketStateService,
    private aiAuto: AiAutoService,
    private business: BusinessService,
  ) {}

  private isDiagnosticCallId(callId?: string | null) {
    return /^CALL-(DIAG|E2E|FINAL)-/.test(String(callId ?? ''));
  }

  private readClientVersion(client: Socket): ClientVersionInfo {
    const raw = client.handshake.auth?.client ?? {};
    const versionCode = Number(raw.versionCode ?? client.handshake.headers?.['x-oracle-version-code'] ?? 0) || 0;
    return {
      app: typeof raw.app === 'string' ? raw.app : undefined,
      platform: typeof raw.platform === 'string' ? raw.platform : undefined,
      versionName: typeof raw.versionName === 'string' ? raw.versionName : undefined,
      versionCode,
      updateUrl: typeof raw.updateUrl === 'string' ? raw.updateUrl : undefined,
      fallbackUpdateUrl: typeof raw.fallbackUpdateUrl === 'string' ? raw.fallbackUpdateUrl : undefined,
      connectedAt: Date.now(),
    };
  }

  private isClientVersionCallCapable(info?: ClientVersionInfo | null) {
    return Boolean(info?.versionCode && info.versionCode >= this.minCallVersionCode);
  }

  private buildUpdateRequiredPayload(info?: ClientVersionInfo | null, reason = 'calls') {
    return {
      title: 'Mettez à jour',
      message: reason === 'calls'
        ? 'Mettez à jour Oracle Messenger pour recevoir les appels. La messagerie reste disponible.'
        : 'Mettez à jour Oracle Messenger. La messagerie reste disponible.',
      minVersionCode: this.minCallVersionCode,
      currentVersionCode: info?.versionCode ?? 0,
      updateUrl: info?.updateUrl || this.updateUrl,
      fallbackUpdateUrl: info?.fallbackUpdateUrl || this.fallbackUpdateUrl,
      blockCalls: true,
    };
  }

  private emitUpdateRequired(client: Socket, reason = 'calls') {
    const info = this.socketClientVersions.get(client.id) ?? this.readClientVersion(client);
    client.emit('app:update-required', this.buildUpdateRequiredPayload(info, reason));
  }

  private getUserConnectedCallCompatibility(userId: string) {
    const socketIds = this.socketState.getSocketIds(userId);
    const versions = socketIds.map(socketId => this.socketClientVersions.get(socketId)).filter(Boolean) as ClientVersionInfo[];
    const hasKnownModernSocket = versions.some(info => this.isClientVersionCallCapable(info));
    const hasOutdatedSocket = socketIds.some(socketId => !this.isClientVersionCallCapable(this.socketClientVersions.get(socketId)));
    return {
      socketIds,
      versions,
      hasKnownModernSocket,
      hasOutdatedSocket,
      callCapable: !socketIds.length || hasKnownModernSocket,
    };
  }

  private notifyUserUpdateRequired(userId: string, reason = 'calls') {
    const socketIds = this.socketState.getSocketIds(userId);
    for (const socketId of socketIds) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (!socket) continue;
      socket.emit('app:update-required', this.buildUpdateRequiredPayload(this.socketClientVersions.get(socketId), reason));
    }
    this.notif.sendPush(userId, {
      title: 'Mettez à jour',
      body: 'Mettez à jour Oracle Messenger pour recevoir les appels. La messagerie reste disponible.',
      url: this.fallbackUpdateUrl,
      tag: 'oracle-update-required',
      type: 'app_update',
      requireInteraction: true,
    }).catch(error => {
      console.warn('[app:update-required:push:error]', { userId, error: error?.message ?? error });
    });
  }

  afterInit(server: Server) {
    this.socketState.setServer(server);
    this.configureRedisSocketAdapter(server);
    server.use((client, next) => {
      try {
        const token = client.handshake.auth?.token;
        if (!token) return next(new Error('Unauthorized'));
        const payload = this.jwt.verify(token) as { sub: string };
        if (!payload?.sub) return next(new Error('Unauthorized'));
        client.data.userId = payload.sub;
        return next();
      } catch {
        return next(new Error('Unauthorized'));
      }
    });
    this.chat.cleanupOldTextMessages(5).catch(() => {});
    this.cleanupTimer = setInterval(() => {
      this.chat.cleanupOldTextMessages(5).catch(() => {});
    }, 6 * 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
    this.presenceCleanupTimer = setInterval(() => {
      for (const userId of this.socketState.getPresenceUserIds()) {
        if (!this.socketState.hasActiveUserPresence(userId, this.presenceHeartbeatTimeoutMs)) {
          this.scheduleOfflineIfNoActivePresence(userId, this.presenceBackgroundGraceMs);
        }
      }
      this.reconcileStoredPresence('interval').catch(error => {
        console.warn('[presence:reconcile:error]', { source: 'interval', error: error?.message ?? error });
      });
    }, 12_000);
    this.presenceCleanupTimer.unref?.();
    setTimeout(() => {
      this.reconcileStoredPresence('startup').catch(error => {
        console.warn('[presence:reconcile:error]', { source: 'startup', error: error?.message ?? error });
      });
    }, 1_500).unref?.();
    this.businessReminderTimer = setInterval(() => {
      this.dispatchDueBusinessReminderActions().catch(error => {
        console.warn('[business-ai] reminder dispatch failed', error?.message ?? error);
      });
    }, 60_000);
    this.businessReminderTimer.unref?.();
  }

  private async reconcileStoredPresence(source: 'startup' | 'interval') {
    const connectedUserIds = this.socketState.getOnlineUserIds();
    const reconciled = await this.users.markOnlineUsersOfflineExcept(connectedUserIds, this.presenceLockedGraceMs);
    if (!reconciled.length) return;
    console.info('[presence:reconcile:offline]', {
      source,
      count: reconciled.length,
      connectedUsers: connectedUserIds.length,
    });
    for (const item of reconciled) {
      this.server.emit('user:offline', {
        userId: item.userId,
        status: 'offline',
        lastSeen: item.lastSeen.toISOString(),
      });
    }
  }

  private configureRedisSocketAdapter(server: Server) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.warn('[socket:redis-adapter:disabled]', { reason: 'REDIS_URL missing' });
      return;
    }
    try {
      this.redisPub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
      this.redisSub = this.redisPub.duplicate();
      Promise.all([this.redisPub.connect(), this.redisSub.connect()])
        .then(() => {
          server.adapter(createAdapter(this.redisPub!, this.redisSub!));
          console.info('[socket:redis-adapter:enabled]', { redisUrl: redisUrl.replace(/\/\/.*@/, '//***@') });
        })
        .catch(error => {
          console.warn('[socket:redis-adapter:error]', { error: error?.message ?? error });
          this.redisPub?.disconnect();
          this.redisSub?.disconnect();
          this.redisPub = undefined;
          this.redisSub = undefined;
        });
    } catch (error: any) {
      console.warn('[socket:redis-adapter:error]', { error: error?.message ?? error });
    }
  }

  // ── Connexion ─────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const userId = client.data.userId;
      if (!userId) { client.disconnect(); return; }
      const clientVersion = this.readClientVersion(client);
      this.socketClientVersions.set(client.id, clientVersion);
      this.cancelOfflineTimer(userId);
      this.socketState.setUserSocket(userId, client.id, 'background');
      await this.users.setPresence(userId, 'connected').catch(error => {
        console.warn('[presence:connect:connected:error]', { userId, error: error?.message ?? error });
      });
      this.emitUserConnected(userId);
      console.info('[socket:connect]', {
        userId,
        socketId: client.id,
        sockets: this.socketState.getSocketIds(userId).length,
        presence: 'connected',
        clientVersionCode: clientVersion.versionCode,
        minCallVersionCode: this.minCallVersionCode,
      });
      if (!this.isClientVersionCallCapable(clientVersion)) {
        setTimeout(() => {
          if (this.server.sockets.sockets.has(client.id)) this.emitUpdateRequired(client, 'calls');
        }, 350).unref?.();
      }
      this.emitPendingCallsToClient(userId, client);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    this.socketState.removeUserSocket(userId, client.id);
    this.socketClientVersions.delete(client.id);
    console.info('[socket:disconnect]', {
      userId,
      socketId: client.id,
      sockets: this.socketState.getSocketIds(userId).length,
    });
    if (!this.socketState.hasActiveUserPresence(userId, this.presenceHeartbeatTimeoutMs)) {
      this.scheduleOfflineIfNoActivePresence(userId, this.socketState.hasUserSockets(userId) ? this.presenceBackgroundGraceMs : this.presenceOfflineGraceMs);
    }
  }

  private cancelOfflineTimer(userId: string) {
    const pendingOffline = this.offlineTimers.get(userId);
    if (!pendingOffline) return;
    clearTimeout(pendingOffline);
    this.offlineTimers.delete(userId);
  }

  private emitUserConnected(userId: string) {
    this.server.emit('user:online', {
      userId,
      status: 'connected',
      lastSeen: null,
      activeUntil: null,
      connected: true,
    });
  }

  private async markUserOffline(userId: string) {
    const user = await this.users.setOnline(userId, false);
    this.server.emit('user:offline', { userId, status: 'offline', lastSeen: user.lastSeen?.toISOString?.() });
  }

  private scheduleOfflineIfNoActivePresence(userId: string, delayMs: number) {
    if (this.socketState.hasActiveUserPresence(userId, this.presenceHeartbeatTimeoutMs)) {
      this.cancelOfflineTimer(userId);
      return;
    }
    const existingTimer = this.offlineTimers.get(userId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(async () => {
      this.offlineTimers.delete(userId);
      if (this.socketState.hasActiveUserPresence(userId, this.presenceHeartbeatTimeoutMs)) return;
      const connectedGraceMs = this.presenceHeartbeatTimeoutMs + this.presenceBackgroundGraceMs;
      if (this.socketState.hasRecentUserPresence(userId, connectedGraceMs)) {
        await this.users.setPresence(userId, 'connected').catch(() => {});
        this.emitUserConnected(userId);
        this.scheduleOfflineIfNoActivePresence(userId, this.presenceBackgroundGraceMs);
        return;
      }
      await this.markUserOffline(userId);
    }, Math.max(0, delayMs));
    timer.unref?.();
    this.offlineTimers.set(userId, timer);
  }

  private async emitConversationPresenceSnapshot(client: Socket, conversationId: string) {
    const participants = await this.chat.getParticipantPresence(conversationId);
    const activeUntil = new Date(Date.now() + this.presenceHeartbeatTimeoutMs).toISOString();
    const snapshot = participants
      .filter(participant => participant.userId !== client.data.userId)
      .map(participant => {
        const isActive = this.socketState.hasActiveUserPresence(participant.userId, this.presenceHeartbeatTimeoutMs);
        const isConnected = isActive || this.socketState.hasRecentUserPresence(
          participant.userId,
          this.presenceHeartbeatTimeoutMs + this.presenceBackgroundGraceMs,
        );
        return {
          userId: participant.userId,
          status: isActive ? 'online' : isConnected ? 'connected' : 'offline',
          lastSeen: isConnected ? null : participant.lastSeen?.toISOString?.() ?? null,
          activeUntil: isActive ? activeUntil : null,
          connected: isConnected,
        };
      });
    client.emit('presence:snapshot', { conversationId, participants: snapshot });
    for (const participant of snapshot) {
      if (participant.status === 'online') {
        client.emit('user:online', {
          userId: participant.userId,
          status: 'online',
          lastSeen: null,
          activeUntil: participant.activeUntil,
        });
      } else if (participant.status === 'connected') {
        client.emit('user:online', {
          userId: participant.userId,
          status: 'connected',
          lastSeen: null,
          activeUntil: null,
          connected: true,
        });
      } else {
        client.emit('user:offline', {
          userId: participant.userId,
          status: 'offline',
          lastSeen: participant.lastSeen,
        });
      }
    }
  }

  private formatDuration(seconds?: number) {
    if (!seconds || seconds < 1) return '';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}min ${rest}s` : `${minutes}min`;
  }

  private async publishCallTrace(
    conversationId: string,
    senderId: string,
    type: 'audio' | 'video',
    state: 'ended' | 'missed' | 'refused' | 'cancelled',
    duration?: number,
  ) {
    const icon = state === 'ended'
      ? (type === 'video' ? '📹' : '📞')
      : '📵';
    const label = type === 'video' ? 'Appel vidéo' : 'Appel audio';
    const suffix = state === 'ended'
      ? `terminé${duration ? ` · ${this.formatDuration(duration)}` : ''}`
      : state === 'refused'
        ? 'refusé'
        : state === 'cancelled'
          ? 'annulé'
          : 'manqué';
    const msg = await this.chat.createMessage(conversationId, senderId, `${icon} ${label} ${suffix}`, 'text');
    const participantIds = await this.chat.getParticipantIds(conversationId);
    for (const uid of participantIds) {
      this.socketState.emitToUser(uid, 'message:new', msg);
    }
    await this.broadcastConversationSummaries(conversationId, participantIds);
  }

  private syncCallNotifications(
    callId: string,
    call: {
      callerId: string; callerName: string; callerPhone?: string | null; originalCallerId?: string; originalCallerName?: string; conversationId: string;
      type: 'audio' | 'video'; startedAt: number; answered: boolean; answeredAt?: number;
      participants: Set<string>;
    },
    status: 'accepted' | 'refused' | 'ended' | 'missed' | 'cancelled',
    recipientIds?: string[],
  ) {
    if (this.isDiagnosticCallId(callId)) return;
    const recipients = recipientIds?.length
      ? [...new Set(recipientIds)].filter(uid => call.participants.has(uid))
      : [...call.participants];
    for (const uid of recipients) {
      this.notif.sendPush(uid, {
        title: 'Oracle Messenger',
        body: '',
        tag: `incoming-call-${callId}`,
        type: 'call-sync',
        callId,
        conversationId: call.conversationId,
        status,
        requireInteraction: false,
        url: `/chat?conv=${encodeURIComponent(call.conversationId)}`,
      }).catch(() => {});
    }
  }

  private emitPendingCallsToClient(userId: string, client: Socket) {
    if (!this.isClientVersionCallCapable(this.socketClientVersions.get(client.id))) {
      this.emitUpdateRequired(client, 'calls');
      return;
    }
    for (const [callId, call] of this.activeCalls.entries()) {
      if (!call.participants.has(userId)) continue;
      client.join(`call:${callId}`);
      console.info('[call:pending:deliver]', {
        callId,
        userId,
        callerId: call.callerId,
        role: call.callerId === userId ? 'caller' : 'receiver',
        answered: call.answered,
      });
      if (call.callerId !== userId) {
        client.emit('call:incoming', {
          callId,
          conversationId: call.conversationId,
          callerId: call.callerId,
          callerName: call.callerPhone || call.callerName,
          callerPhone: call.callerPhone || null,
          type: call.type,
          mediaProvider: call.mediaProvider,
          participants: [...call.participants].filter(id => id !== call.callerId),
        });
      } else if (call.answeredUserIds.size) {
        for (const responderId of call.answeredUserIds) {
          client.emit('call:answered', {
            callId,
            userId: responderId,
            accepted: true,
            mediaProvider: call.mediaProvider,
            replayed: true,
          });
        }
      }
      this.deliverPendingWebRtcSignals(callId, userId);
    }
  }

  private clearCallTimeout(callId: string) {
    const timer = this.callTimeouts.get(callId);
    if (timer) clearTimeout(timer);
    this.callTimeouts.delete(callId);
  }

  private isSocketInRoom(socketId: string, room: string) {
    return this.server.sockets.sockets.get(socketId)?.rooms.has(room) ?? false;
  }

  private async getUserSocketCountGlobal(userId: string) {
    try {
      const sockets = await this.server.in(this.socketState.userRoom(userId)).fetchSockets();
      return sockets.length;
    } catch {
      return this.socketState.getSocketIds(userId).length;
    }
  }

  private async isUserInRoomGlobal(userId: string, room: string) {
    try {
      const sockets = await this.server.in(this.socketState.userRoom(userId)).fetchSockets();
      return sockets.some(socket => socket.rooms.has(room));
    } catch {
      return this.socketState.getSocketIds(userId).some(sid => this.isSocketInRoom(sid, room));
    }
  }

  private maxCallParticipants(type: 'audio' | 'video') {
    return type === 'video' ? this.maxVideoCallParticipants : this.maxAudioCallParticipants;
  }

  private summarizeIceCandidate(candidate?: RTCIceCandidateInit | null) {
    const raw = String(candidate?.candidate || '');
    const typeMatch = raw.match(/\btyp\s+([a-z0-9]+)/i);
    const protocolMatch = raw.match(/\b(udp|tcp)\b/i);
    return {
      candidateType: typeMatch?.[1] || 'unknown',
      protocol: protocolMatch?.[1]?.toLowerCase() || 'unknown',
      sdpMid: candidate?.sdpMid ?? null,
      sdpMLineIndex: candidate?.sdpMLineIndex ?? null,
    };
  }

  private pendingWebRtcSignalKey(callId: string, targetUserId: string) {
    return `${callId}:${targetUserId}`;
  }

  private webRtcSignalEvent(signal: PendingWebRtcSignal) {
    return signal.kind === 'offer'
      ? 'webrtc:offer'
      : signal.kind === 'answer'
        ? 'webrtc:answer'
        : 'webrtc:ice';
  }

  private webRtcSignalPayload(signal: PendingWebRtcSignal) {
    return signal.kind === 'ice'
      ? { callId: signal.callId, fromUserId: signal.fromUserId, candidate: signal.candidate }
      : { callId: signal.callId, fromUserId: signal.fromUserId, sdp: signal.sdp };
  }

  private queuePendingWebRtcSignal(signal: PendingWebRtcSignal) {
    if (!this.activeCalls.has(signal.callId)) return;
    const key = this.pendingWebRtcSignalKey(signal.callId, signal.targetUserId);
    const current = this.pendingWebRtcSignals.get(key) ?? [];
    const next = [...current, signal].slice(-this.maxPendingWebRtcSignalsPerTarget);
    this.pendingWebRtcSignals.set(key, next);
    console.info('[webrtc:signal:queued]', {
      callId: signal.callId,
      kind: signal.kind,
      from: signal.fromUserId,
      to: signal.targetUserId,
      pending: next.length,
    });
  }

  private deliverPendingWebRtcSignals(callId: string, userId: string) {
    const key = this.pendingWebRtcSignalKey(callId, userId);
    const pending = this.pendingWebRtcSignals.get(key) ?? [];
    if (!pending.length) return { delivered: 0, pending: 0 };

    const socketIds = this.socketState.getSocketIds(userId);
    let delivered = 0;
    for (const signal of pending) {
      const event = this.webRtcSignalEvent(signal);
      const payload = this.webRtcSignalPayload(signal);
      for (const sid of socketIds) {
        const targetSocket = this.server.sockets.sockets.get(sid);
        if (!targetSocket) continue;
        targetSocket.emit(event, payload);
        delivered += 1;
      }
    }

    if (delivered > 0) {
      this.pendingWebRtcSignals.delete(key);
      console.info('[webrtc:signal:delivered-pending]', {
        callId,
        targetUserId: userId,
        signals: pending.length,
        sockets: socketIds.length,
        delivered,
      });
    }
    return { delivered, pending: pending.length };
  }

  private clearPendingWebRtcSignals(callId: string) {
    for (const key of this.pendingWebRtcSignals.keys()) {
      if (key.startsWith(`${callId}:`)) this.pendingWebRtcSignals.delete(key);
    }
  }

  private sendSocketAck(
    ack: ((response: Record<string, unknown>) => void) | undefined,
    response: Record<string, unknown>,
  ) {
    if (typeof ack === 'function') ack(response);
  }

  private async broadcastConversationRead(
    conversationId: string,
    userId: string,
    updatedMessages: Array<{ id: string; status?: string; updatedAt?: Date | string }>,
  ) {
    const payload = { conversationId, userId };
    const participantIds = await this.chat.getParticipantIds(conversationId);
    for (const uid of participantIds) {
      this.socketState.emitToUser(uid, 'conversation:read', payload);
      for (const message of updatedMessages) {
        this.socketState.emitToUser(uid, 'message:update', {
          id: message.id,
          patch: { status: message.status, updatedAt: message.updatedAt },
        });
      }
    }
    await this.broadcastConversationSummaries(conversationId, participantIds);
  }

  private async broadcastConversationSummaries(conversationId: string, participantIds?: string[]) {
    const ids = participantIds ?? await this.chat.getParticipantIds(conversationId);
    for (const uid of ids) {
      const summary = await this.chat.getConversation(conversationId, uid).catch(() => null);
      if (!summary) continue;
      this.socketState.emitToUser(uid, 'conversation:upsert', summary);
    }
  }

  private async broadcastMessageStatusUpdates(messages: Array<{ id: string; conversationId: string; status?: string; updatedAt?: Date | string }>) {
    const byConversation = new Map<string, Array<{ id: string; status?: string; updatedAt?: Date | string }>>();
    for (const message of messages) {
      if (!message?.id || !message.conversationId) continue;
      const current = byConversation.get(message.conversationId) ?? [];
      current.push(message);
      byConversation.set(message.conversationId, current);
    }

    for (const [conversationId, items] of byConversation.entries()) {
      const participantIds = await this.chat.getParticipantIds(conversationId);
      for (const uid of participantIds) {
        for (const message of items) {
          this.socketState.emitToUser(uid, 'message:update', {
            id: message.id,
            patch: { status: message.status, updatedAt: message.updatedAt },
          });
        }
      }
      await this.broadcastConversationSummaries(conversationId, participantIds);
    }
  }

  private async syncPendingDeliveriesForUser(userId: string, source: string, conversationId?: string) {
    if (!userId) return;
    const key = conversationId ? `${userId}:${conversationId}` : userId;
    const lastSyncAt = this.deliverySyncAt.get(key) ?? 0;
    if (!conversationId && Date.now() - lastSyncAt < 8_000) return;
    this.deliverySyncAt.set(key, Date.now());
    const updated = await this.chat.markPendingMessagesDeliveredForUser(userId, conversationId);
    if (!updated.length) return;
    await this.broadcastMessageStatusUpdates(updated);
    console.info('[message:delivery-sync]', {
      userId,
      source,
      conversationId: conversationId ?? null,
      updated: updated.length,
    });
  }

  private async markMessageDeliveredFromTransport(
    msg: any,
    receiverIds: Iterable<string>,
    source: 'socket' | 'push' | 'client-ack',
  ) {
    const ids = [...new Set([...receiverIds].filter(Boolean).filter(uid => uid !== msg.senderId))];
    if (!msg?.id || !msg?.conversationId || !ids.length) return null;

    let latest: any = null;
    for (const receiverId of ids) {
      latest = await this.chat.markMessageDelivered(msg.id, receiverId).catch(error => {
        console.warn('[message:delivered:transport:error]', {
          messageId: msg.id,
          conversationId: msg.conversationId,
          receiverId,
          source,
          error: error?.message ?? error,
        });
        return latest;
      });
    }
    if (!latest) return null;

    const payload = {
      id: latest.id,
      patch: {
        status: latest.status,
        updatedAt: latest.updatedAt,
      },
    };
    const participantIds = await this.chat.getParticipantIds(latest.conversationId);
    for (const uid of participantIds) {
      this.socketState.emitToUser(uid, 'message:update', payload);
    }
    await this.broadcastConversationSummaries(latest.conversationId, participantIds);
    console.info('[message:delivered:transport]', {
      messageId: latest.id,
      conversationId: latest.conversationId,
      source,
      receivers: ids,
      status: latest.status,
    });
    return latest;
  }

  private scheduleNoAnswerTimeout(callId: string) {
    this.clearCallTimeout(callId);
    const timer = setTimeout(async () => {
      const call = this.activeCalls.get(callId);
      if (!call || call.answered) return;
      call.ending = true;
      call.endingBy = call.callerId;
      this.syncCallNotifications(callId, call, 'missed');
      if (!this.isDiagnosticCallId(callId)) {
        await this.publishCallTrace(
          call.conversationId,
          call.callerId,
          call.type,
          'missed',
        ).catch(() => {});
      }
      await this.logCallFinalState(callId, call, call.callerId, 'missed').catch(() => {});
      console.info('[CALL_ENDED]', {
        callId,
        enderId: call.callerId,
        reason: 'no-answer',
        connected: false,
      });

      for (const uid of call.participants) {
        const socketIds = this.socketState.getSocketIds(uid);
        for (const sid of socketIds) {
          this.server.to(sid).emit('call:ended', {
            callId,
            userId: call.callerId,
            reason: 'no-answer',
          });
          const participantSocket = this.server.sockets.sockets.get(sid);
          participantSocket?.leave(`call:${callId}`);
        }
      }

      this.clearPendingWebRtcSignals(callId);
      this.activeCalls.delete(callId);
      this.callTimeouts.delete(callId);
    }, this.callNoAnswerTimeoutMs);
    timer.unref?.();
    this.callTimeouts.set(callId, timer);
  }

  private getAuthorizedCall(callId: string, userId: string, targetUserId?: string) {
    const call = this.activeCalls.get(callId);
    if (!call) return null;
    if (!call.participants.has(userId)) return null;
    if (targetUserId && !call.participants.has(targetUserId)) return null;
    if (targetUserId && targetUserId === userId) return null;
    return call;
  }

  private getBusyCallDetails(userIds: string[]) {
    const candidates = new Set(userIds.filter(Boolean));
    for (const [callId, call] of this.activeCalls.entries()) {
      for (const userId of candidates) {
        if (call.participants.has(userId)) {
          return {
            callId,
            userIds: [...candidates].filter(candidate => call.participants.has(candidate)),
          };
        }
      }
    }
    return null;
  }

  private async logCallStartedState(
    callId: string,
    call: {
      callerId: string; callerName: string; callerPhone?: string | null; conversationId: string;
      type: 'audio' | 'video'; participants: Set<string>;
    },
    targetIds: string[],
  ) {
    if (this.isDiagnosticCallId(callId)) return;
    const uniqueTargets = [...new Set(targetIds)].filter(targetId => (
      targetId && targetId !== call.callerId && call.participants.has(targetId)
    ));
    const firstTargetId = uniqueTargets[0];
    if (!firstTargetId) return;

    const firstTarget = await this.users.findById(firstTargetId).catch(() => null);
    const callerPeerName = uniqueTargets.length > 1
      ? `${firstTarget?.phone ?? 'Participant'} + ${uniqueTargets.length - 1}`
      : firstTarget?.phone ?? 'Contact Oracle';

    await this.logCallAndNotify({
      callId,
      userId: call.callerId,
      peerId: firstTargetId,
      peerName: callerPeerName,
      type: call.type,
      direction: 'outgoing',
    });

    await Promise.all(uniqueTargets.map(targetId => this.logCallAndNotify({
      callId,
      userId: targetId,
      peerId: call.callerId,
      peerName: call.callerPhone || 'Contact Oracle',
      type: call.type,
      direction: 'incoming',
    }).catch(error => {
      console.warn('[call:history:start:target:error]', {
        callId,
        callerId: call.callerId,
        targetId,
        error: error?.message ?? error,
      });
    })));
  }

  private async logCallFinalState(
    callId: string,
    call: {
      callerId: string; callerName: string; callerPhone?: string | null; originalCallerId?: string; originalCallerName?: string; conversationId: string;
      type: 'audio' | 'video'; startedAt: number; answered: boolean; answeredAt?: number;
      participants: Set<string>;
    },
    enderId: string,
    reason: 'ended' | 'missed' | 'refused' | 'cancelled',
  ) {
    if (this.isDiagnosticCallId(callId)) return;
    const connected = call.answered && !!call.answeredAt && reason === 'ended';
    const duration = connected ? Math.max(1, Math.round((Date.now() - call.answeredAt!) / 1000)) : undefined;

    for (const uid of call.participants) {
      const originalCallerId = call.originalCallerId ?? call.callerId;
      const originalCallerName = call.callerPhone || 'Contact Oracle';
      const isCallerSide = uid === originalCallerId;
      const peerId = isCallerSide
        ? [...call.participants].find(p => p !== uid) ?? ''
        : originalCallerId;
      let peerName = originalCallerName;
      if (isCallerSide) {
        const peer = await this.users.findById(peerId).catch(() => null);
        peerName = peer?.phone ?? 'Contact Oracle';
      }

      const direction = connected
        ? (isCallerSide ? 'outgoing' : 'incoming')
        : reason === 'missed' && isCallerSide
          ? 'outgoing'
        : reason === 'refused'
          ? 'refused'
          : reason === 'cancelled'
            ? (isCallerSide ? 'cancelled' : 'missed')
            : 'missed';

      await this.logCallAndNotify({
        callId,
        userId: uid,
        peerId,
        peerName,
        type: call.type,
        direction,
        duration,
      }).catch(() => {});
    }
  }

  private async logCallAndNotify(dto: LogCallDto) {
    if (this.isDiagnosticCallId(dto.callId)) return null;
    const entry = await this.callsSvc.logCall(dto);
    this.socketState.emitToUser(dto.userId, 'call:history:changed', {
      callId: dto.callId,
      peerId: dto.peerId,
      type: dto.type,
      direction: dto.direction,
      duration: dto.duration ?? null,
      at: new Date().toISOString(),
      entry: entry ? {
        id: entry.id,
        callId: entry.callId,
        peerId: entry.peerId,
        peerName: entry.peerName,
        peerAvatar: null,
        type: entry.type,
        direction: entry.direction,
        duration: entry.duration,
        startedAt: entry.startedAt,
      } : null,
    });
    return entry;
  }

  private emitCallAnsweredToParticipants(
    call: { participants: Set<string> },
    payload: Record<string, unknown>,
  ) {
    const deliveredSockets = new Set<string>();
    for (const uid of call.participants) {
      for (const sid of this.socketState.getSocketIds(uid)) {
        if (deliveredSockets.has(sid)) continue;
        deliveredSockets.add(sid);
        this.server.to(sid).emit('call:answered', payload);
      }
    }
    return deliveredSockets.size;
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  @SubscribeMessage('presence:heartbeat')
  async handlePresenceHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { state?: 'active' | 'background'; at?: string },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    const userId = client.data.userId;
    if (!userId) return this.sendSocketAck(ack, { ok: false, message: 'Utilisateur non authentifié' });

    const wasActive = this.socketState.hasActiveUserPresence(userId, this.presenceHeartbeatTimeoutMs);
    const state = data?.state === 'background' ? 'background' : 'active';
    this.socketState.setSocketPresence(userId, client.id, state);
    const isActive = this.socketState.hasActiveUserPresence(userId, this.presenceHeartbeatTimeoutMs);

    if (state === 'active') {
      this.cancelOfflineTimer(userId);
      if (!wasActive) {
        await this.users.setPresence(userId, 'online');
      }
      this.server.emit('user:online', {
        userId,
        status: 'online',
        activeUntil: new Date(Date.now() + this.presenceHeartbeatTimeoutMs).toISOString(),
      });
    } else if (!isActive) {
      await this.users.setPresence(userId, 'connected').catch(() => {});
      this.emitUserConnected(userId);
      this.scheduleOfflineIfNoActivePresence(userId, this.presenceBackgroundGraceMs);
    }
    const clientVersion = this.socketClientVersions.get(client.id);
    if (!this.isClientVersionCallCapable(clientVersion)) this.emitUpdateRequired(client, 'calls');

    return this.sendSocketAck(ack, {
      ok: true,
      state,
      active: isActive,
      sockets: this.socketState.getUserPresenceSnapshot(userId).length,
    });
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const allowed = await this.chat.isParticipant(data.conversationId, client.data.userId);
      if (!allowed) {
        client.emit('conversation:error', { message: 'Accès refusé à cette conversation' });
        return;
      }
      client.join(`conv:${data.conversationId}`);
      await this.emitConversationPresenceSnapshot(client, data.conversationId);
      const updatedMessages = await this.chat.markConversationRead(data.conversationId, client.data.userId);
      await this.broadcastConversationRead(data.conversationId, client.data.userId, updatedMessages);
    } catch {
      client.emit('conversation:error', { message: 'Ouverture de conversation impossible' });
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string; type?: string; replyToId?: string; clientSentAt?: string; clientMessageId?: string },
  ) {
    try {
      const receivedAt = Date.now();
      const clientSentAtMs = data.clientSentAt ? Date.parse(data.clientSentAt) : NaN;
      const msg = await this.chat.createMessage(
        data.conversationId,
        client.data.userId,
        data.content,
        data.type ?? 'text',
        data.replyToId,
        data.clientMessageId,
      );
      const serverEmittedAt = Date.now();
      const transportTrace = {
        clientSentAt: data.clientSentAt,
        serverReceivedAt: new Date(receivedAt).toISOString(),
        serverEmittedAt: new Date(serverEmittedAt).toISOString(),
        clientToServerMs: Number.isFinite(clientSentAtMs) ? Math.max(0, receivedAt - clientSentAtMs) : undefined,
        serverCreateAndEmitMs: serverEmittedAt - receivedAt,
      };
      const emittedMessage = { ...msg, transport: transportTrace };

      // 1. Diffuser à tous dans la room (ceux qui ont fait conversation:join)
      const conversationRoom = `conv:${data.conversationId}`;
      this.server.to(conversationRoom).emit('message:new', emittedMessage);

      // 2. Notifier les participants connectés mais pas dans la room
      const participantIds = await this.chat.getParticipantIds(data.conversationId);
      const senderName = msg.sender?.name ?? 'Oracle Messenger';
      const preview = msg.type === 'text'
        ? (msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content)
        : msg.type === 'image' ? '📷 Photo'
        : msg.type === 'video' ? '🎥 Vidéo'
        : msg.type === 'audio' ? '🎵 Audio'
        : '📎 Fichier';

      const pushRecipientIds: string[] = [];
      const socketDeliveredRecipientIds: string[] = [];
      const deliveryTrace: Array<{
        receiverId: string;
        sockets: number;
        openConversation: boolean;
        pushQueued: boolean;
      }> = [];
      for (const pid of participantIds) {
        if (pid === client.data.userId) continue;
        const socketCount = await this.getUserSocketCountGlobal(pid);
        const hasOpenConversation = await this.isUserInRoomGlobal(pid, conversationRoom);
        const receiverTrace: {
          receiverId: string;
          sockets: number;
          openConversation: boolean;
          pushQueued: boolean;
        } = { receiverId: pid, sockets: socketCount, openConversation: hasOpenConversation, pushQueued: !hasOpenConversation };
        if (socketCount) {
          // Connecté → socket temps réel, sauf l'écran déjà ouvert qui reçoit par la room.
          this.socketState.emitToUserExceptRoom(pid, conversationRoom, 'message:new', emittedMessage);
          socketDeliveredRecipientIds.push(pid);
        }
        if (!hasOpenConversation) {
          pushRecipientIds.push(pid);
        }
        deliveryTrace.push(receiverTrace);
      }
      console.info('[message:send:trace]', {
        messageId: msg.id,
        conversationId: data.conversationId,
        senderId: client.data.userId,
        type: msg.type,
        receivers: deliveryTrace,
        connectedRecipients: deliveryTrace.filter(item => item.sockets > 0).length,
        pushQueuedRecipients: pushRecipientIds.length,
        ...transportTrace,
      });

      void this.broadcastConversationSummaries(data.conversationId, participantIds)
        .catch(error => console.warn('[message:summary:error]', {
          messageId: msg.id,
          error: error?.message ?? error,
        }));
      void (async () => {
        const pushTrace: Array<{ receiverId: string; targets: number; delivered: number; failed: number }> = [];
        for (const pid of pushRecipientIds) {
          const pushResult = await this.notif.sendPush(pid, {
            title: senderName,
            body: preview,
            url: `oraclemessenger://notification?conversationId=${encodeURIComponent(data.conversationId)}`,
            tag: `msg-${data.conversationId}`,
            type: 'message',
            conversationId: data.conversationId,
          }).catch(() => ({ targets: 0, delivered: 0, failed: 1 }));
          pushTrace.push({ receiverId: pid, ...pushResult });
        }
        if (pushTrace.length) {
          console.info('[message:push:trace]', {
            messageId: msg.id,
            conversationId: data.conversationId,
            receivers: pushTrace,
          });
        }
      })().catch(error => console.warn('[message:push:error]', {
        messageId: msg.id,
        error: error?.message ?? error,
      }));

      this.scheduleAiAutoReplies(msg, participantIds, client.data.userId);
      this.scheduleBusinessMediaAnalysis(msg, participantIds, client.data.userId);
      if (socketDeliveredRecipientIds.length) {
        console.info('[message:socket-emitted:awaiting-client-ack]', {
          messageId: msg.id,
          conversationId: data.conversationId,
          receivers: socketDeliveredRecipientIds,
        });
      }

      return {
        ...emittedMessage,
        status: 'sent',
        updatedAt: emittedMessage.updatedAt,
      };
    } catch (err: any) {
      client.emit('message:error', { message: err?.message ?? 'Erreur envoi' });
    }
  }

  private scheduleAiAutoReplies(msg: any, participantIds: string[], senderId: string) {
    if (!msg?.id || msg.type !== 'text') return;
    for (const recipientId of participantIds) {
      if (recipientId === senderId) continue;
      this.aiAuto.shouldAutoReply(recipientId, senderId, msg.conversationId, msg)
        .then(rule => {
          if (!rule) return;
          const timer = setTimeout(() => {
            this.sendAiAutoReply(recipientId, msg, rule.prompt).catch(error => {
              console.warn('[ai-auto] reply failed', { recipientId, conversationId: msg.conversationId, error: error?.message ?? error });
            });
          }, Math.max(0, rule.delayMs));
          timer.unref?.();
        })
        .catch(error => {
          console.warn('[ai-auto] rule check failed', { recipientId, conversationId: msg.conversationId, error: error?.message ?? error });
        });
    }
  }

  private scheduleBusinessMediaAnalysis(msg: any, participantIds: string[], senderId: string) {
    if (!msg?.id || !this.isBusinessAnalyzableMedia(msg.type)) return;
    const media = this.parseMessageMediaPayload(msg);
    if (!media?.url) return;
    for (const recipientId of participantIds) {
      if (recipientId === senderId) continue;
      Promise.all([
        this.business.getAccess(recipientId),
        this.aiAuto.shouldAnalyzeBusinessMedia(recipientId, senderId, msg.conversationId, msg),
      ])
        .then(([access, rule]) => {
          if (!access.canAct || !rule) return;
          const timer = setTimeout(() => {
            this.sendBusinessMediaAnalysis(recipientId, msg, rule.prompt, media).catch(error => {
              console.warn('[business-ai] media analysis failed', { recipientId, conversationId: msg.conversationId, error: error?.message ?? error });
            });
          }, Math.max(30_000, rule.delayMs));
          timer.unref?.();
        })
        .catch(error => {
          console.warn('[business-ai] media rule check failed', { recipientId, conversationId: msg.conversationId, error: error?.message ?? error });
        });
    }
  }

  private async sendAiAutoReply(aiUserId: string, incomingMsg: any, prompt: string) {
    const generated = await this.aiAuto.generateAutoReply(
      aiUserId,
      this.buildIncomingAiContext(incomingMsg),
      prompt,
      incomingMsg.conversationId,
      incomingMsg.id,
    );
    this.business.applyAiMessageInsight(
      aiUserId,
      incomingMsg.senderId,
      incomingMsg.conversationId,
      incomingMsg.content,
    ).catch(error => {
      console.warn('[business-ai] crm action failed', { ownerId: aiUserId, conversationId: incomingMsg.conversationId, error: error?.message ?? error });
    });
    await this.sendGeneratedAiMessages(aiUserId, incomingMsg.conversationId, incomingMsg.id, generated.response, 'Assistant IA');
  }

  private async sendBusinessMediaAnalysis(aiUserId: string, incomingMsg: any, prompt: string, media: { url: string; mime?: string; name?: string; type?: string; size?: number }) {
    const generated = await this.aiAuto.generateAutoMediaReply(
      aiUserId,
      this.buildIncomingMediaAiContext(incomingMsg, media),
      prompt,
      incomingMsg.conversationId,
      incomingMsg.id,
      media,
    );
    this.business.applyAiMessageInsight(
      aiUserId,
      incomingMsg.senderId,
      incomingMsg.conversationId,
      `[${media.type || incomingMsg.type}] ${media.name || 'document client'} ${generated.response}`,
    ).catch(error => {
      console.warn('[business-ai] media crm action failed', { ownerId: aiUserId, conversationId: incomingMsg.conversationId, error: error?.message ?? error });
    });
    await this.sendGeneratedAiMessages(aiUserId, incomingMsg.conversationId, incomingMsg.id, generated.response, 'Assistant Business IA');
  }

  private buildIncomingAiContext(incomingMsg: any) {
    const senderName = this.publicContactName(incomingMsg?.sender?.name || incomingMsg?.sender?.username || 'ce contact');
    return [
      `Nom du contact: ${senderName}`,
      `Message entrant: ${String(incomingMsg?.content || '').trim()}`,
      'Réponds directement à ce contact selon le prompt utilisateur et le prompt système.',
      'Respecte le nombre maximum de mots configuré pour l’agent virtuel. Le gratuit reste limité côté serveur.',
    ].join('\n');
  }

  private buildIncomingMediaAiContext(incomingMsg: any, media: { url: string; mime?: string; name?: string; type?: string; size?: number }) {
    const senderName = this.publicContactName(incomingMsg?.sender?.name || incomingMsg?.sender?.username || 'ce contact');
    return [
      `Nom du contact: ${senderName}`,
      `Message entrant: le contact a envoyé un média ${media.type || incomingMsg?.type || 'fichier'}.`,
      `Nom du fichier: ${media.name || 'non renseigné'}`,
      `Type MIME: ${media.mime || 'inconnu'}`,
      media.size ? `Taille: ${media.size} octets` : '',
      `URL interne: ${media.url}`,
      'Ce traitement est exécuté au moins 30 secondes après réception pour laisser le téléchargement se terminer.',
      'Si le média est une facture, un reçu, une preuve de paiement, un devis ou une image commerciale, analyse le montant, la date, le statut et la prochaine action.',
      'Ne confirme pas un paiement si la preuve est ambiguë. Demande une confirmation claire si nécessaire.',
      'Réponds directement au client selon le prompt utilisateur et le prompt système.',
    ].filter(Boolean).join('\n');
  }

  private isBusinessAnalyzableMedia(type: string) {
    return ['image', 'video', 'file', 'document'].includes(String(type || '').toLowerCase());
  }

  private parseMessageMediaPayload(msg: any) {
    try {
      const parsed = JSON.parse(String(msg?.content || '{}'));
      const url = String(parsed?.url || '').trim();
      if (!url) return null;
      return {
        url,
        mime: String(parsed?.mime || '').trim() || undefined,
        name: String(parsed?.name || '').trim() || undefined,
        type: String(msg?.type || parsed?.kind || parsed?.type || 'file').trim(),
        size: Number(parsed?.size) || undefined,
      };
    } catch {
      return null;
    }
  }

  private async sendGeneratedAiMessages(senderId: string, conversationId: string, replyToId: string | null, generatedText: string, titleFallback = 'Assistant IA') {
    const extracted = this.extractAiMediaAttachments(generatedText);
    let sent = 0;
    if (extracted.cleanText) {
      const reply = await this.chat.createMessage(conversationId, senderId, extracted.cleanText, 'text', replyToId || undefined);
      await this.emitCreatedMessageToParticipants(reply, senderId, titleFallback);
      sent += 1;
    }
    for (const attachment of extracted.attachments) {
      const payload = JSON.stringify({
        url: attachment.url,
        mime: attachment.mime,
        name: attachment.name,
      });
      const reply = await this.chat.createMessage(conversationId, senderId, payload, attachment.type, replyToId || undefined);
      await this.emitCreatedMessageToParticipants(reply, senderId, titleFallback);
      sent += 1;
    }
    if (!sent) {
      const reply = await this.chat.createMessage(conversationId, senderId, 'Je vérifie ce point et je reviens vers vous.', 'text', replyToId || undefined);
      await this.emitCreatedMessageToParticipants(reply, senderId, titleFallback);
    }
  }

  private extractAiMediaAttachments(text: string) {
    const attachments: Array<{ type: 'image' | 'video' | 'file'; mime: string; name: string; url: string }> = [];
    const cleanText = String(text || '').replace(/\[\[MEDIA\|([^|\]]+)\|([^|\]]+)\|([^|\]]+)\|([^\]]+)\]\]/g, (_match, rawType, rawMime, rawName, rawUrl) => {
      const url = String(rawUrl || '').trim();
      if (!this.isAllowedAiMediaUrl(url)) return '';
      const type = String(rawType || '').toLowerCase() === 'image'
        ? 'image'
        : String(rawType || '').toLowerCase() === 'video'
          ? 'video'
          : 'file';
      attachments.push({
        type,
        mime: String(rawMime || '').trim().slice(0, 100) || (type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : 'application/octet-stream'),
        name: String(rawName || 'support').replace(/[\r\n]/g, ' ').trim().slice(0, 160) || 'support',
        url,
      });
      return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { cleanText, attachments: attachments.slice(0, 3) };
  }

  private isAllowedAiMediaUrl(url: string) {
    const clean = String(url || '').trim();
    if (!clean) return false;
    if (clean.startsWith('/uploads/')) return true;
    try {
      const parsed = new URL(clean);
      return parsed.pathname.startsWith('/uploads/');
    } catch {
      return false;
    }
  }

  private publicContactName(value: unknown) {
    const clean = String(value || '').trim();
    if (!clean) return 'ce contact';
    if (clean.startsWith('@')) return clean.slice(1).trim() || 'ce contact';
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return clean.split('@')[0] || 'ce contact';
    return clean;
  }

  private async dispatchDueBusinessReminderActions() {
    if (this.businessReminderRunning) return;
    this.businessReminderRunning = true;
    try {
      const actions = await this.business.collectDueAiReminderActions(20);
      for (const action of actions) {
        try {
          const generated = await this.aiAuto.generateBusinessReminder(action.ownerId, action.context, action.conversationId);
          await this.sendGeneratedAiMessages(action.ownerId, action.conversationId, null, generated.response, 'Assistant Business IA');
          await this.business.markAiReminderExecuted(action.ownerId, action.reminderId);
        } catch (error: any) {
          console.warn('[business-ai] reminder action failed', {
            ownerId: action.ownerId,
            conversationId: action.conversationId,
            reminderId: action.reminderId,
            error: error?.message ?? error,
          });
        }
      }
    } finally {
      this.businessReminderRunning = false;
    }
  }

  private async emitCreatedMessageToParticipants(reply: any, senderId: string, titleFallback = 'Assistant IA') {
    const participantIds = await this.chat.getParticipantIds(reply.conversationId);
    const room = `conv:${reply.conversationId}`;
    const serverEmittedAt = new Date().toISOString();
    const emittedReply = { ...reply, transport: { serverEmittedAt } };
    this.server.to(room).emit('message:new', emittedReply);
    const senderName = reply.sender?.name ?? titleFallback;
    const preview = reply.content.length > 80 ? `${reply.content.slice(0, 80)}…` : reply.content;
    for (const pid of participantIds) {
      if (pid === senderId) continue;
      const socketCount = await this.getUserSocketCountGlobal(pid);
      const hasOpenConversation = await this.isUserInRoomGlobal(pid, room);
      if (socketCount) {
        this.socketState.emitToUserExceptRoom(pid, room, 'message:new', emittedReply);
      }
      if (!hasOpenConversation) {
        await this.notif.sendPush(pid, {
          title: senderName,
          body: preview,
          url: `oraclemessenger://notification?conversationId=${encodeURIComponent(reply.conversationId)}`,
          tag: `msg-${reply.conversationId}`,
          type: 'message',
          conversationId: reply.conversationId,
        }).catch(() => ({ targets: 0, delivered: 0, failed: 1 }));
      }
    }
    await this.broadcastConversationSummaries(reply.conversationId, participantIds);
  }

  @SubscribeMessage('message:delivered')
  async handleDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; conversationId?: string; clientReceivedAt?: string; serverEmittedAt?: string },
  ) {
    try {
      const msg = await this.chat.markMessageDelivered(data.messageId, client.data.userId);
      const serverEmittedAtMs = data.serverEmittedAt ? Date.parse(data.serverEmittedAt) : NaN;
      const clientReceivedAtMs = data.clientReceivedAt ? Date.parse(data.clientReceivedAt) : NaN;
      console.info('[message:delivered:ack]', {
        messageId: data.messageId,
        receiverId: client.data.userId,
        conversationId: msg.conversationId,
        status: msg.status,
        serverToClientMs: Number.isFinite(serverEmittedAtMs) && Number.isFinite(clientReceivedAtMs)
          ? Math.max(0, clientReceivedAtMs - serverEmittedAtMs)
          : undefined,
        clientAckToServerMs: Number.isFinite(clientReceivedAtMs)
          ? Math.max(0, Date.now() - clientReceivedAtMs)
          : undefined,
      });
      const payload = { id: msg.id, patch: { status: msg.status, updatedAt: msg.updatedAt } };
      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      for (const uid of participantIds) {
        this.socketState.emitToUser(uid, 'message:update', payload);
      }
    } catch (error: any) {
      console.warn('[message:delivered:error]', {
        messageId: data?.messageId,
        receiverId: client.data.userId,
        error: error?.message ?? error,
      });
    }
  }

  @SubscribeMessage('message:read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; messageId?: string },
  ) {
    try {
      const updatedMessages = await this.chat.markConversationRead(data.conversationId, client.data.userId, data.messageId);
      console.info('[message:read:ack]', {
        conversationId: data.conversationId,
        messageId: data.messageId,
        readerId: client.data.userId,
        updated: updatedMessages.length,
      });
      await this.broadcastConversationRead(data.conversationId, client.data.userId, updatedMessages);
    } catch (error: any) {
      console.warn('[message:read:error]', {
        conversationId: data?.conversationId,
        messageId: data?.messageId,
        readerId: client.data.userId,
        error: error?.message ?? error,
      });
    }
  }

  @SubscribeMessage('message:react')
  async handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; emoji?: string | null },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    try {
      const msg = await this.chat.reactToMessage(data.messageId, client.data.userId, data.emoji);
      if (!msg) return this.sendSocketAck(ack, { ok: false, message: 'Message introuvable' });
      const payload = {
        id: msg.id,
        patch: {
          reactions: msg.reactions,
          updatedAt: msg.updatedAt,
        },
      };
      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      for (const uid of participantIds) {
        this.socketState.emitToUser(uid, 'message:update', payload);
      }
      return this.sendSocketAck(ack, { ok: true, ...payload });
    } catch (err: any) {
      const message = err?.message ?? 'Erreur réaction';
      client.emit('message:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
  }

  @SubscribeMessage('message:media-saved')
  async handleMediaSaved(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; checksum?: string; size?: number },
  ) {
    try {
      const result = await this.chat.markMediaSavedLocally(data.messageId, client.data.userId, data.checksum, data.size);
      if (!result.cleared) return;

      const msg: any = result.message;
      const patch = { content: '', updatedAt: msg.updatedAt };
      this.server.to(`conv:${msg.conversationId}`).emit('message:update', {
        id: msg.id,
        patch,
      });

      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      for (const uid of participantIds) {
        this.socketState.emitToUser(uid, 'message:update', { id: msg.id, patch });
      }
    } catch {}
  }

  @SubscribeMessage('message:edit')
  async handleEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; content: string },
  ) {
    try {
      const msg = await this.chat.editMessage(data.messageId, client.data.userId, data.content);
      const payload = {
        id: msg.id,
        patch: { content: msg.content, isEdited: true, updatedAt: msg.updatedAt },
      };
      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      this.server.to(`conv:${msg.conversationId}`).emit('message:update', payload);
      for (const uid of participantIds) {
        this.socketState.emitToUser(uid, 'message:update', payload);
      }
      await this.broadcastConversationSummaries(msg.conversationId, participantIds);
    } catch {}
  }

  @SubscribeMessage('message:media-ready')
  async handleMediaReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; content: string },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    try {
      const msg = await this.chat.updateMediaMessageContent(data.messageId, client.data.userId, data.content);
      const payload = {
        id: msg.id,
        patch: { content: msg.content, updatedAt: msg.updatedAt },
      };
      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      this.server.to(`conv:${msg.conversationId}`).emit('message:update', payload);
      for (const uid of participantIds) {
        this.socketState.emitToUser(uid, 'message:update', payload);
      }
      await this.broadcastConversationSummaries(msg.conversationId, participantIds);
      console.info('[message:media-ready]', {
        messageId: msg.id,
        conversationId: msg.conversationId,
        senderId: client.data.userId,
        serverEmittedAt: new Date().toISOString(),
      });
      return this.sendSocketAck(ack, { ok: true, message: msg });
    } catch (err: any) {
      const message = err?.message ?? 'Finalisation média impossible';
      client.emit('message:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
  }

  @SubscribeMessage('message:delete')
  async handleDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; conversationId: string },
  ) {
    try {
      const msg = await this.chat.deleteMessage(data.messageId, client.data.userId);
      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      const payload = {
        conversationId: msg.conversationId,
        messageId: msg.id,
      };
      this.server.to(`conv:${msg.conversationId}`).emit('message:delete', payload);
      for (const uid of participantIds) {
        this.socketState.emitToUser(uid, 'message:delete', payload);
      }
      await this.broadcastConversationSummaries(msg.conversationId, participantIds);
    } catch {}
  }

  // ── Typing ────────────────────────────────────────────────────────────────

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const allowed = await this.chat.isParticipant(data.conversationId, client.data.userId);
      if (!allowed) return;
      const participantIds = await this.chat.getParticipantIds(data.conversationId);
      const user = await this.users.findById(client.data.userId).catch(() => null);
      const payload = {
        conversationId: data.conversationId,
        userId: client.data.userId,
        userName: user?.name ?? '',
      };
      for (const uid of participantIds) {
        if (uid === client.data.userId) continue;
        this.socketState.emitToUser(uid, 'typing:start', payload);
      }
    } catch {}
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const allowed = await this.chat.isParticipant(data.conversationId, client.data.userId);
      if (!allowed) return;
      const participantIds = await this.chat.getParticipantIds(data.conversationId);
      const payload = {
        conversationId: data.conversationId,
        userId: client.data.userId,
      };
      for (const uid of participantIds) {
        if (uid === client.data.userId) continue;
        this.socketState.emitToUser(uid, 'typing:stop', payload);
      }
    } catch {}
  }

  // ── Appels LiveKit/SFU ────────────────────────────────────────────────────

  @SubscribeMessage('call:start')
  async handleCallStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      callId: string;
      conversationId: string;
      type: 'audio' | 'video';
      targetUserIds: string[];
      requestedPeerId?: string;
      mediaProvider?: 'livekit' | 'webrtc';
    },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    try {
      const callerId = client.data.userId;
      if (!this.isClientVersionCallCapable(this.socketClientVersions.get(client.id))) {
        const message = 'Mettez à jour Oracle Messenger pour passer des appels. La messagerie reste disponible.';
        this.emitUpdateRequired(client, 'calls');
        client.emit('call:error', { message, updateRequired: true });
        return this.sendSocketAck(ack, {
          ok: false,
          message,
          updateRequired: true,
          minVersionCode: this.minCallVersionCode,
        });
      }
      if (!data.callId || this.activeCalls.has(data.callId)) {
        const message = 'Identifiant d’appel invalide';
        client.emit('call:error', { message });
        return this.sendSocketAck(ack, { ok: false, message });
      }
      if (data.type !== 'audio' && data.type !== 'video') {
        const message = 'Type d’appel invalide';
        client.emit('call:error', { message });
        return this.sendSocketAck(ack, { ok: false, message });
      }
      const allowed = await this.chat.isParticipant(data.conversationId, callerId);
      if (!allowed) {
        const message = 'Accès refusé à cette conversation';
        client.emit('call:error', { message });
        return this.sendSocketAck(ack, { ok: false, message });
      }
      if (await this.chat.isOfficialConversation(data.conversationId)) {
        const message = 'Le compte système ne peut pas être appelé';
        client.emit('call:error', { message });
        return this.sendSocketAck(ack, { ok: false, message });
      }

      const [participantIds, knownCallableIds] = await Promise.all([
        this.chat.getParticipantIds(data.conversationId),
        this.chat.getKnownCallableUserIds(callerId),
      ]);
      const allowedTargets = new Set([...participantIds, ...knownCallableIds]);
      const requestedTargets = [...new Set([
        ...(data.requestedPeerId ? [data.requestedPeerId] : []),
        ...(data.targetUserIds ?? []),
      ])]
        .filter(targetId => targetId !== callerId && allowedTargets.has(targetId));
      const conversationTargets = participantIds.filter(targetId => targetId !== callerId && allowedTargets.has(targetId));
      const validTargets = requestedTargets.length ? requestedTargets : conversationTargets;
      if (data.requestedPeerId && !requestedTargets.includes(data.requestedPeerId)) {
        console.warn('[call:start:requested-peer-rejected]', {
          callId: data.callId,
          callerId,
          conversationId: data.conversationId,
          requestedPeerId: data.requestedPeerId,
          participantIds,
          knownCallableCount: knownCallableIds.length,
        });
      }
      if (!validTargets.length) {
        const message = 'Aucun destinataire valide pour cet appel';
        console.warn('[call:start:no-valid-target]', {
          callId: data.callId,
          callerId,
          conversationId: data.conversationId,
          requestedPeerId: data.requestedPeerId,
          requestedTargets: data.targetUserIds ?? [],
          participantIds,
          knownCallableCount: knownCallableIds.length,
        });
        client.emit('call:error', { message });
        return this.sendSocketAck(ack, { ok: false, message });
      }
      if (!requestedTargets.length && conversationTargets.length) {
        console.info('[call:start:targets-recovered]', {
          callId: data.callId,
          callerId,
          conversationId: data.conversationId,
          recoveredTargets: conversationTargets,
          requestedPeerId: data.requestedPeerId,
          requestedTargets: data.targetUserIds ?? [],
        });
      }
      const participantLimit = this.maxCallParticipants(data.type);
      if (validTargets.length + 1 > participantLimit) {
        const message = `Limite d’appel ${data.type === 'video' ? 'vidéo' : 'audio'} atteinte : ${participantLimit} participants maximum.`;
        client.emit('call:error', { message, maxParticipants: participantLimit });
        return this.sendSocketAck(ack, { ok: false, message, maxParticipants: participantLimit });
      }
      const outdatedConnectedTargets = validTargets
        .map(targetId => ({ targetId, compatibility: this.getUserConnectedCallCompatibility(targetId) }))
        .filter(item => item.compatibility.socketIds.length > 0 && !item.compatibility.callCapable);
      if (outdatedConnectedTargets.length) {
        for (const item of outdatedConnectedTargets) this.notifyUserUpdateRequired(item.targetId, 'calls');
        const message = outdatedConnectedTargets.length === 1
          ? 'Ce contact doit mettre à jour Oracle Messenger pour recevoir les appels. La messagerie reste disponible.'
          : `${outdatedConnectedTargets.length} contacts doivent mettre à jour Oracle Messenger pour recevoir les appels.`;
        console.warn('[call:start:target-update-required]', {
          callId: data.callId,
          callerId,
          conversationId: data.conversationId,
          targets: outdatedConnectedTargets.map(item => ({
            targetId: item.targetId,
            socketCount: item.compatibility.socketIds.length,
            versions: item.compatibility.versions.map(version => version.versionCode),
          })),
          minCallVersionCode: this.minCallVersionCode,
        });
        client.emit('call:error', {
          message,
          updateRequired: true,
          targetUserIds: outdatedConnectedTargets.map(item => item.targetId),
        });
        return this.sendSocketAck(ack, {
          ok: false,
          message,
          updateRequired: true,
          targetUserIds: outdatedConnectedTargets.map(item => item.targetId),
        });
      }
      const sfuEnabled = this.callsSvc.isSfuEnabled();
      const privateTurnConfigured = this.callsSvc.hasPrivateTurn();
      if (this.strictRealtimeMode && !sfuEnabled) {
        const message = 'Appels indisponibles : LiveKit/SFU doit être configuré pour le mode temps réel strict.';
        client.emit('call:error', { message, industrialReady: false });
        return this.sendSocketAck(ack, { ok: false, message, industrialReady: false });
      }
      if (this.strictRealtimeMode && !privateTurnConfigured) {
        const message = 'Appels indisponibles : TURN privé obligatoire pour le mode temps réel strict.';
        client.emit('call:error', { message, industrialReady: false });
        return this.sendSocketAck(ack, { ok: false, message, industrialReady: false });
      }
      const requestedMediaProvider = data.mediaProvider === 'livekit' ? 'livekit' : 'webrtc';
      const mediaProvider = (this.strictRealtimeMode || requestedMediaProvider === 'livekit') && sfuEnabled
        ? 'livekit'
        : 'webrtc';
      const busyCall = this.getBusyCallDetails([callerId, ...validTargets]);
      if (busyCall) {
        const callerBusy = busyCall.userIds.includes(callerId);
        const busyTargetIds = busyCall.userIds.filter(userId => userId !== callerId);
        const message = callerBusy
          ? 'Vous êtes déjà dans un appel actif.'
          : busyTargetIds.length === 1
            ? 'Ce contact est déjà en appel.'
            : 'Un ou plusieurs contacts sont déjà en appel.';
        console.info('[call:start:busy]', {
          callId: data.callId,
          callerId,
          busyCallId: busyCall.callId,
          callerBusy,
          busyTargetIds,
        });
        client.emit('call:error', {
          code: 'participant_busy',
          message,
          callId: busyCall.callId,
          busyUserIds: busyCall.userIds,
        });
        return this.sendSocketAck(ack, {
          ok: false,
          code: 'participant_busy',
          message,
          callId: busyCall.callId,
          busyUserIds: busyCall.userIds,
        });
      }

      const caller = await this.users.findById(callerId);
      const callerName = caller?.name ?? 'Quelqu\'un';
      const callerPhone = caller?.phone || null;
      const diagnosticCall = this.isDiagnosticCallId(data.callId);
      console.info('[call:start]', {
        callId: data.callId,
        callerId,
        conversationId: data.conversationId,
        type: data.type,
        targets: validTargets.length,
        conversationParticipants: participantIds.length,
        knownCallable: knownCallableIds.length,
        requestedPeerId: data.requestedPeerId,
        requestedMediaProvider: data.mediaProvider,
        mediaProvider,
        mediaPolicy: mediaProvider === 'webrtc' ? 'webrtc-direct-or-fallback' : 'livekit-sfu',
        strictRealtimeMode: this.strictRealtimeMode,
        privateTurnConfigured,
        diagnosticCall,
      });

      client.join(`call:${data.callId}`);

      // Mémoriser l'appel actif pour le logging à la fin
      this.activeCalls.set(data.callId, {
        callerId,
        callerName,
        callerPhone,
        originalCallerId: callerId,
        originalCallerName: callerName,
        conversationId: data.conversationId,
        type: data.type,
        mediaProvider,
        startedAt: Date.now(),
        answered: false,
        answeredUserIds: new Set(),
        participants: new Set([callerId, ...validTargets]),
      });
      const activeCall = this.activeCalls.get(data.callId);
      if (activeCall && !diagnosticCall) {
        await this.logCallStartedState(data.callId, activeCall, validTargets).catch(error => {
          console.warn('[call:history:start:error]', {
            callId: data.callId,
            callerId,
            targets: validTargets,
            error: error?.message ?? error,
          });
        });
      }
      console.info('[CALL_CREATED]', {
        callId: data.callId,
        callerId,
        conversationId: data.conversationId,
        type: data.type,
        mediaProvider,
      });
      this.scheduleNoAnswerTimeout(data.callId);

      for (const targetId of validTargets) {
        const socketIds = this.socketState.getSocketIds(targetId);
        const activeSocketIds = this.socketState.getActiveSocketIds(targetId, this.presenceHeartbeatTimeoutMs);
        if (diagnosticCall) {
          for (const callerSocketId of this.socketState.getSocketIds(callerId)) {
            this.server.to(callerSocketId).emit('call:delivery', {
              callId: data.callId,
              receiverId: targetId,
              socketCount: socketIds.length,
              activeSocketCount: activeSocketIds.length,
              pushTargets: 0,
              pushDelivered: 0,
              pushFailed: 0,
              reachable: socketIds.length > 0 || activeSocketIds.length > 0,
              diagnosticCall: true,
              at: new Date().toISOString(),
            });
          }
        } else {
          this.notif.sendPush(targetId, {
            title: callerPhone
              ? `📞 Appel ${data.type === 'video' ? 'vidéo' : 'audio'} — ${callerPhone}`
              : `📞 Appel ${data.type === 'video' ? 'vidéo' : 'audio'} Oracle Messenger`,
            body: 'Ouvrez Oracle Messenger pour répondre.',
            url: `oraclemessenger://call?action=open&callId=${encodeURIComponent(data.callId)}&conversationId=${encodeURIComponent(data.conversationId)}`,
            tag: `incoming-call-${data.callId}`,
            type: 'call',
            callId: data.callId,
            conversationId: data.conversationId,
            callerName: callerPhone || callerName,
            callerPhone,
            callType: data.type,
            requireInteraction: true,
            vibrate: [1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000],
          }).then(pushResult => {
            console.info('[call:push:result]', {
              callId: data.callId,
              callerId,
              receiverId: targetId,
              targets: pushResult.targets,
              delivered: pushResult.delivered,
              failed: pushResult.failed,
            });
            for (const callerSocketId of this.socketState.getSocketIds(callerId)) {
              this.server.to(callerSocketId).emit('call:delivery', {
                callId: data.callId,
                receiverId: targetId,
                socketCount: socketIds.length,
                activeSocketCount: activeSocketIds.length,
                pushTargets: pushResult.targets,
                pushDelivered: pushResult.delivered,
                pushFailed: pushResult.failed,
                reachable: socketIds.length > 0 || activeSocketIds.length > 0 || pushResult.delivered > 0,
                at: new Date().toISOString(),
              });
            }
          }).catch(error => {
            console.warn('[call:push:error]', {
              callId: data.callId,
              callerId,
              receiverId: targetId,
              error: error?.message ?? error,
            });
            for (const callerSocketId of this.socketState.getSocketIds(callerId)) {
              this.server.to(callerSocketId).emit('call:delivery', {
                callId: data.callId,
                receiverId: targetId,
                socketCount: socketIds.length,
                activeSocketCount: activeSocketIds.length,
                pushTargets: 0,
                pushDelivered: 0,
                pushFailed: 1,
                reachable: socketIds.length > 0 || activeSocketIds.length > 0,
                error: error?.message ?? String(error),
                at: new Date().toISOString(),
              });
            }
          });
        }

        console.info('[call:incoming:target]', {
          callId: data.callId,
          callerId,
          targetId,
          sockets: socketIds.length,
          activeSockets: activeSocketIds.length,
          pushQueued: !diagnosticCall,
          notificationState: diagnosticCall ? 'diagnostic-skipped' : 'queued',
        });
        if (socketIds.length) {
          for (const sid of socketIds) {
            const targetSocket = this.server.sockets.sockets.get(sid);
            targetSocket?.join(`call:${data.callId}`);
            console.info('[CALL_SIGNAL_SENT]', {
              callId: data.callId,
              fromUserId: callerId,
              toUserId: targetId,
              socketId: sid,
              signal: 'call:incoming',
              mediaProvider,
            });
            this.server.to(sid).emit('call:incoming', {
              callId: data.callId,
              conversationId: data.conversationId,
              callerId,
              callerName: callerPhone || callerName,
              callerPhone,
              type: data.type,
              mediaProvider,
              participants: validTargets,
            });
            console.info('[call:incoming:socket-emit]', {
              callId: data.callId,
              callerId,
              receiverId: targetId,
              socketId: sid,
              mediaProvider,
            });
          }
        }
      }
      return this.sendSocketAck(ack, { ok: true, callId: data.callId, targets: validTargets.length, mediaProvider });
    } catch (err: any) {
      const message = err?.message ?? 'Erreur de démarrage d’appel';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; accepted: boolean; mediaProvider?: 'livekit' | 'webrtc'; reason?: 'busy' | 'refused' },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    const responderId = client.data.userId;
    const call = this.getAuthorizedCall(data.callId, responderId);
    if (!call || responderId === call.callerId) {
      const message = 'Appel introuvable ou non autorisé';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
    if (call.ending) {
      const message = 'Appel déjà terminé';
      client.emit('call:ended', {
        callId: data.callId,
        userId: call.endingBy ?? call.callerId,
      });
      return this.sendSocketAck(ack, { ok: false, message, ended: true });
    }
    client.join(`call:${data.callId}`);

    if (call && data.accepted) {
      if (call.mediaProvider === 'livekit' && data.mediaProvider === 'webrtc') {
        const message = 'Réponse refusée : cet appel a été ouvert en mode LiveKit/SFU.';
        client.emit('call:error', { message });
        return this.sendSocketAck(ack, { ok: false, message });
      }
      if (call.mediaProvider === 'livekit' && !this.callsSvc.isSfuEnabled()) {
        const message = 'LiveKit/SFU n’est pas configuré sur le serveur.';
        client.emit('call:error', { message });
        return this.sendSocketAck(ack, { ok: false, message });
      }
      if (!call.answered) {
        call.answered = true;
        call.answeredAt = Date.now();
        this.clearCallTimeout(data.callId);
      }
      call.answeredUserIds.add(responderId);
      this.syncCallNotifications(data.callId, call, 'accepted', [responderId]);
      console.info('[CALL_ACCEPTED]', {
        callId: data.callId,
        callerId: call.callerId,
        responderId,
        mediaProvider: call.mediaProvider,
      });
      console.info('[call:answer]', {
        callId: data.callId,
        callerId: call.callerId,
        responderId,
        accepted: true,
        callState: 'accepted',
        mediaProvider: call.mediaProvider,
      });
      const answeredPayload = {
        callId: data.callId,
        userId: responderId,
        accepted: true,
        mediaProvider: call.mediaProvider,
      };
      this.server.to(`call:${data.callId}`).emit('call:answered', answeredPayload);
      const directAnsweredSockets = this.emitCallAnsweredToParticipants(call, answeredPayload);
      console.info('[call:answered:delivered]', {
        callId: data.callId,
        responderId,
        directSockets: directAnsweredSockets,
      });
      return this.sendSocketAck(ack, {
        ok: true,
        accepted: true,
        mediaProvider: call.mediaProvider,
        room: data.callId,
        type: call.type,
        conversationId: call.conversationId,
      });
    }
    if (!data.accepted && call) {
      const shouldEndCall = call.participants.size <= 2;
      console.info('[call:answer]', {
        callId: data.callId,
        callerId: call.callerId,
        responderId,
        accepted: false,
        ended: shouldEndCall,
        callState: shouldEndCall ? 'rejected' : 'ringing',
      });
      this.syncCallNotifications(
        data.callId,
        call,
        'refused',
        shouldEndCall ? undefined : [responderId],
      );
      const refusedReason = data.reason === 'busy' ? 'busy' : 'refused';
      const refusedPayload = {
        callId: data.callId,
        userId: responderId,
        accepted: false,
        ended: shouldEndCall,
        mediaProvider: call.mediaProvider,
        reason: refusedReason,
      };
      this.server.to(`call:${data.callId}`).emit('call:answered', refusedPayload);
      const directRefusedSockets = this.emitCallAnsweredToParticipants(call, refusedPayload);
      console.info('[call:refused:delivered]', {
        callId: data.callId,
        responderId,
        directSockets: directRefusedSockets,
        reason: refusedReason,
      });
      if (!this.isDiagnosticCallId(data.callId)) {
        await this.publishCallTrace(call.conversationId, responderId, call.type, 'refused').catch(() => {});
      }
      if (shouldEndCall) {
        await this.logCallFinalState(data.callId, call, responderId, 'refused').catch(() => {});
        console.info('[CALL_ENDED]', {
          callId: data.callId,
          enderId: responderId,
          reason: 'refused',
          connected: false,
        });
      } else {
        await this.logCallAndNotify({
          callId: data.callId,
          userId: responderId,
          peerId: call.callerId,
          peerName: call.callerName,
          type: call.type,
          direction: 'refused',
        }).catch(() => {});
      }
      for (const sid of this.socketState.getSocketIds(responderId)) {
        const responderSocket = this.server.sockets.sockets.get(sid);
        responderSocket?.leave(`call:${data.callId}`);
      }
      this.clearCallTimeout(data.callId);
      if (shouldEndCall) {
        this.clearPendingWebRtcSignals(data.callId);
        this.activeCalls.delete(data.callId);
      } else {
        call.participants.delete(responderId);
        call.answeredUserIds.delete(responderId);
        if (!call.participants.size || [...call.participants].every(id => id === call.callerId)) {
          this.clearPendingWebRtcSignals(data.callId);
          this.activeCalls.delete(data.callId);
        } else {
          this.scheduleNoAnswerTimeout(data.callId);
        }
      }
      return this.sendSocketAck(ack, { ok: true, accepted: false, ended: shouldEndCall, reason: refusedReason });
    }
    return this.sendSocketAck(ack, { ok: false, message: 'Réponse appel invalide' });
  }

  @SubscribeMessage('call:get-active')
  handleCallGetActive(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    const userId = client.data.userId;
    const callId = typeof data?.callId === 'string' ? data.callId.slice(0, 120) : '';
    const call = callId ? this.activeCalls.get(callId) : null;
    if (!call || !call.participants.has(userId)) {
      console.info('[call:get-active]', {
        callId,
        userId,
        found: Boolean(call),
        authorized: Boolean(call?.participants.has(userId)),
        result: 'not-found-or-unauthorized',
      });
      return this.sendSocketAck(ack, { ok: false, message: 'Appel introuvable ou termine' });
    }

    client.join(`call:${callId}`);
    console.info('[call:get-active]', {
      callId,
      userId,
      callerId: call.callerId,
      conversationId: call.conversationId,
      type: call.type,
      mediaProvider: call.mediaProvider,
      answered: call.answered,
      result: 'ok',
    });
    if (userId !== call.callerId) {
      client.emit('call:incoming', {
        callId,
        conversationId: call.conversationId,
        callerId: call.callerId,
        callerName: call.callerPhone || call.callerName,
        callerPhone: call.callerPhone || null,
        type: call.type,
        mediaProvider: call.mediaProvider,
        participants: [...call.participants].filter(id => id !== call.callerId),
      });
    }
    this.deliverPendingWebRtcSignals(callId, userId);

    return this.sendSocketAck(ack, {
      ok: true,
      call: {
        callId,
        conversationId: call.conversationId,
        callerId: call.callerId,
        callerName: call.callerPhone || call.callerName,
        callerPhone: call.callerPhone || null,
        type: call.type,
        mediaProvider: call.mediaProvider,
        participants: [...call.participants].filter(id => id !== call.callerId),
        answered: call.answered,
        answeredUserIds: [...call.answeredUserIds],
      },
    });
  }

  @SubscribeMessage('call:incoming:received')
  handleCallIncomingReceived(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; conversationId?: string },
  ) {
    const call = this.activeCalls.get(data.callId);
    if (!call || !call.participants.has(client.data.userId)) return;
    console.info('[call:incoming:received]', {
      callId: data.callId,
      callerId: call.callerId,
      receiverId: client.data.userId,
      conversationId: call.conversationId,
      sockets: this.socketState.getSocketIds(client.data.userId).length,
    });
    console.info('[CALL_SIGNAL_RECEIVED]', {
      callId: data.callId,
      callerId: call.callerId,
      receiverId: client.data.userId,
      signal: 'call:incoming',
    });
    for (const sid of this.socketState.getSocketIds(call.callerId)) {
      console.info('[CALL_RINGING]', {
        callId: data.callId,
        callerId: call.callerId,
        receiverId: client.data.userId,
        callerSocketId: sid,
      });
      this.server.to(sid).emit('call:incoming:received', {
        callId: data.callId,
        userId: client.data.userId,
        conversationId: call.conversationId,
        receivedAt: new Date().toISOString(),
      });
    }
    this.deliverPendingWebRtcSignals(data.callId, client.data.userId);
  }

  @SubscribeMessage('call:diagnostic')
  handleCallDiagnostic(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      callId?: string;
      conversationId?: string;
      state?: string;
      event?: string;
      details?: Record<string, unknown>;
      at?: string;
    },
  ) {
    const event = typeof data?.event === 'string' ? data.event.slice(0, 80) : 'unknown';
    const callId = typeof data?.callId === 'string' ? data.callId.slice(0, 120) : undefined;
    const call = callId ? this.activeCalls.get(callId) : null;
    if (call && !call.participants.has(client.data.userId)) return;
    const details = data?.details && typeof data.details === 'object'
      ? JSON.stringify(data.details).slice(0, 1200)
      : undefined;
    console.info('[call:diagnostic]', {
      callId,
      userId: client.data.userId,
      activeCall: Boolean(call),
      conversationId: data?.conversationId,
      state: data?.state,
      event,
      details,
      at: data?.at,
    });
  }

  @SubscribeMessage('client:diagnostic')
  handleClientDiagnostic(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      id?: string;
      at?: string;
      event?: string;
      feature?: string;
      conversationId?: string;
      messageId?: string;
      callId?: string;
      details?: Record<string, unknown>;
    },
  ) {
    const event = typeof data?.event === 'string' ? data.event.slice(0, 100) : 'unknown';
    const feature = typeof data?.feature === 'string' ? data.feature.slice(0, 40) : 'unknown';
    const details = data?.details && typeof data.details === 'object'
      ? JSON.stringify(data.details).slice(0, 1600)
      : undefined;
    console.info('[client:diagnostic]', {
      id: typeof data?.id === 'string' ? data.id.slice(0, 120) : undefined,
      userId: client.data.userId,
      event,
      feature,
      conversationId: typeof data?.conversationId === 'string' ? data.conversationId.slice(0, 120) : undefined,
      messageId: typeof data?.messageId === 'string' ? data.messageId.slice(0, 120) : undefined,
      callId: typeof data?.callId === 'string' ? data.callId.slice(0, 120) : undefined,
      details,
      at: data?.at,
      serverReceivedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('call:add-participants')
  async handleCallAddParticipants(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserIds: string[] },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    const inviterId = client.data.userId;
    const call = this.activeCalls.get(data.callId);
    if (!call || !call.participants.has(inviterId)) {
      const message = 'Appel introuvable ou non autorisé';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
    if (await this.chat.isOfficialConversation(call.conversationId)) {
      const message = 'Le compte système ne peut pas être appelé';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }

    const requestedTargets = [...new Set(data.targetUserIds ?? [])]
      .filter(targetId => targetId !== inviterId && !call.participants.has(targetId));
    const existingCallableIds = new Set(await this.chat.getExistingCallableUserIds(requestedTargets, inviterId));
    const targets = requestedTargets.filter(targetId => existingCallableIds.has(targetId));
    const participantLimit = this.maxCallParticipants(call.type);
    const remainingSlots = participantLimit - call.participants.size;

    if (!targets.length) {
      const message = 'Aucun contact disponible à ajouter à cet appel';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
    if (remainingSlots <= 0) {
      const message = `Limite d’appel ${call.type === 'video' ? 'vidéo' : 'audio'} atteinte : ${participantLimit} participants maximum.`;
      client.emit('call:error', { message, maxParticipants: participantLimit });
      return this.sendSocketAck(ack, { ok: false, message, maxParticipants: participantLimit });
    }
    if (targets.length > remainingSlots) {
      const message = `Vous pouvez ajouter ${remainingSlots} participant(s) maximum à cet appel.`;
      client.emit('call:error', { message, maxParticipants: participantLimit, remainingSlots });
      return this.sendSocketAck(ack, { ok: false, message, maxParticipants: participantLimit, remainingSlots });
    }
    if (call.mediaProvider === 'livekit' && !this.callsSvc.isSfuEnabled()) {
      const message = 'LiveKit/SFU n’est pas configuré sur le serveur.';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
    console.info('[call:add-participants]', {
      callId: data.callId,
      inviterId,
      targets: targets.length,
      participantLimit,
      remainingSlots,
    });

    for (const targetId of targets) {
      call.participants.add(targetId);
      const socketIds = this.socketState.getSocketIds(targetId);
      const activeSocketIds = this.socketState.getActiveSocketIds(targetId, this.presenceHeartbeatTimeoutMs);
      this.notif.sendPush(targetId, {
        title: call.callerPhone
          ? `📞 Appel ${call.type === 'video' ? 'vidéo' : 'audio'} — ${call.callerPhone}`
          : `📞 Appel ${call.type === 'video' ? 'vidéo' : 'audio'} Oracle Messenger`,
        body: 'Vous êtes invité à rejoindre un appel Oracle Messenger.',
        url: `oraclemessenger://call?action=open&callId=${encodeURIComponent(data.callId)}&conversationId=${encodeURIComponent(call.conversationId)}`,
        tag: `incoming-call-${data.callId}`,
        type: 'call',
        callId: data.callId,
        conversationId: call.conversationId,
        callerName: call.callerPhone || call.callerName,
        callerPhone: call.callerPhone || null,
        callType: call.type,
        requireInteraction: true,
        vibrate: [1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000],
      }).then(pushResult => {
        console.info('[call:add-participants:push:result]', {
          callId: data.callId,
          inviterId,
          receiverId: targetId,
          targets: pushResult.targets,
          delivered: pushResult.delivered,
          failed: pushResult.failed,
          sockets: socketIds.length,
        });
        for (const inviterSocketId of this.socketState.getSocketIds(inviterId)) {
          this.server.to(inviterSocketId).emit('call:delivery', {
            callId: data.callId,
            receiverId: targetId,
            socketCount: socketIds.length,
            activeSocketCount: activeSocketIds.length,
            pushTargets: pushResult.targets,
            pushDelivered: pushResult.delivered,
            pushFailed: pushResult.failed,
            reachable: socketIds.length > 0 || activeSocketIds.length > 0 || pushResult.delivered > 0,
            invited: true,
            at: new Date().toISOString(),
          });
        }
      }).catch(error => {
        console.warn('[call:add-participants:push:error]', {
          callId: data.callId,
          inviterId,
          receiverId: targetId,
          error: error?.message ?? error,
        });
        for (const inviterSocketId of this.socketState.getSocketIds(inviterId)) {
          this.server.to(inviterSocketId).emit('call:delivery', {
            callId: data.callId,
            receiverId: targetId,
            socketCount: socketIds.length,
            activeSocketCount: activeSocketIds.length,
            pushTargets: 0,
            pushDelivered: 0,
            pushFailed: 1,
            reachable: socketIds.length > 0 || activeSocketIds.length > 0,
            invited: true,
            error: error?.message ?? String(error),
            at: new Date().toISOString(),
          });
        }
      });

      for (const sid of socketIds) {
        const targetSocket = this.server.sockets.sockets.get(sid);
        targetSocket?.join(`call:${data.callId}`);
        this.server.to(sid).emit('call:incoming', {
          callId: data.callId,
          conversationId: call.conversationId,
          callerId: call.callerId,
          callerName: call.callerPhone || call.callerName,
          callerPhone: call.callerPhone || null,
          type: call.type,
          mediaProvider: call.mediaProvider,
          participants: [...call.participants].filter(id => id !== call.callerId),
        });
      }
    }

    this.server.to(`call:${data.callId}`).emit('call:participants-added', {
      callId: data.callId,
      userIds: targets,
    });
    return this.sendSocketAck(ack, { ok: true, targets: targets.length });
  }

  @SubscribeMessage('call:end')
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const enderId = client.data.userId;
    const call = this.activeCalls.get(data.callId);
    if (!call) {
      this.server.to(`call:${data.callId}`).emit('call:ended', {
        callId: data.callId,
        userId: enderId,
      });
      client.leave(`call:${data.callId}`);
      return;
    }

    if (call) {
      if (!call.participants.has(enderId)) {
        client.emit('call:error', { message: 'Appel non autorisé' });
        return;
      }
      if (call.ending) {
        this.server.to(client.id).emit('call:ended', {
          callId: data.callId,
          userId: call.endingBy ?? enderId,
        });
        client.leave(`call:${data.callId}`);
        return;
      }

      if (call.answered && call.participants.size > 2) {
        const duration = call.answeredAt ? Math.max(1, Math.round((Date.now() - call.answeredAt) / 1000)) : undefined;
        const originalCallerId = call.originalCallerId ?? call.callerId;
        const originalCallerName = call.callerPhone || 'Contact Oracle';
        const isOriginalCaller = enderId === originalCallerId;
        const peerId = isOriginalCaller
          ? [...call.participants].find(userId => userId !== enderId)
          : originalCallerId;
        if (peerId) {
          const peer = isOriginalCaller ? await this.users.findById(peerId).catch(() => null) : null;
          await this.logCallAndNotify({
            callId: data.callId,
            userId: enderId,
            peerId,
            peerName: isOriginalCaller ? peer?.phone ?? 'Participant' : originalCallerName,
            type: call.type,
            direction: isOriginalCaller ? 'outgoing' : 'incoming',
            duration,
          }).catch(() => {});
        }

        call.participants.delete(enderId);
        call.answeredUserIds.delete(enderId);
        if (enderId === call.callerId) {
          const nextCallerId = [...call.participants][0];
          if (nextCallerId) {
            const nextCaller = await this.users.findById(nextCallerId).catch(() => null);
            call.callerId = nextCallerId;
            call.callerName = nextCaller?.name ?? call.callerName;
            call.callerPhone = nextCaller?.phone ?? null;
          }
        }
        for (const sid of this.socketState.getSocketIds(enderId)) {
          const participantSocket = this.server.sockets.sockets.get(sid);
          participantSocket?.leave(`call:${data.callId}`);
        }
        this.server.to(`call:${data.callId}`).emit('call:participant-left', {
          callId: data.callId,
          userId: enderId,
        });
        return;
      }

      call.ending = true;
      call.endingBy = enderId;
      this.clearCallTimeout(data.callId);
      this.syncCallNotifications(data.callId, call, enderId === call.callerId ? 'cancelled' : 'ended');
      const connected = call.answered && !!call.answeredAt;
      const duration = connected ? Math.max(1, Math.round((Date.now() - call.answeredAt!) / 1000)) : undefined;
      const reason = connected ? 'ended' : enderId === call.callerId ? 'cancelled' : 'missed';
      await this.logCallFinalState(data.callId, call, enderId, reason).catch(() => {});
      console.info('[CALL_ENDED]', {
        callId: data.callId,
        enderId,
        reason,
        connected,
        duration,
      });
      if (!this.isDiagnosticCallId(data.callId)) {
        await this.publishCallTrace(
          call.conversationId,
          enderId,
          call.type,
          connected ? 'ended' : reason === 'cancelled' ? 'cancelled' : 'missed',
          duration,
        ).catch(() => {});
      }

      for (const uid of call.participants) {
        const socketIds = this.socketState.getSocketIds(uid);
        for (const sid of socketIds) {
          this.server.to(sid).emit('call:ended', {
            callId: data.callId,
            userId: enderId,
            reason,
          });
          const participantSocket = this.server.sockets.sockets.get(sid);
          participantSocket?.leave(`call:${data.callId}`);
        }
      }

      this.clearPendingWebRtcSignals(data.callId);
      this.activeCalls.delete(data.callId);
    }

    client.leave(`call:${data.callId}`);
  }

  // ── Signalisation WebRTC 1-to-1 / secours ────────────────────────────────

  @SubscribeMessage('webrtc:offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserId: string; sdp: RTCSessionDescriptionInit },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    if (!this.getAuthorizedCall(data.callId, client.data.userId, data.targetUserId)) {
      const message = 'Signalisation non autorisée';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    console.info('[webrtc:offer]', { callId: data.callId, from: client.data.userId, to: data.targetUserId, sockets: socketIds.length, sdpType: data.sdp?.type });
    console.info('[SDP_OFFER_SENT]', { callId: data.callId, from: client.data.userId, to: data.targetUserId, sockets: socketIds.length, sdpType: data.sdp?.type });
    let delivered = 0;
    for (const sid of socketIds) {
      const targetSocket = this.server.sockets.sockets.get(sid);
      if (!targetSocket) continue;
      targetSocket.emit('webrtc:offer', {
        callId: data.callId,
        fromUserId: client.data.userId,
        sdp: data.sdp,
      });
      delivered += 1;
    }
    console.info('[webrtc:offer:relay-result]', { callId: data.callId, from: client.data.userId, to: data.targetUserId, sockets: socketIds.length, delivered });
    if (delivered === 0) {
      console.info('[webrtc:offer:offline-target]', { callId: data.callId, from: client.data.userId, to: data.targetUserId });
      this.queuePendingWebRtcSignal({
        kind: 'offer',
        callId: data.callId,
        fromUserId: client.data.userId,
        targetUserId: data.targetUserId,
        sdp: data.sdp,
        queuedAt: Date.now(),
      });
    }
    return this.sendSocketAck(ack, {
      ok: true,
      queued: delivered === 0,
      sockets: delivered,
    });
  }

  @SubscribeMessage('webrtc:answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserId: string; sdp: RTCSessionDescriptionInit },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    if (!this.getAuthorizedCall(data.callId, client.data.userId, data.targetUserId)) {
      const message = 'Signalisation non autorisée';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    console.info('[webrtc:answer]', { callId: data.callId, from: client.data.userId, to: data.targetUserId, sockets: socketIds.length, sdpType: data.sdp?.type });
    console.info('[SDP_ANSWER_RECEIVED]', { callId: data.callId, from: client.data.userId, to: data.targetUserId, sockets: socketIds.length, sdpType: data.sdp?.type });
    let delivered = 0;
    for (const sid of socketIds) {
      const targetSocket = this.server.sockets.sockets.get(sid);
      if (!targetSocket) continue;
      targetSocket.emit('webrtc:answer', {
        callId: data.callId,
        fromUserId: client.data.userId,
        sdp: data.sdp,
      });
      delivered += 1;
    }
    console.info('[webrtc:answer:relay-result]', { callId: data.callId, from: client.data.userId, to: data.targetUserId, sockets: socketIds.length, delivered });
    if (delivered === 0) {
      console.info('[webrtc:answer:offline-target]', { callId: data.callId, from: client.data.userId, to: data.targetUserId });
      this.queuePendingWebRtcSignal({
        kind: 'answer',
        callId: data.callId,
        fromUserId: client.data.userId,
        targetUserId: data.targetUserId,
        sdp: data.sdp,
        queuedAt: Date.now(),
      });
    }
    return this.sendSocketAck(ack, {
      ok: true,
      queued: delivered === 0,
      sockets: delivered,
    });
  }

  @SubscribeMessage('webrtc:ice')
  handleIce(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserId: string; candidate: RTCIceCandidateInit },
    @Ack() ack?: (response: Record<string, unknown>) => void,
  ) {
    if (!this.getAuthorizedCall(data.callId, client.data.userId, data.targetUserId)) {
      const message = 'Signalisation non autorisée';
      client.emit('call:error', { message });
      return this.sendSocketAck(ack, { ok: false, message });
    }
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    if (socketIds.length === 0) {
      console.info('[webrtc:ice:offline-target]', { callId: data.callId, from: client.data.userId, to: data.targetUserId });
    }
    console.info('[webrtc:ice]', {
      callId: data.callId,
      from: client.data.userId,
      to: data.targetUserId,
      sockets: socketIds.length,
      ...this.summarizeIceCandidate(data.candidate),
    });
    let delivered = 0;
    for (const sid of socketIds) {
      const targetSocket = this.server.sockets.sockets.get(sid);
      if (!targetSocket) continue;
      targetSocket.emit('webrtc:ice', {
        callId: data.callId,
        fromUserId: client.data.userId,
        candidate: data.candidate,
      });
      delivered += 1;
    }
    console.info('[webrtc:ice:relay-result]', {
      callId: data.callId,
      from: client.data.userId,
      to: data.targetUserId,
      sockets: socketIds.length,
      delivered,
      ...this.summarizeIceCandidate(data.candidate),
    });
    if (delivered === 0) {
      this.queuePendingWebRtcSignal({
        kind: 'ice',
        callId: data.callId,
        fromUserId: client.data.userId,
        targetUserId: data.targetUserId,
        candidate: data.candidate,
        queuedAt: Date.now(),
      });
    }
    return this.sendSocketAck(ack, {
      ok: true,
      queued: delivered === 0,
      sockets: delivered,
    });
  }
}
