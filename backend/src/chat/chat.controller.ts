import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { ChatService } from './chat.service';

@Controller()
@UseGuards(JwtGuard)
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get('conversations')
  list(@Request() req: any) {
    return this.chat.getConversations(req.user.id);
  }

  @Post('conversations')
  create(@Body('participantId') participantId: string, @Request() req: any) {
    return this.chat.getOrCreateDirect(req.user.id, participantId);
  }

  @Get('conversations/:id/messages')
  messages(@Param('id') id: string, @Query('before') before: string, @Request() req: any) {
    return this.chat.getMessages(id, req.user.id, before);
  }

  @Post('conversations/:id/messages')
  send(
    @Param('id') id: string,
    @Body() body: { content: string; type?: string; replyToId?: string },
    @Request() req: any,
  ) {
    return this.chat.createMessage(id, req.user.id, body.content, body.type, body.replyToId);
  }

  @Delete('messages/:id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.chat.deleteMessage(id, req.user.id);
  }

  @Patch('messages/:id')
  edit(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.chat.editMessage(id, req.user.id, content);
  }
}
