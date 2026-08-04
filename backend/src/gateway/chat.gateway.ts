import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from '../chat/chat.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CallsService } from '../calls/calls.service';
import { SocketStateService } from './socket-state.service';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowed = (process.env.CORS_ORIGINS ?? 'https://messenger.oracle-plus.online')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      if (!origin || allowed.includes(origin)) return callback(null, true);
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

  private readonly callNoAnswerTimeoutMs = 75_000;

  // callId → appel actif. La durée est comptée uniquement après acceptation réelle.
  private activeCalls = new Map<string, {
    callerId: string; callerName: string; conversationId: string;
    type: 'audio' | 'video'; startedAt: number; answered: boolean; answeredAt?: number;
    participants: Set<string>;
  }>();
  private callTimeouts = new Map<string, NodeJS.Timeout>();
  private offlineTimers = new Map<string, NodeJS.Timeout>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private jwt: JwtService,
    private chat: ChatService,
    private users: UsersService,
    private notif: NotificationsService,
    private callsSvc: CallsService,
    private socketState: SocketStateService,
  ) {}

  afterInit(server: Server) {
    this.socketState.setServer(server);
    this.chat.cleanupOldTextMessages(5).catch(() => {});
    this.cleanupTimer = setInterval(() => {
      this.chat.cleanupOldTextMessages(5).catch(() => {});
    }, 6 * 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  // ── Connexion ─────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) { client.disconnect(); return; }
      const payload = this.jwt.verify(token) as { sub: string };
      client.data.userId = payload.sub;
      const pendingOffline = this.offlineTimers.get(payload.sub);
      if (pendingOffline) {
        clearTimeout(pendingOffline);
        this.offlineTimers.delete(payload.sub);
      }
      this.socketState.setUserSocket(payload.sub, client.id);
      await this.users.setOnline(payload.sub, true);
      this.server.emit('user:online', { userId: payload.sub });
      this.emitPendingCallsToClient(payload.sub, client);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    this.socketState.removeUserSocket(userId, client.id);
    if (!this.socketState.hasUserSockets(userId)) {
      const existingTimer = this.offlineTimers.get(userId);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(async () => {
        this.offlineTimers.delete(userId);
        if (this.socketState.hasUserSockets(userId)) return;
        await this.users.setOnline(userId, false);
        this.server.emit('user:offline', { userId });
      }, 75_000);
      this.offlineTimers.set(userId, timer);
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
    state: 'ended' | 'missed' | 'refused',
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
        : 'manqué';
    const msg = await this.chat.createMessage(conversationId, senderId, `${icon} ${label} ${suffix}`, 'text');
    const participantIds = await this.chat.getParticipantIds(conversationId);
    for (const uid of participantIds) {
      this.socketState.emitToUser(uid, 'message:new', msg);
    }
  }

  private emitPendingCallsToClient(userId: string, client: Socket) {
    for (const [callId, call] of this.activeCalls.entries()) {
      if (!call.participants.has(userId) || call.callerId === userId) continue;
      client.join(`call:${callId}`);
      client.emit('call:incoming', {
        callId,
        conversationId: call.conversationId,
        callerId: call.callerId,
        callerName: call.callerName,
        type: call.type,
        participants: [...call.participants].filter(id => id !== call.callerId),
      });
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

  private scheduleNoAnswerTimeout(callId: string) {
    this.clearCallTimeout(callId);
    const timer = setTimeout(async () => {
      const call = this.activeCalls.get(callId);
      if (!call || call.answered) return;

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

      await this.publishCallTrace(
        call.conversationId,
        call.callerId,
        call.type,
        'missed',
      ).catch(() => {});
      await this.logCallFinalState(callId, call, call.callerId, 'missed').catch(() => {});

      this.activeCalls.delete(callId);
      this.callTimeouts.delete(callId);
    }, this.callNoAnswerTimeoutMs);
    timer.unref?.();
    this.callTimeouts.set(callId, timer);
  }

  private async logCallFinalState(
    callId: string,
    call: {
      callerId: string; callerName: string; conversationId: string;
      type: 'audio' | 'video'; startedAt: number; answered: boolean; answeredAt?: number;
      participants: Set<string>;
    },
    enderId: string,
    reason: 'ended' | 'missed' | 'refused' | 'cancelled',
  ) {
    const connected = call.answered && !!call.answeredAt && reason === 'ended';
    const duration = connected ? Math.max(1, Math.round((Date.now() - call.answeredAt!) / 1000)) : undefined;

    for (const uid of call.participants) {
      const isCallerSide = uid === call.callerId;
      const peerId = isCallerSide
        ? [...call.participants].find(p => p !== uid) ?? ''
        : call.callerId;
      let peerName = call.callerName;
      if (isCallerSide) {
        const peer = await this.users.findById(peerId).catch(() => null);
        peerName = peer?.name ?? 'Inconnu';
      }

      const direction = connected
        ? (isCallerSide ? 'outgoing' : 'incoming')
        : reason === 'refused'
          ? (uid === enderId ? 'refused' : isCallerSide ? 'outgoing' : 'missed')
          : reason === 'cancelled'
            ? (isCallerSide ? 'cancelled' : 'missed')
            : (isCallerSide ? 'outgoing' : 'missed');

      await this.callsSvc.logCall({
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

  // ── Conversations ─────────────────────────────────────────────────────────

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
      await this.chat.markRead(data.conversationId, client.data.userId);
    } catch {}
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; content: string; type?: string; replyToId?: string },
  ) {
    try {
      const msg = await this.chat.createMessage(
        data.conversationId,
        client.data.userId,
        data.content,
        data.type ?? 'text',
        data.replyToId,
      );

      // 1. Diffuser à tous dans la room (ceux qui ont fait conversation:join)
      const conversationRoom = `conv:${data.conversationId}`;
      this.server.to(conversationRoom).emit('message:new', msg);

      // 2. Notifier les participants connectés mais pas dans la room
      const participantIds = await this.chat.getParticipantIds(data.conversationId);
      const senderName = msg.sender?.name ?? 'Oracle Messenger';
      const preview = msg.type === 'text'
        ? (msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content)
        : msg.type === 'image' ? '📷 Photo'
        : msg.type === 'video' ? '🎥 Vidéo'
        : msg.type === 'audio' ? '🎵 Audio'
        : '📎 Fichier';

      for (const pid of participantIds) {
        if (pid === client.data.userId) continue;
        const socketIds = this.socketState.getSocketIds(pid);
        if (socketIds.length) {
          // Connecté → socket temps réel
          for (const sid of socketIds) {
            if (this.isSocketInRoom(sid, conversationRoom)) continue;
            this.server.to(sid).emit('message:new', msg);
          }
        } else {
          // Hors ligne → Push Notification (son géré par l'OS)
          this.notif.sendPush(pid, {
            title: senderName,
            body: preview,
            url: `/chat?conv=${encodeURIComponent(data.conversationId)}`,
            tag: `msg-${data.conversationId}`,
            type: 'message',
          }).catch(() => {});
        }
      }

      // Return msg as acknowledgement to sender. "Delivered" is now confirmed
      // only by the receiver device through message:delivered.
      return { ...msg, status: 'sent' };
    } catch (err: any) {
      client.emit('message:error', { message: err?.message ?? 'Erreur envoi' });
    }
  }

  @SubscribeMessage('message:delivered')
  async handleDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string },
  ) {
    try {
      const msg = await this.chat.markMessageDelivered(data.messageId, client.data.userId);
      const payload = { id: msg.id, patch: { status: msg.status, updatedAt: msg.updatedAt } };
      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      for (const uid of participantIds) {
        for (const sid of this.socketState.getSocketIds(uid)) {
          this.server.to(sid).emit('message:update', payload);
        }
      }
    } catch {}
  }

  @SubscribeMessage('message:read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; messageId?: string },
  ) {
    try {
      await this.chat.markConversationRead(data.conversationId, client.data.userId);
      const payload = {
        conversationId: data.conversationId,
        userId: client.data.userId,
      };
      this.server.to(`conv:${data.conversationId}`).emit('conversation:read', payload);
      const participantIds = await this.chat.getParticipantIds(data.conversationId);
      for (const uid of participantIds) {
        for (const sid of this.socketState.getSocketIds(uid)) {
          this.server.to(sid).emit('conversation:read', payload);
        }
      }
    } catch {}
  }

  @SubscribeMessage('message:react')
  async handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; emoji?: string | null },
  ) {
    try {
      const msg = await this.chat.reactToMessage(data.messageId, client.data.userId, data.emoji);
      if (!msg) return;
      const payload = {
        id: msg.id,
        patch: {
          reactions: msg.reactions,
          updatedAt: msg.updatedAt,
        },
      };
      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      for (const uid of participantIds) {
        for (const sid of this.socketState.getSocketIds(uid)) {
          this.server.to(sid).emit('message:update', payload);
        }
      }
    } catch (err: any) {
      client.emit('message:error', { message: err?.message ?? 'Erreur réaction' });
    }
  }

  @SubscribeMessage('message:media-saved')
  async handleMediaSaved(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string },
  ) {
    try {
      const result = await this.chat.markMediaSavedLocally(data.messageId, client.data.userId);
      if (!result.cleared) return;

      const msg: any = result.message;
      const patch = { content: '', updatedAt: msg.updatedAt };
      this.server.to(`conv:${msg.conversationId}`).emit('message:update', {
        id: msg.id,
        patch,
      });

      const participantIds = await this.chat.getParticipantIds(msg.conversationId);
      for (const uid of participantIds) {
        for (const sid of this.socketState.getSocketIds(uid)) {
          this.server.to(sid).emit('message:update', { id: msg.id, patch });
        }
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
      this.server.to(`conv:${msg.conversationId}`).emit('message:update', {
        id: msg.id,
        patch: { content: msg.content, isEdited: true },
      });
    } catch {}
  }

  @SubscribeMessage('message:delete')
  async handleDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; conversationId: string },
  ) {
    try {
      await this.chat.deleteMessage(data.messageId, client.data.userId);
      this.server.to(`conv:${data.conversationId}`).emit('message:delete', {
        conversationId: data.conversationId,
        messageId: data.messageId,
      });
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
        for (const sid of this.socketState.getSocketIds(uid)) {
          this.server.to(sid).emit('typing:start', payload);
        }
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
        for (const sid of this.socketState.getSocketIds(uid)) {
          this.server.to(sid).emit('typing:stop', payload);
        }
      }
    } catch {}
  }

  // ── Appels WebRTC ─────────────────────────────────────────────────────────

  @SubscribeMessage('call:start')
  async handleCallStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      callId: string;
      conversationId: string;
      type: 'audio' | 'video';
      targetUserIds: string[];
    },
  ) {
    try {
      const callerId = client.data.userId;
      const allowed = await this.chat.isParticipant(data.conversationId, callerId);
      if (!allowed) {
        client.emit('call:error', { message: 'Accès refusé à cette conversation' });
        return;
      }

      const participantIds = await this.chat.getParticipantIds(data.conversationId);
      const validTargets = [...new Set(data.targetUserIds ?? [])]
        .filter(targetId => targetId !== callerId && participantIds.includes(targetId));
      if (!validTargets.length) {
        client.emit('call:error', { message: 'Aucun destinataire valide pour cet appel' });
        return;
      }

      const caller = await this.users.findById(callerId);
      const callerName = caller?.name ?? 'Quelqu\'un';

      client.join(`call:${data.callId}`);

      // Mémoriser l'appel actif pour le logging à la fin
      this.activeCalls.set(data.callId, {
        callerId,
        callerName,
        conversationId: data.conversationId,
        type: data.type,
        startedAt: Date.now(),
        answered: false,
        participants: new Set([callerId, ...validTargets]),
      });
      this.scheduleNoAnswerTimeout(data.callId);

      for (const targetId of validTargets) {
        this.notif.sendPush(targetId, {
          title: `📞 Appel ${data.type === 'video' ? 'vidéo' : 'audio'} — ${callerName}`,
          body: 'Ouvrez Oracle Messenger pour répondre.',
          url: `/chat?conv=${encodeURIComponent(data.conversationId)}&call=${encodeURIComponent(data.callId)}`,
          tag: `incoming-call-${data.callId}`,
          type: 'call',
          callId: data.callId,
          conversationId: data.conversationId,
          requireInteraction: true,
          vibrate: [1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000],
        }).catch(() => {});

        const socketIds = this.socketState.getSocketIds(targetId);
        if (socketIds.length) {
          for (const sid of socketIds) {
            const targetSocket = this.server.sockets.sockets.get(sid);
            targetSocket?.join(`call:${data.callId}`);
            this.server.to(sid).emit('call:incoming', {
            callId: data.callId,
            conversationId: data.conversationId,
            callerId,
            callerName,
            type: data.type,
            participants: validTargets,
            });
          }
        }
      }
    } catch {}
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; accepted: boolean },
  ) {
    const responderId = client.data.userId;
    client.join(`call:${data.callId}`);
    this.server.to(`call:${data.callId}`).emit('call:answered', {
      callId: data.callId,
      userId: responderId,
      accepted: data.accepted,
    });

    const call = this.activeCalls.get(data.callId);
    if (call && data.accepted) {
      call.answered = true;
      call.answeredAt = Date.now();
      this.clearCallTimeout(data.callId);
    }
    if (!data.accepted && call) {
      this.publishCallTrace(call.conversationId, responderId, call.type, 'refused').catch(() => {});
      this.logCallFinalState(data.callId, call, responderId, 'refused').catch(() => {});
      this.clearCallTimeout(data.callId);
      this.activeCalls.delete(data.callId);
    }
  }

  @SubscribeMessage('call:incoming:received')
  handleCallIncomingReceived(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; conversationId?: string },
  ) {
    const call = this.activeCalls.get(data.callId);
    if (!call || !call.participants.has(client.data.userId)) return;
    for (const sid of this.socketState.getSocketIds(call.callerId)) {
      this.server.to(sid).emit('call:incoming:received', {
        callId: data.callId,
        userId: client.data.userId,
        conversationId: call.conversationId,
        receivedAt: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('call:end')
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const enderId = client.data.userId;
    const call = this.activeCalls.get(data.callId);
    this.clearCallTimeout(data.callId);
    if (!call) {
      this.server.to(`call:${data.callId}`).emit('call:ended', {
        callId: data.callId,
        userId: enderId,
      });
      client.leave(`call:${data.callId}`);
      return;
    }

    if (call) {
      for (const uid of call.participants) {
        const socketIds = this.socketState.getSocketIds(uid);
        for (const sid of socketIds) {
          this.server.to(sid).emit('call:ended', {
            callId: data.callId,
            userId: enderId,
          });
          const participantSocket = this.server.sockets.sockets.get(sid);
          participantSocket?.leave(`call:${data.callId}`);
        }
      }

      const connected = call.answered && !!call.answeredAt;
      const duration = connected ? Math.max(1, Math.round((Date.now() - call.answeredAt!) / 1000)) : undefined;
      const reason = connected ? 'ended' : enderId === call.callerId ? 'cancelled' : 'missed';
      await this.logCallFinalState(data.callId, call, enderId, reason).catch(() => {});

      await this.publishCallTrace(
        call.conversationId,
        enderId,
        call.type,
        connected ? 'ended' : 'missed',
        duration,
      ).catch(() => {});

      this.activeCalls.delete(data.callId);
    }

    client.leave(`call:${data.callId}`);
  }

  // ── WebRTC Signaling ──────────────────────────────────────────────────────

  @SubscribeMessage('webrtc:offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserId: string; sdp: RTCSessionDescriptionInit },
  ) {
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    for (const sid of socketIds) {
      this.server.to(sid).emit('webrtc:offer', {
        callId: data.callId,
        fromUserId: client.data.userId,
        sdp: data.sdp,
      });
    }
  }

  @SubscribeMessage('webrtc:answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserId: string; sdp: RTCSessionDescriptionInit },
  ) {
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    for (const sid of socketIds) {
      this.server.to(sid).emit('webrtc:answer', {
        callId: data.callId,
        fromUserId: client.data.userId,
        sdp: data.sdp,
      });
    }
  }

  @SubscribeMessage('webrtc:ice')
  handleIce(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserId: string; candidate: RTCIceCandidateInit },
  ) {
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    for (const sid of socketIds) {
      this.server.to(sid).emit('webrtc:ice', {
        callId: data.callId,
        fromUserId: client.data.userId,
        candidate: data.candidate,
      });
    }
  }
}
