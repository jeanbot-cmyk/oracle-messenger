import { Controller, Get, Post, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';

const ADMIN_EMAILS = ['tchingankonggeorges@gmail.com'];

function AdminGuard() {
  return function(target: any, key: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = async function(...args: any[]) {
      const user = args.find(a => a?.email);
      if (!user || !ADMIN_EMAILS.includes(user.email)) {
        throw new ForbiddenException('Accès réservé aux administrateurs');
      }
      return original.apply(this, args);
    };
    return descriptor;
  };
}

@Controller('admin')
@UseGuards(JwtGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('stats')
  async stats(@CurrentUser() user: any) {
    if (!ADMIN_EMAILS.includes(user?.email)) throw new ForbiddenException('Accès admin requis');
    return this.admin.getStats();
  }

  @Get('metrics')
  async metrics(@CurrentUser() user: any) {
    if (!ADMIN_EMAILS.includes(user?.email)) throw new ForbiddenException('Accès admin requis');
    return this.admin.getMetrics();
  }

  @Get('users')
  async users(@CurrentUser() user: any) {
    if (!ADMIN_EMAILS.includes(user?.email)) throw new ForbiddenException('Accès admin requis');
    return this.admin.getRecentUsers();
  }

  @Post('notify')
  async sendNotification(@CurrentUser() user: any, @Body() body: { title: string; body: string; url?: string }) {
    if (!ADMIN_EMAILS.includes(user?.email)) throw new ForbiddenException('Accès admin requis');
    return this.admin.sendPushToAll(body);
  }

  @Post('pwa-install')
  async trackInstall(@CurrentUser() user: any) {
    return this.admin.trackPwaInstall(user?.id);
  }
}
