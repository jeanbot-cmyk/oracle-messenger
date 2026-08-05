import { Controller, Get, Delete, Param, Query, UseGuards, Request, Post, Body } from '@nestjs/common';
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

  /** GET /calls/ice-servers — configuration STUN/TURN utilisée par WebRTC */
  @Get('ice-servers')
  getIceServers() {
    return this.calls.getIceServers();
  }

  /** POST /calls/sfu-token — jeton LiveKit pour appels de groupe scalables */
  @Post('sfu-token')
  createSfuToken(
    @Request() req: any,
    @Body() body: { room?: string; name?: string },
  ) {
    return this.calls.createSfuToken({
      room: body.room ?? '',
      identity: req.user.id,
      name: body.name ?? req.user.name,
    });
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
