import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { ConferenceService } from './conference.service';

@Controller('conference')
export class ConferenceController {
  constructor(private readonly conference: ConferenceService) {}

  @Get('plans')
  @UseGuards(JwtGuard)
  plans(@CurrentUser() user: any) {
    return this.conference.getOverview(user.id);
  }

  @Post('paystack/initialize')
  @UseGuards(JwtGuard)
  initializePaystack(@CurrentUser() user: any, @Body() body: { planCode?: string; nativeReturn?: boolean }) {
    return this.conference.initializePaystack(user.id, body?.planCode ?? '', Boolean(body?.nativeReturn));
  }

  @Post('paystack/verify')
  @UseGuards(JwtGuard)
  verifyPaystack(@CurrentUser() user: any, @Body() body: { reference?: string }) {
    return this.conference.verifyPaystack(user.id, body?.reference ?? '');
  }

  @Post('rooms')
  @UseGuards(JwtGuard)
  createRoom(@CurrentUser() user: any, @Body() body: any) {
    return this.conference.createRoom(user.id, body ?? {});
  }

  @Patch('rooms/:id')
  @UseGuards(JwtGuard)
  updateRoom(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.conference.updateRoom(user.id, id, body ?? {});
  }

  @Post('rooms/:id/start')
  @UseGuards(JwtGuard)
  startRoom(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conference.startRoom(user.id, id);
  }

  @Post('rooms/:id/stop')
  @UseGuards(JwtGuard)
  stopRoom(@CurrentUser() user: any, @Param('id') id: string) {
    return this.conference.stopRoom(user.id, id);
  }

  @Post('rooms/:slug/join')
  @UseGuards(JwtGuard)
  joinRoom(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.conference.joinRoom(user.id, slug);
  }

  @Post('rooms/:slug/heartbeat')
  @UseGuards(JwtGuard)
  heartbeat(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.conference.heartbeat(user.id, slug);
  }

  @Get('rooms/:slug/state')
  @UseGuards(JwtGuard)
  getRoomState(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.conference.getRoomState(user.id, slug);
  }

  @Post('rooms/:slug/hand/raise')
  @UseGuards(JwtGuard)
  raiseHand(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.conference.raiseHand(user.id, slug);
  }

  @Post('rooms/:slug/hand/cancel')
  @UseGuards(JwtGuard)
  cancelHand(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.conference.cancelHand(user.id, slug);
  }

  @Post('rooms/:slug/hand/:participantId/allow')
  @UseGuards(JwtGuard)
  allowHand(@CurrentUser() user: any, @Param('slug') slug: string, @Param('participantId') participantId: string) {
    return this.conference.decideHand(user.id, slug, participantId, 'allow');
  }

  @Post('rooms/:slug/hand/:participantId/refuse')
  @UseGuards(JwtGuard)
  refuseHand(@CurrentUser() user: any, @Param('slug') slug: string, @Param('participantId') participantId: string) {
    return this.conference.decideHand(user.id, slug, participantId, 'refuse');
  }

  @Post('rooms/:slug/hand/:participantId/revoke')
  @UseGuards(JwtGuard)
  revokeHand(@CurrentUser() user: any, @Param('slug') slug: string, @Param('participantId') participantId: string) {
    return this.conference.decideHand(user.id, slug, participantId, 'revoke');
  }

  @Post('rooms/:slug/questions')
  @UseGuards(JwtGuard)
  addQuestion(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: any) {
    return this.conference.addQuestion(user.id, slug, body ?? {});
  }

  @Post('rooms/:slug/questions/:questionId/answer')
  @UseGuards(JwtGuard)
  answerQuestion(@CurrentUser() user: any, @Param('slug') slug: string, @Param('questionId') questionId: string, @Body() body: any) {
    return this.conference.answerQuestion(user.id, slug, questionId, body ?? {});
  }

  @Patch('rooms/:slug/questions/:questionId')
  @UseGuards(JwtGuard)
  updateQuestionFlag(@CurrentUser() user: any, @Param('slug') slug: string, @Param('questionId') questionId: string, @Body() body: any) {
    return this.conference.updateQuestionFlag(user.id, slug, questionId, body ?? {});
  }

  @Post('rooms/:slug/reactions')
  @UseGuards(JwtGuard)
  addReaction(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: any) {
    return this.conference.addReaction(user.id, slug, body ?? {});
  }

  @Post('rooms/:slug/polls')
  @UseGuards(JwtGuard)
  createPoll(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: any) {
    return this.conference.createPoll(user.id, slug, body ?? {});
  }

  @Post('rooms/:slug/polls/:pollId/close')
  @UseGuards(JwtGuard)
  closePoll(@CurrentUser() user: any, @Param('slug') slug: string, @Param('pollId') pollId: string) {
    return this.conference.closePoll(user.id, slug, pollId);
  }

  @Post('rooms/:slug/polls/:pollId/vote')
  @UseGuards(JwtGuard)
  votePoll(@CurrentUser() user: any, @Param('slug') slug: string, @Param('pollId') pollId: string, @Body() body: any) {
    return this.conference.votePoll(user.id, slug, pollId, body ?? {});
  }

  @Post('rooms/:slug/documents')
  @UseGuards(JwtGuard)
  shareDocument(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: any) {
    return this.conference.shareDocument(user.id, slug, body ?? {});
  }

  @Post('rooms/:slug/ai-summary')
  @UseGuards(JwtGuard)
  generateAiSummary(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: any) {
    return this.conference.generateAiSummary(user.id, slug, body ?? {});
  }

  @Post('rooms/:slug/book/generate')
  @UseGuards(JwtGuard)
  generateBook(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.conference.generateBook(user.id, slug);
  }

  @Get('rooms/:slug/book')
  @UseGuards(JwtGuard)
  getBook(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.conference.getBookAccess(user.id, slug);
  }

  @Post('rooms/:slug/book/paystack/initialize')
  @UseGuards(JwtGuard)
  initializeBookPaystack(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: { nativeReturn?: boolean }) {
    return this.conference.initializeBookPaystack(user.id, slug, Boolean(body?.nativeReturn));
  }

  @Post('rooms/:slug/book/downloaded')
  @UseGuards(JwtGuard)
  markBookDownloaded(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.conference.markBookDownloaded(user.id, slug);
  }

  @Post('book/paystack/verify')
  @UseGuards(JwtGuard)
  verifyBookPaystack(@CurrentUser() user: any, @Body() body: { reference?: string }) {
    return this.conference.verifyBookPaystack(user.id, body?.reference ?? '');
  }

  @Get('rooms/:slug')
  getPublicRoom(@Param('slug') slug: string) {
    return this.conference.getPublicRoom(slug);
  }
}
