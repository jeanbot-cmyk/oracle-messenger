import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatModule } from '../chat/chat.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ChatModule, AuthModule, UsersModule],
  providers: [ChatGateway],
})
export class GatewayModule {}
