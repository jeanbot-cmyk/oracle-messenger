import { Controller, Get, Post, Body, UseGuards, ForbiddenException, Headers } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';

const ADMIN_EMAILS = ['tchingankonggeorges@gmail.com', 'tchingangankonggeorges@gmail.com'];
const ADMIN_PHONES = ['+2250504673829', '+2250700508618'];

function isAdmin(user: any): boolean {
  return ADMIN_EMAILS.includes(user?.email) || ADMIN_PHONES.includes(user?.phone);
}

function requireAdmin(user: any) {
  if (!isAdmin(user)) throw new ForbiddenException('Accès réservé aux administrateurs');
}

@Controller('admin')
@UseGuards(JwtGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('stats')
  async stats(@CurrentUser() user: any) {
    requireAdmin(user);
    return this.admin.getStats();
  }

  @Get('metrics')
  async metrics(@CurrentUser() user: any) {
    requireAdmin(user);
    return this.admin.getMetrics();
  }

  @Get('users')
  async users(@CurrentUser() user: any) {
    requireAdmin(user);
    return this.admin.getRecentUsers();
  }

  @Post('notify')
  async sendNotification(@CurrentUser() user: any, @Body() body: { title: string; body: string; url?: string }) {
    requireAdmin(user);
    return this.admin.sendPushToAll(body);
  }

  @Post('pwa-install')
  async trackInstall(@CurrentUser() user: any, @Headers('user-agent') userAgent?: string) {
    return this.admin.trackPwaInstall(user?.id, userAgent);
  }

  @Post('broadcast')
  async broadcast(@CurrentUser() user: any, @Body() body: { content?: string; mediaUrl?: string; type?: string }) {
    requireAdmin(user);
    if (!body.content?.trim() && !body.mediaUrl?.trim()) throw new ForbiddenException('Contenu requis');
    return this.admin.broadcastSalesMessage(user.id, body.content?.trim() ?? '', body.mediaUrl, body.type);
  }

  @Get('countries')
  async countries(@CurrentUser() user: any) {
    requireAdmin(user);
    return this.admin.getCountryStats();
  }
}
