import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatModule } from '../chat/chat.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CallsModule } from '../calls/calls.module';
import { SocketStateService } from './socket-state.service';

@Module({
  imports: [ChatModule, AuthModule, UsersModule, NotificationsModule, CallsModule],
  providers: [ChatGateway, SocketStateService],
  exports: [SocketStateService],
})
export class GatewayModule {}
