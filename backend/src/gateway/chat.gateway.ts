import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from '../chat/chat.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SocketStateService } from './socket-state.service';

@WebSocketGateway({
  cors: { origin: '*', credentials: false },
  maxHttpBufferSize: 200 * 1024 * 1024, // 200MB for base64 video/image
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // userId → socketId (en mémoire — suffisant pour 1 instance)
  // userSockets moved to SocketStateService

  constructor(
    private jwt: JwtService,
    private chat: ChatService,
    private users: UsersService,
    private notif: NotificationsService,
    private socketState: SocketStateService,
  ) {}

  afterInit(server: Server) {
    this.socketState.setServer(server);
  }

  // ── Connexion ─────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) { client.disconnect(); return; }
      const payload = this.jwt.verify(token) as { sub: string };
      client.data.userId = payload.sub;
      this.socketState.setUserSocket(payload.sub, client.id);
      await this.users.setOnline(payload.sub, true);
      this.server.emit('user:online', { userId: payload.sub });
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    this.socketState.removeUserSocket(userId);
    await this.users.setOnline(userId, false);
    this.server.emit('user:offline', { userId });
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  @SubscribeMessage('conversation:join')
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
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
      this.server.to(`conv:${data.conversationId}`).emit('message:new', msg);

      // 2. Notifier les participants connectés mais pas dans la room
      const participantIds = await this.chat.getParticipantIds(data.conversationId);
      let deliveredToAny = false;
      const senderName = msg.sender?.name ?? 'Oracle Messenger';
      const preview = msg.type === 'text'
        ? (msg.content.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content)
        : msg.type === 'image' ? '📷 Photo'
        : msg.type === 'video' ? '🎥 Vidéo'
        : msg.type === 'audio' ? '🎵 Audio'
        : '📎 Fichier';

      for (const pid of participantIds) {
        if (pid === client.data.userId) continue;
        const sid = this.socketState.getSocketId(pid);
        if (sid) {
          // Connecté → socket temps réel
          this.server.to(sid).emit('message:new', msg);
          deliveredToAny = true;
        } else {
          // Hors ligne → Push Notification (son géré par l'OS)
          this.notif.sendPush(pid, {
            title: senderName,
            body: preview,
            url: '/chat',
          }).catch(() => {});
        }
      }

      // 3. Si au moins un destinataire est connecté → marquer delivered
      if (deliveredToAny) {
        client.emit('message:update', { id: msg.id, patch: { status: 'delivered' } });
      }

      // Return msg as acknowledgement to sender
      return { ...msg, status: deliveredToAny ? 'delivered' : 'sent' };
    } catch (err: any) {
      client.emit('message:error', { message: err?.message ?? 'Erreur envoi' });
    }
  }

  @SubscribeMessage('message:read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; messageId?: string },
  ) {
    try {
      await this.chat.markRead(data.conversationId, client.data.userId);
      // Notify all participants in the room that messages are read
      this.server.to(`conv:${data.conversationId}`).emit('conversation:read', {
        conversationId: data.conversationId,
        userId: client.data.userId,
      });
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
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.to(`conv:${data.conversationId}`).emit('typing:start', {
      conversationId: data.conversationId,
      userId: client.data.userId,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.to(`conv:${data.conversationId}`).emit('typing:stop', {
      conversationId: data.conversationId,
      userId: client.data.userId,
    });
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
      const caller = await this.users.findById(callerId);
      const callerName = caller?.name ?? 'Quelqu\'un';

      client.join(`call:${data.callId}`);

      for (const targetId of data.targetUserIds) {
        const sid = this.socketState.getSocketId(targetId);
        if (sid) {
          this.server.to(sid).emit('call:incoming', {
            callId: data.callId,
            conversationId: data.conversationId,
            callerId,
            callerName,
            type: data.type,
            participants: data.targetUserIds,
          });
        }
      }
    } catch {}
  }

  @SubscribeMessage('call:answer')
  handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; accepted: boolean },
  ) {
    client.join(`call:${data.callId}`);
    this.server.to(`call:${data.callId}`).emit('call:answered', {
      callId: data.callId,
      userId: client.data.userId,
      accepted: data.accepted,
    });
  }

  @SubscribeMessage('call:end')
  handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string },
  ) {
    this.server.to(`call:${data.callId}`).emit('call:ended', {
      callId: data.callId,
      userId: client.data.userId,
    });
    client.leave(`call:${data.callId}`);
  }

  // ── WebRTC Signaling ──────────────────────────────────────────────────────

  @SubscribeMessage('webrtc:offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callId: string; targetUserId: string; sdp: RTCSessionDescriptionInit },
  ) {
    const sid = this.socketState.getSocketId(data.targetUserId);
    if (sid) {
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
    const sid = this.socketState.getSocketId(data.targetUserId);
    if (sid) {
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
    const sid = this.socketState.getSocketId(data.targetUserId);
    if (sid) {
      this.server.to(sid).emit('webrtc:ice', {
        callId: data.callId,
        fromUserId: client.data.userId,
        candidate: data.candidate,
      });
    }
  }
}
