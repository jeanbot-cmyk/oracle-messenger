import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiVideoController } from './ai-video.controller';
import { AiVideoService } from './ai-video.service';

@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [AiVideoController],
  providers: [AiVideoService],
})
export class AiVideoModule {}
