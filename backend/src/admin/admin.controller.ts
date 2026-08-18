import { Controller, Get, Post, Body, UseGuards, ForbiddenException, Headers } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessService } from '../business/business.service';

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
  constructor(private admin: AdminService, private prisma: PrismaService, private business: BusinessService) {}

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

  @Post('system-message')
  async systemMessage(@CurrentUser() user: any, @Body() body: { content?: string; mediaUrl?: string; type?: string }) {
    requireAdmin(user);
    if (!body.content?.trim() && !body.mediaUrl?.trim()) throw new ForbiddenException('Contenu requis');
    return this.admin.broadcastSalesMessage(user.id, body.content?.trim() ?? '', body.mediaUrl, body.type);
  }

  @Get('countries')
  async countries(@CurrentUser() user: any) {
    requireAdmin(user);
    return this.admin.getCountryStats();
  }

  @Get('ai-auto')
  async aiAuto(@CurrentUser() user: any) {
    requireAdmin(user);
    const [plans, settings, usageCount, wordsConsumed, activeUsers] = await Promise.all([
      this.prisma.aiPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { priceFcfa: 'asc' }] }),
      this.prisma.aiSetting.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.aiUsageLog.count(),
      this.prisma.aiUsageLog.aggregate({ _sum: { words: true } }),
      this.prisma.aiAutoConfig.count({ where: { isEnabled: true, paidActive: true } }),
    ]);
    return {
      plans,
      settings,
      stats: {
        usageCount,
        wordsConsumed: wordsConsumed._sum.words ?? 0,
        activeUsers,
      },
    };
  }

  @Post('ai-auto/plans')
  async updateAiPlans(@CurrentUser() user: any, @Body() body: { plans?: any[] }) {
    requireAdmin(user);
    const plans = Array.isArray(body?.plans) ? body.plans : [];
    await this.prisma.$transaction(plans.filter(plan => plan?.code).map(plan => (
      this.prisma.aiPlan.upsert({
        where: { code: String(plan.code) },
        create: {
          code: String(plan.code),
          label: String(plan.label || plan.code),
          type: String(plan.type || 'recharge'),
          priceFcfa: Math.max(0, Math.round(Number(plan.priceFcfa) || 0)),
          words: Math.max(0, Math.round(Number(plan.words) || 0)),
          enabled: Boolean(plan.enabled),
          sortOrder: Math.round(Number(plan.sortOrder) || 0),
        },
        update: {
          label: String(plan.label || plan.code),
          type: String(plan.type || 'recharge'),
          priceFcfa: Math.max(0, Math.round(Number(plan.priceFcfa) || 0)),
          words: Math.max(0, Math.round(Number(plan.words) || 0)),
          enabled: Boolean(plan.enabled),
          sortOrder: Math.round(Number(plan.sortOrder) || 0),
        },
      })
    )));
    return this.aiAuto(user);
  }

  @Post('ai-auto/settings')
  async updateAiSettings(@CurrentUser() user: any, @Body() body: { settings?: Record<string, string> }) {
    requireAdmin(user);
    const settings = body?.settings && typeof body.settings === 'object' ? body.settings : {};
    await this.prisma.$transaction(Object.entries(settings).map(([key, value]) => (
      this.prisma.aiSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    )));
    return this.aiAuto(user);
  }

  @Get('business-western-union')
  async getBusinessWesternUnion(@CurrentUser() user: any) {
    requireAdmin(user);
    return {
      config: await this.business.getWesternUnionPaymentConfig(),
      receipts: await this.business.getWesternUnionReceiptsForAdmin(),
    };
  }

  @Post('business-western-union')
  async updateBusinessWesternUnion(@CurrentUser() user: any, @Body() body: any) {
    requireAdmin(user);
    return this.business.updateWesternUnionPaymentConfig(body ?? {});
  }
}
