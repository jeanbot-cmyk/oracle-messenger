import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiAutoService } from './ai-auto.service';

@Controller('ai-auto')
@UseGuards(JwtGuard)
export class AiAutoController {
  constructor(private readonly aiAuto: AiAutoService) {}

  @Get('overview')
  overview(@CurrentUser() user: any) {
    return this.aiAuto.getOverview(user.id);
  }

  @Post('config')
  updateConfig(@CurrentUser() user: any, @Body() body: any) {
    return this.aiAuto.updateConfig(user.id, body);
  }

  @Post('test')
  test(@CurrentUser() user: any, @Body() body: { message?: string; context?: 'tools' | 'conversation' }) {
    return this.aiAuto.testPrompt(user.id, body?.message ?? '', body?.context === 'conversation' ? 'conversation' : 'tools');
  }

  @Post('translate')
  translate(@CurrentUser() user: any, @Body() body: { text?: string; target?: string }) {
    return this.aiAuto.translate(user.id, body);
  }

  @Post('paystack/initialize')
  initializePaystack(@CurrentUser() user: any, @Body() body: { planCode?: string; nativeReturn?: boolean }) {
    return this.aiAuto.initializePaystack(user.id, body?.planCode ?? '', Boolean(body?.nativeReturn));
  }

  @Post('paystack/verify')
  verifyPaystack(@CurrentUser() user: any, @Body() body: { reference?: string }) {
    return this.aiAuto.verifyPaystack(user.id, body?.reference ?? '');
  }
}
