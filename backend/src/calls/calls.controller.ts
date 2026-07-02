import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CallsService } from './calls.service';

@Controller('calls')
@UseGuards(JwtGuard)
export class CallsController {
  constructor(private calls: CallsService) {}

  /** GET /calls/history — historique de l'utilisateur connecté */
  @Get('history')
  getHistory(@Request() req: any, @Query('limit') limit?: string) {
    return this.calls.getHistory(req.user.id, limit ? parseInt(limit, 10) : 50);
  }

  /** POST /calls/log — enregistrer un appel depuis le client */
  @Post('log')
  logCall(
    @Request() req: any,
    @Body() body: {
      callId: string;
      peerId: string;
      peerName: string;
      type: 'audio' | 'video';
      direction: 'incoming' | 'outgoing' | 'missed';
      duration?: number;
    },
  ) {
    return this.calls.logCall({ ...body, userId: req.user.id });
  }

  /** DELETE /calls/history — vider tout l'historique */
  @Delete('history')
  clearHistory(@Request() req: any) {
    return this.calls.clearHistory(req.user.id);
  }

  /** DELETE /calls/history/:id — supprimer une entrée */
  @Delete('history/:id')
  deleteEntry(@Param('id') id: string, @Request() req: any) {
    return this.calls.deleteEntry(id, req.user.id);
  }
}
