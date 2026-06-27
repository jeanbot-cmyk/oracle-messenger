import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from '../chat/chat.service';
import { UsersService } from '../users/users.service';

@WebSocketGateway({ cors: { origin: '*' }, transports: ['websocket'] })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // userId → socketId
  private userSockets = new Map<string, string>();

  constructor(
    private jwt: JwtService,
    private chat: ChatService,
    private users: UsersService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      const payload = this.jwt.verify(token) as { sub: string };
      client.data.userId = payload.sub;
      this.userSockets.set(payload.sub, client.id);
      await this.users.setOnline(payload.sub, true);
      this.server.emit('user:online', { userId: payload.sub });
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    this.userSockets.delete(userId);
    await this.users.setOnline(userId, false);
    this.server.emit('user:offline', { userId });
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    client.join(`conv:${data.conversationId}`);
    await this.chat.markRead(data.conversationId, client.data.userId);
  }

  @SubscribeMessage('message:send')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string; content: string; type?: string; replyToId?: string }) {
    const msg = await this.chat.createMessage(data.conversationId, client.data.userId, data.content, data.type, data.replyToId);
    // Diffuser à tous les participants de la conversation
    this.server.to(`conv:${data.conversationId}`).emit('message:new', msg);
    return msg;
  }

  @SubscribeMessage('message:read')
  async handleRead(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string; messageId: string }) {
    await this.chat.markRead(data.conversationId, client.data.userId);
    this.server.to(`conv:${data.conversationId}`).emit('message:update', {
      id: data.messageId,
      patch: { status: 'read' },
    });
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    client.to(`conv:${data.conversationId}`).emit('typing:start', {
      conversationId: data.conversationId,
      userId: client.data.userId,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    client.to(`conv:${data.conversationId}`).emit('typing:stop', {
      conversationId: data.conversationId,
      userId: client.data.userId,
    });
  }

  // ── WebRTC Signaling ──────────────────────────────────────────────────────

  // Initier un appel (audio ou vidéo, 1-1 ou groupe)
  @SubscribeMessage('call:start')
  handleCallStart(@ConnectedSocket() client: Socket, @MessageBody() data: {
    callId: string;
    conversationId: string;
    type: 'audio' | 'video';
    targetUserIds: string[];
  }) {
    const callerId = client.data.userId;
    // Notifier chaque destinataire
    for (const targetId of data.targetUserIds) {
      const targetSocket = this.userSockets.get(targetId);
      if (targetSocket) {
        this.server.to(targetSocket).emit('call:incoming', {
          callId: data.callId,
          conversationId: data.conversationId,
          callerId,
          type: data.type,
        });
      }
    }
    // Rejoindre la room d'appel
    client.join(`call:${data.callId}`);
  }

  // Répondre à un appel
  @SubscribeMessage('call:answer')
  handleCallAnswer(@ConnectedSocket() client: Socket, @MessageBody() data: {
    callId: string;
    accepted: boolean;
  }) {
    client.join(`call:${data.callId}`);
    this.server.to(`call:${data.callId}`).emit('call:answered', {
      callId: data.callId,
      userId: client.data.userId,
      accepted: data.accepted,
    });
  }

  // Raccrocher
  @SubscribeMessage('call:end')
  handleCallEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { callId: string }) {
    this.server.to(`call:${data.callId}`).emit('call:ended', {
      callId: data.callId,
      userId: client.data.userId,
    });
    client.leave(`call:${data.callId}`);
  }

  // SDP Offer (WebRTC)
  @SubscribeMessage('webrtc:offer')
  handleOffer(@ConnectedSocket() client: Socket, @MessageBody() data: {
    callId: string;
    targetUserId: string;
    sdp: RTCSessionDescriptionInit;
  }) {
    const targetSocket = this.userSockets.get(data.targetUserId);
    if (targetSocket) {
      this.server.to(targetSocket).emit('webrtc:offer', {
        callId: data.callId,
        fromUserId: client.data.userId,
        sdp: data.sdp,
      });
    }
  }

  // SDP Answer (WebRTC)
  @SubscribeMessage('webrtc:answer')
  handleAnswer(@ConnectedSocket() client: Socket, @MessageBody() data: {
    callId: string;
    targetUserId: string;
    sdp: RTCSessionDescriptionInit;
  }) {
    const targetSocket = this.userSockets.get(data.targetUserId);
    if (targetSocket) {
      this.server.to(targetSocket).emit('webrtc:answer', {
        callId: data.callId,
        fromUserId: client.data.userId,
        sdp: data.sdp,
      });
    }
  }

  // ICE Candidate (WebRTC)
  @SubscribeMessage('webrtc:ice')
  handleIce(@ConnectedSocket() client: Socket, @MessageBody() data: {
    callId: string;
    targetUserId: string;
    candidate: RTCIceCandidateInit;
  }) {
    const targetSocket = this.userSockets.get(data.targetUserId);
    if (targetSocket) {
      this.server.to(targetSocket).emit('webrtc:ice', {
        callId: data.callId,
        fromUserId: client.data.userId,
        candidate: data.candidate,
      });
    }
  }
}
