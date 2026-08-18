import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SocketStateModule } from '../gateway/socket-state.module';
import { MediaModule } from '../media/media.module';
import { ConferenceController } from './conference.controller';
import { ConferenceService } from './conference.service';

@Module({
  imports: [PrismaModule, SocketStateModule, MediaModule],
  controllers: [ConferenceController],
  providers: [ConferenceService],
})
export class ConferenceModule {}
