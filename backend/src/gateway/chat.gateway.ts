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
import { AiAutoService } from '../ai-auto/ai-auto.service';
import { BusinessService } from '../business/business.service';

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
    private aiAuto: AiAutoService,
    private business: BusinessService,
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

  private syncCallNotifications(
    callId: string,
    call: {
      callerId: string; callerName: string; conversationId: string;
      type: 'audio' | 'video'; startedAt: number; answered: boolean; answeredAt?: number;
      participants: Set<string>;
    },
    status: 'accepted' | 'refused' | 'ended' | 'missed' | 'cancelled',
  ) {
    for (const uid of call.participants) {
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
    for (const [callId, call] of this.activeCalls.entries()) {
      if (!call.participants.has(userId) || call.callerId === userId) continue;
      client.join(`call:${callId}`);
      console.info('[call:pending:deliver]', {
        callId,
        userId,
        callerId: call.callerId,
      });
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
      this.syncCallNotifications(callId, call, 'missed');

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

  private getAuthorizedCall(callId: string, userId: string, targetUserId?: string) {
    const call = this.activeCalls.get(callId);
    if (!call) return null;
    if (!call.participants.has(userId)) return null;
    if (targetUserId && !call.participants.has(targetUserId)) return null;
    if (targetUserId && targetUserId === userId) return null;
    return call;
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
    } catch {
      client.emit('conversation:error', { message: 'Ouverture de conversation impossible' });
    }
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
            conversationId: data.conversationId,
          }).catch(() => {});
        }
      }

      this.scheduleAiAutoReplies(msg, participantIds, client.data.userId);

      // Return msg as acknowledgement to sender. "Delivered" is now confirmed
      // only by the receiver device through message:delivered.
      return { ...msg, status: 'sent' };
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

  private async sendAiAutoReply(aiUserId: string, incomingMsg: any, prompt: string) {
    const generated = await this.aiAuto.generateAutoReply(
      aiUserId,
      incomingMsg.content,
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
    const reply = await this.chat.createMessage(
      incomingMsg.conversationId,
      aiUserId,
      generated.response,
      'text',
      incomingMsg.id,
    );
    const participantIds = await this.chat.getParticipantIds(incomingMsg.conversationId);
    const room = `conv:${incomingMsg.conversationId}`;
    this.server.to(room).emit('message:new', reply);
    const senderName = reply.sender?.name ?? 'Assistant IA';
    const preview = reply.content.length > 80 ? `${reply.content.slice(0, 80)}…` : reply.content;
    for (const pid of participantIds) {
      if (pid === aiUserId) continue;
      const socketIds = this.socketState.getSocketIds(pid);
      if (socketIds.length) {
        for (const sid of socketIds) {
          if (this.isSocketInRoom(sid, room)) continue;
          this.server.to(sid).emit('message:new', reply);
        }
      } else {
        this.notif.sendPush(pid, {
          title: senderName,
          body: preview,
          url: `/chat?conv=${encodeURIComponent(incomingMsg.conversationId)}`,
          tag: `msg-${incomingMsg.conversationId}`,
          type: 'message',
          conversationId: incomingMsg.conversationId,
        }).catch(() => {});
      }
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
      if (!data.callId || this.activeCalls.has(data.callId)) {
        client.emit('call:error', { message: 'Identifiant d’appel invalide' });
        return;
      }
      if (data.type !== 'audio' && data.type !== 'video') {
        client.emit('call:error', { message: 'Type d’appel invalide' });
        return;
      }
      const allowed = await this.chat.isParticipant(data.conversationId, callerId);
      if (!allowed) {
        client.emit('call:error', { message: 'Accès refusé à cette conversation' });
        return;
      }
      if (await this.chat.isOfficialConversation(data.conversationId)) {
        const message = 'Le compte système ne peut pas être appelé';
        client.emit('call:error', { message });
        return { ok: false, message };
      }

      const [participantIds, knownCallableIds] = await Promise.all([
        this.chat.getParticipantIds(data.conversationId),
        this.chat.getKnownCallableUserIds(callerId),
      ]);
      const allowedTargets = new Set([...participantIds, ...knownCallableIds]);
      const validTargets = [...new Set(data.targetUserIds ?? [])]
        .filter(targetId => targetId !== callerId && allowedTargets.has(targetId));
      if (!validTargets.length) {
        client.emit('call:error', { message: 'Aucun destinataire valide pour cet appel' });
        return { ok: false, message: 'Aucun destinataire valide pour cet appel' };
      }

      const caller = await this.users.findById(callerId);
      const callerName = caller?.name ?? 'Quelqu\'un';
      console.info('[call:start]', {
        callId: data.callId,
        callerId,
        conversationId: data.conversationId,
        type: data.type,
        targets: validTargets.length,
        conversationParticipants: participantIds.length,
        knownCallable: knownCallableIds.length,
      });

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
        console.info('[call:incoming:target]', {
          callId: data.callId,
          targetId,
          sockets: socketIds.length,
          pushQueued: true,
        });
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
      return { ok: true, callId: data.callId, targets: validTargets.length };
    } catch (err: any) {
      client.emit('call:error', { message: err?.message ?? 'Erreur de démarrage d’appel' });
      return { ok: false, message: err?.message ?? 'Erreur de démarrage d’appel' };
    }
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; accepted: boolean },
  ) {
    const responderId = client.data.userId;
    const call = this.getAuthorizedCall(data.callId, responderId);
    if (!call || responderId === call.callerId) {
      client.emit('call:error', { message: 'Appel introuvable ou non autorisé' });
      return;
    }
    client.join(`call:${data.callId}`);

    if (call && data.accepted) {
      call.answered = true;
      call.answeredAt = Date.now();
      this.clearCallTimeout(data.callId);
      this.syncCallNotifications(data.callId, call, 'accepted');
      console.info('[call:answer]', { callId: data.callId, responderId, accepted: true });
      this.server.to(`call:${data.callId}`).emit('call:answered', {
        callId: data.callId,
        userId: responderId,
        accepted: true,
      });
      return { ok: true, accepted: true };
    }
    if (!data.accepted && call) {
      const shouldEndCall = call.participants.size <= 2;
      console.info('[call:answer]', { callId: data.callId, responderId, accepted: false, ended: shouldEndCall });
      this.syncCallNotifications(data.callId, call, 'refused');
      this.server.to(`call:${data.callId}`).emit('call:answered', {
        callId: data.callId,
        userId: responderId,
        accepted: false,
        ended: shouldEndCall,
      });
      this.publishCallTrace(call.conversationId, responderId, call.type, 'refused').catch(() => {});
      if (shouldEndCall) {
        this.logCallFinalState(data.callId, call, responderId, 'refused').catch(() => {});
      } else {
        this.callsSvc.logCall({
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
        this.activeCalls.delete(data.callId);
      } else {
        call.participants.delete(responderId);
        if (!call.participants.size || [...call.participants].every(id => id === call.callerId)) {
          this.activeCalls.delete(data.callId);
        } else {
          this.scheduleNoAnswerTimeout(data.callId);
        }
      }
      return { ok: true, accepted: false, ended: shouldEndCall };
    }
    return { ok: false, message: 'Réponse appel invalide' };
  }

  @SubscribeMessage('call:get-active')
  handleCallGetActive(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    const userId = client.data.userId;
    const callId = typeof data?.callId === 'string' ? data.callId.slice(0, 120) : '';
    const call = callId ? this.activeCalls.get(callId) : null;
    if (!call || !call.participants.has(userId)) {
      return { ok: false, message: 'Appel introuvable ou termine' };
    }

    client.join(`call:${callId}`);
    if (userId !== call.callerId) {
      client.emit('call:incoming', {
        callId,
        conversationId: call.conversationId,
        callerId: call.callerId,
        callerName: call.callerName,
        type: call.type,
        participants: [...call.participants].filter(id => id !== call.callerId),
      });
    }

    return {
      ok: true,
      call: {
        callId,
        conversationId: call.conversationId,
        callerId: call.callerId,
        callerName: call.callerName,
        type: call.type,
        participants: [...call.participants].filter(id => id !== call.callerId),
      },
    };
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
    if (callId && (!call || !call.participants.has(client.data.userId))) return;
    const details = data?.details && typeof data.details === 'object'
      ? JSON.stringify(data.details).slice(0, 1200)
      : undefined;
    console.info('[call:diagnostic]', {
      callId,
      userId: client.data.userId,
      conversationId: data?.conversationId,
      state: data?.state,
      event,
      details,
      at: data?.at,
    });
  }

  @SubscribeMessage('call:add-participants')
  async handleCallAddParticipants(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserIds: string[] },
  ) {
    const inviterId = client.data.userId;
    const call = this.activeCalls.get(data.callId);
    if (!call || !call.participants.has(inviterId)) {
      client.emit('call:error', { message: 'Appel introuvable ou non autorisé' });
      return;
    }
    if (await this.chat.isOfficialConversation(call.conversationId)) {
      const message = 'Le compte système ne peut pas être appelé';
      client.emit('call:error', { message });
      return { ok: false, message };
    }

    const [conversationParticipants, knownCallableIds] = await Promise.all([
      this.chat.getParticipantIds(call.conversationId),
      this.chat.getKnownCallableUserIds(inviterId),
    ]);
    const allowedTargets = new Set([...conversationParticipants, ...knownCallableIds]);
    const targets = [...new Set(data.targetUserIds ?? [])]
      .filter(targetId =>
        targetId !== inviterId &&
        !call.participants.has(targetId) &&
        allowedTargets.has(targetId),
      );

    if (!targets.length) {
      client.emit('call:error', { message: 'Aucun contact disponible à ajouter à cet appel' });
      return { ok: false, message: 'Aucun contact disponible à ajouter à cet appel' };
    }
    console.info('[call:add-participants]', {
      callId: data.callId,
      inviterId,
      targets: targets.length,
    });

    for (const targetId of targets) {
      call.participants.add(targetId);
      this.notif.sendPush(targetId, {
        title: `📞 Appel ${call.type === 'video' ? 'vidéo' : 'audio'} — ${call.callerName}`,
        body: 'Vous êtes invité à rejoindre un appel Oracle Messenger.',
        url: `/chat?call=${encodeURIComponent(data.callId)}`,
        tag: `incoming-call-${data.callId}`,
        type: 'call',
        callId: data.callId,
        conversationId: call.conversationId,
        requireInteraction: true,
        vibrate: [1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000],
      }).catch(() => {});

      for (const sid of this.socketState.getSocketIds(targetId)) {
        const targetSocket = this.server.sockets.sockets.get(sid);
        targetSocket?.join(`call:${data.callId}`);
        this.server.to(sid).emit('call:incoming', {
          callId: data.callId,
          conversationId: call.conversationId,
          callerId: call.callerId,
          callerName: call.callerName,
          type: call.type,
          participants: [...call.participants].filter(id => id !== call.callerId),
        });
      }
    }

    this.server.to(`call:${data.callId}`).emit('call:participants-added', {
      callId: data.callId,
      userIds: targets,
    });
    return { ok: true, targets: targets.length };
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

      if (call.answered && enderId !== call.callerId && call.participants.size > 2) {
        const duration = call.answeredAt ? Math.max(1, Math.round((Date.now() - call.answeredAt) / 1000)) : undefined;
        await this.callsSvc.logCall({
          callId: data.callId,
          userId: enderId,
          peerId: call.callerId,
          peerName: call.callerName,
          type: call.type,
          direction: 'incoming',
          duration,
        }).catch(() => {});

        call.participants.delete(enderId);
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

      this.clearCallTimeout(data.callId);
      this.syncCallNotifications(data.callId, call, enderId === call.callerId ? 'cancelled' : 'ended');
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
    if (!this.getAuthorizedCall(data.callId, client.data.userId, data.targetUserId)) {
      client.emit('call:error', { message: 'Signalisation non autorisée' });
      return;
    }
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    console.info('[webrtc:offer]', { callId: data.callId, from: client.data.userId, to: data.targetUserId, sockets: socketIds.length });
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
    if (!this.getAuthorizedCall(data.callId, client.data.userId, data.targetUserId)) {
      client.emit('call:error', { message: 'Signalisation non autorisée' });
      return;
    }
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    console.info('[webrtc:answer]', { callId: data.callId, from: client.data.userId, to: data.targetUserId, sockets: socketIds.length });
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
    if (!this.getAuthorizedCall(data.callId, client.data.userId, data.targetUserId)) {
      client.emit('call:error', { message: 'Signalisation non autorisée' });
      return;
    }
    const socketIds = this.socketState.getSocketIds(data.targetUserId);
    if (socketIds.length === 0) {
      console.info('[webrtc:ice:offline-target]', { callId: data.callId, from: client.data.userId, to: data.targetUserId });
    }
    for (const sid of socketIds) {
      this.server.to(sid).emit('webrtc:ice', {
        callId: data.callId,
        fromUserId: client.data.userId,
        candidate: data.candidate,
      });
    }
  }
}
