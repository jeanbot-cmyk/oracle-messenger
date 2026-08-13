import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { ChatService } from './chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SocketStateService } from '../gateway/socket-state.service';

@Controller()
@UseGuards(JwtGuard)
export class ChatController {
  constructor(
    private chat: ChatService,
    private notif: NotificationsService,
    private socketState: SocketStateService,
  ) {}

  private isSocketInRoom(socketId: string, room: string) {
    return this.socketState.server?.sockets.sockets.get(socketId)?.rooms.has(room) ?? false;
  }

  private messagePreview(message: any) {
    if (message?.type === 'text') {
      const content = String(message.content || '');
      return content.length > 80 ? `${content.slice(0, 80)}...` : content;
    }
    if (message?.type === 'image') return 'Photo';
    if (message?.type === 'video') return 'Video';
    if (message?.type === 'audio' || message?.type === 'voice') return 'Message vocal';
    return 'Fichier';
  }

  private async broadcastConversationSummaries(conversationId: string, participantIds?: string[]) {
    const ids = participantIds ?? await this.chat.getParticipantIds(conversationId);
    for (const uid of ids) {
      const summary = await this.chat.getConversation(conversationId, uid).catch(() => null);
      if (!summary) continue;
      this.socketState.emitToUser(uid, 'conversation:upsert', summary);
    }
  }

  private async confirmDeliveredForConnectedRecipients(messageId: string, conversationId: string, recipientIds: string[]) {
    const uniqueRecipientIds = [...new Set(recipientIds)];
    if (!uniqueRecipientIds.length) return;

    let latestMessage: Awaited<ReturnType<ChatService['markMessageDelivered']>> | null = null;
    for (const recipientId of uniqueRecipientIds) {
      latestMessage = await this.chat.markMessageDelivered(messageId, recipientId).catch(() => latestMessage);
    }
    if (!latestMessage) return;

    const payload = {
      id: latestMessage.id,
      patch: { status: latestMessage.status, updatedAt: latestMessage.updatedAt },
    };
    const participantIds = await this.chat.getParticipantIds(conversationId);
    for (const uid of participantIds) {
      this.socketState.emitToUser(uid, 'message:update', payload);
    }
  }

  private async emitCreatedMessageToParticipants(message: any, senderId: string) {
    const participantIds = await this.chat.getParticipantIds(message.conversationId);
    const room = `conv:${message.conversationId}`;
    this.socketState.server?.to(room).emit('message:new', message);

    const senderName = message.sender?.name ?? 'Oracle Messenger';
    const preview = this.messagePreview(message);
    const connectedRecipientIds: string[] = [];

    for (const participantId of participantIds) {
      if (participantId === senderId) continue;
      const socketIds = this.socketState.getSocketIds(participantId);
      if (socketIds.length) {
        connectedRecipientIds.push(participantId);
        for (const socketId of socketIds) {
          if (this.isSocketInRoom(socketId, room)) continue;
          this.socketState.server?.to(socketId).emit('message:new', message);
        }
      } else {
        this.notif.sendPush(participantId, {
          title: senderName,
          body: preview,
          url: `/chat?conv=${encodeURIComponent(message.conversationId)}`,
          tag: `msg-${message.conversationId}`,
          type: 'message',
          conversationId: message.conversationId,
        }).catch(() => {});
      }
    }

    await this.confirmDeliveredForConnectedRecipients(message.id, message.conversationId, connectedRecipientIds);
    await this.broadcastConversationSummaries(message.conversationId, participantIds);
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

  private async broadcastMessagePatch(conversationId: string, messageId: string, patch: Record<string, unknown>) {
    const participantIds = await this.chat.getParticipantIds(conversationId);
    for (const uid of participantIds) {
      this.socketState.emitToUser(uid, 'message:update', { id: messageId, patch });
    }
    await this.broadcastConversationSummaries(conversationId, participantIds);
  }

  private async broadcastMessageDelete(conversationId: string, messageId: string) {
    const participantIds = await this.chat.getParticipantIds(conversationId);
    for (const uid of participantIds) {
      this.socketState.emitToUser(uid, 'message:delete', { conversationId, messageId });
    }
    await this.broadcastConversationSummaries(conversationId, participantIds);
  }

  @Get('conversations')
  list(@Request() req: any) {
    return this.chat.getConversations(req.user.id);
  }

  @Get('conversations/search')
  search(@Query('q') q: string, @Request() req: any) {
    return this.chat.searchConversations(req.user.id, q ?? '');
  }

  @Post('conversations')
  create(@Body('participantId') participantId: string, @Request() req: any) {
    return this.chat.getOrCreateDirect(req.user.id, participantId);
  }

  @Post('conversations/group')
  createGroup(@Body() body: { name?: string; participantIds?: string[]; avatar?: string }, @Request() req: any) {
    return this.chat.createGroup(req.user.id, body ?? {});
  }

  @Post('conversations/:id/participants')
  addGroupParticipants(@Param('id') id: string, @Body() body: { participantIds?: string[] }, @Request() req: any) {
    return this.chat.addGroupParticipants(id, req.user.id, body?.participantIds ?? []);
  }

  @Get('conversations/:id')
  get(@Param('id') id: string, @Request() req: any) {
    return this.chat.getConversation(id, req.user.id);
  }

  @Delete('conversations/:id')
  deleteConversation(@Param('id') id: string, @Request() req: any) {
    return this.chat.deleteConversationForUser(id, req.user.id);
  }

  @Get('conversations/:id/messages')
  messages(@Param('id') id: string, @Query('before') before: string, @Request() req: any) {
    return this.chat.getMessages(id, req.user.id, before);
  }

  @Post('conversations/:id/read')
  markRead(
    @Param('id') id: string,
    @Body() body: { messageId?: string },
    @Request() req: any,
  ) {
    return this.chat.markConversationRead(id, req.user.id, body?.messageId)
      .then(async updatedMessages => {
        await this.broadcastConversationRead(id, req.user.id, updatedMessages);
        return updatedMessages;
      });
  }

  @Get('messages/media-pending')
  pendingMedia(@Query('limit') limit: string, @Request() req: any) {
    return this.chat.getPendingMedia(req.user.id, Number(limit) || 50);
  }

  @Post('conversations/:id/messages')
  send(
    @Param('id') id: string,
    @Body() body: { content: string; type?: string; replyToId?: string },
    @Request() req: any,
  ) {
    return this.chat.createMessage(id, req.user.id, body.content, body.type, body.replyToId)
      .then(async message => {
        await this.emitCreatedMessageToParticipants(message, req.user.id);
        return { ...message, status: message.status || 'sent' };
      });
  }

  @Post('messages/:id/media-local-save')
  markMediaSavedLocally(
    @Param('id') id: string,
    @Body() body: { checksum?: string; size?: number },
    @Request() req: any,
  ) {
    return this.chat.markMediaSavedLocally(id, req.user.id, body?.checksum, body?.size);
  }

  @Delete('messages/:id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.chat.deleteMessage(id, req.user.id)
      .then(async message => {
        await this.broadcastMessageDelete(message.conversationId, message.id);
        return message;
      });
  }

  @Patch('messages/:id')
  edit(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.chat.editMessage(id, req.user.id, content)
      .then(async message => {
        await this.broadcastMessagePatch(message.conversationId, message.id, {
          content: message.content,
          isEdited: true,
          updatedAt: message.updatedAt,
        });
        return message;
      });
  }
}
