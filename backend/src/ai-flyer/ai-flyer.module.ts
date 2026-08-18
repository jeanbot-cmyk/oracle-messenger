import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { AiFlyerController } from './ai-flyer.controller';
import { AiFlyerService } from './ai-flyer.service';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [AiFlyerController],
  providers: [AiFlyerService],
})
export class AiFlyerModule {}
