import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiVideoController } from './ai-video.controller';
import { AiVideoService } from './ai-video.service';

@Module({
  imports: [PrismaModule],
  controllers: [AiVideoController],
  providers: [AiVideoService],
})
export class AiVideoModule {}
