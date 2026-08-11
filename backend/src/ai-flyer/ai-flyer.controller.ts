import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { AiFlyerService } from './ai-flyer.service';

@Controller('ai-flyer')
@UseGuards(JwtGuard)
export class AiFlyerController {
  constructor(private readonly aiFlyer: AiFlyerService) {}

  @Get('overview')
  overview(@CurrentUser() user: any) {
    return this.aiFlyer.getOverview(user.id);
  }

  @Post('generate')
  generate(@CurrentUser() user: any, @Body() body: { prompt?: string; referenceImages?: any[] }) {
    return this.aiFlyer.generate(user.id, body?.prompt ?? '', body?.referenceImages ?? []);
  }

  @Post('paystack/initialize')
  initializePaystack(@CurrentUser() user: any, @Body() body: { nativeReturn?: boolean }) {
    return this.aiFlyer.initializePaystack(user.id, Boolean(body?.nativeReturn));
  }

  @Post('paystack/verify')
  verifyPaystack(@CurrentUser() user: any, @Body() body: { reference?: string }) {
    return this.aiFlyer.verifyPaystack(user.id, body?.reference ?? '');
  }
}
