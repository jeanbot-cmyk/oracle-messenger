import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { NotificationsService } from './notifications.service';
import { ConfigService } from '@nestjs/config';

@Controller('notifications')
export class NotificationsController {
  constructor(private notif: NotificationsService, private cfg: ConfigService) {}

  @Get('vapid-public-key')
  vapidKey() {
    return { key: this.cfg.get('VAPID_PUBLIC_KEY') };
  }

  @Post('subscribe')
  @UseGuards(JwtGuard)
  subscribe(@Body() body: any, @Request() req: any) {
    return this.notif.savePushSubscription(req.user.id, body);
  }
}
