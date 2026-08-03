import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { MediaService } from './media.service';

@Controller('media')
@UseGuards(JwtGuard)
export class MediaController {
  constructor(private media: MediaService) {}

  @Post('upload')
  upload(
    @Request() req: any,
    @Body() body: { dataUrl: string; name?: string; mime?: string; kind?: string },
  ) {
    return this.media.saveDataUrl(body, req.user.id);
  }
}
