import { Module, Controller, Get, Res } from '@nestjs/common';
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
import { MediaModule } from './media/media.module';
import { AiAutoModule } from './ai-auto/ai-auto.module';
import { AiFlyerModule } from './ai-flyer/ai-flyer.module';
import { AiVideoModule } from './ai-video/ai-video.module';
import { BusinessModule } from './business/business.module';
import { ConferenceModule } from './conference/conference.module';
import { hasFirebasePushConfig, hasLiveKitConfig, hasPrivateTurnConfig, isUsableEnvValue } from './realtime/realtime-config';

@Controller()
class HealthController {
  @Get() root() { return { status: 'ok', app: 'Oracle Messenger API' }; }
  @Get('health') health() { return { status: 'ok', timestamp: new Date().toISOString() }; }
  @Get('health/realtime')
  realtimeHealth() {
    const redisReady = isUsableEnvValue(process.env.REDIS_URL);
    const turnReady = hasPrivateTurnConfig();
    const livekitReady = hasLiveKitConfig();
    const fcmReady = hasFirebasePushConfig();
    const strictRealtime = process.env.ORACLE_STRICT_REALTIME === 'true';
    const industrialReady = strictRealtime && redisReady && turnReady && livekitReady && fcmReady;
    return {
      status: industrialReady ? 'industrial-ready' : 'degraded',
      industrialReady,
      strictRealtime,
      checks: {
        strictMode: strictRealtime,
        redis: redisReady,
        privateTurn: turnReady,
        livekitSfu: livekitReady,
        firebasePush: fcmReady,
      },
      requiredForWhatsappLikeBehavior: [
        'Redis Socket.IO adapter actif',
        'TURN prive configure',
        'LiveKit/SFU configure',
        'Firebase Cloud Messaging configure',
        'Tests reels sur deux telephones',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  @Get('downloads/playstore-testers.csv')
  playStoreTestersCsv(@Res() res: any) {
    const csv = [
      'tossouaffodo@gmail.com',
      'mahindekonanisrael@gmail.com',
      'kahguyserge@gmail.com',
      'noutelemelvina@gmail.com',
      'milananpidoux@gmail.com',
      'wilfriedpillah01@gmail.com',
      'navillusonze@gmail.com',
      'zadipacome@gmail.com',
      'gaelmagoum@gmail.com',
      'jacqueskouago24@gmail.com',
      'gpatipe@yahoo.fr',
      'bedoumeb5@gmail.com',
      'bintyadiabate94@gmail.com',
      'tchingankongbonas@gmail.com',
      'kendji2341@gmail.com',
      'christophe2361@gmail.com',
      'guykoffi2002@gmail.com',
      'tresormarius797@gmail.com',
      'pascalyessoh@gmail.com',
      'ellafotsing@gmail.com',
      'peterpierreledoux@gmail.com',
      'tchingankonggeorges@gmail.com',
      'jeanateba63@gmail.com',
    ].join('\n') + '\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="playstore-testers.csv"');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.send(csv);
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
    MediaModule,
    AiAutoModule,
    AiFlyerModule,
    AiVideoModule,
    BusinessModule,
    ConferenceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
