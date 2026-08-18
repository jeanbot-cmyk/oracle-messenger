import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { AiVideoService } from './ai-video.service';

@Controller('ai-video')
@UseGuards(JwtGuard)
export class AiVideoController {
  constructor(private readonly aiVideo: AiVideoService) {}

  @Get('overview')
  overview(@CurrentUser() user: any) {
    return this.aiVideo.getOverview(user.id);
  }

  @Post('paystack/initialize')
  initializePaystack(@CurrentUser() user: any, @Body() body: { nativeReturn?: boolean }) {
    return this.aiVideo.initializePaystack(user.id, Boolean(body?.nativeReturn));
  }

  @Post('paystack/verify')
  verifyPaystack(@CurrentUser() user: any, @Body() body: { reference?: string }) {
    return this.aiVideo.verifyPaystack(user.id, body?.reference ?? '');
  }

  @Post('generate')
  generate(@CurrentUser() user: any, @Body() body: any) {
    return this.aiVideo.generate(user.id, body);
  }

  @Post('generations/:id/downloaded')
  markDownloaded(@CurrentUser() user: any, @Param('id') id: string) {
    return this.aiVideo.markDownloaded(user.id, id);
  }
}
