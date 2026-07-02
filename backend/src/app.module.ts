import { Module, Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { GatewayModule } from './gateway/gateway.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { StoriesModule } from './stories/stories.module';
import { CallsModule } from './calls/calls.module';
import { JwtGuard } from './auth/jwt.guard';

@Controller()
class HealthController {
  @Get() root() { return { status: 'ok', app: 'Oracle Messenger API' }; }
  @Get('health') health() { return { status: 'ok', timestamp: new Date().toISOString() }; }

  @Get('calls/ice-servers')
  @UseGuards(JwtGuard)
  getIceServers() {
    // Public TURN servers via openrelay (free, no signup)
    // For production, replace with Twilio/Metered credentials from env vars
    const iceServers: any[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turns:openrelay.metered.ca:443',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ];

    // If Twilio credentials are configured, use them instead (more reliable)
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      // Would call Twilio API here — for now fall through to openrelay
    }

    return { iceServers };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ChatModule,
    GatewayModule,
    NotificationsModule,
    AdminModule,
    StoriesModule,
    CallsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
