import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatModule } from '../chat/chat.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CallsModule } from '../calls/calls.module';
import { SocketStateModule } from './socket-state.module';
import { AiAutoModule } from '../ai-auto/ai-auto.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [ChatModule, AuthModule, UsersModule, NotificationsModule, CallsModule, SocketStateModule, AiAutoModule, BusinessModule],
  providers: [ChatGateway],
  exports: [SocketStateModule],
})
export class GatewayModule {}
