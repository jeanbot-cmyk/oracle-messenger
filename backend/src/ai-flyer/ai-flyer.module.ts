import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiFlyerController } from './ai-flyer.controller';
import { AiFlyerService } from './ai-flyer.service';

@Module({
  imports: [AuthModule],
  controllers: [AiFlyerController],
  providers: [AiFlyerService],
})
export class AiFlyerModule {}
