import { Module } from '@nestjs/common';
import { AiAutoController } from './ai-auto.controller';
import { AiAutoService } from './ai-auto.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AiAutoController],
  providers: [AiAutoService],
  exports: [AiAutoService],
})
export class AiAutoModule {}
