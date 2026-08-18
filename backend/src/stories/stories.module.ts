import { Module } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { StoriesController } from './stories.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SocketStateModule } from '../gateway/socket-state.module';

@Module({
  imports: [PrismaModule, SocketStateModule],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
