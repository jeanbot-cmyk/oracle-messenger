import { BadRequestException, Body, Controller, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtGuard } from '../auth/jwt.guard';
import { MediaService } from './media.service';
import { MEDIA_UPLOAD_MAX_BYTES } from './media.service';

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

  @Post('upload-file')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MEDIA_UPLOAD_MAX_BYTES },
  }))
  uploadFile(
    @Request() req: any,
    @UploadedFile() file: any,
    @Body() body: { name?: string; mime?: string; kind?: string },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Fichier vide.');
    return this.media.saveBuffer({
      buffer: file.buffer,
      name: body.name || file.originalname,
      mime: body.mime || file.mimetype,
      kind: body.kind || 'file',
    }, req.user.id);
  }
}
