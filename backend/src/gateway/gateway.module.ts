import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatModule } from '../chat/chat.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CallsModule } from '../calls/calls.module';
import { SocketStateService } from './socket-state.service';
import { AiAutoModule } from '../ai-auto/ai-auto.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [ChatModule, AuthModule, UsersModule, NotificationsModule, CallsModule, AiAutoModule, BusinessModule],
  providers: [ChatGateway, SocketStateService],
  exports: [SocketStateService],
})
export class GatewayModule {}
