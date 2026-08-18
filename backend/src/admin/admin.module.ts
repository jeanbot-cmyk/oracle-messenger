import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GatewayModule } from '../gateway/gateway.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [AuthModule, NotificationsModule, GatewayModule, BusinessModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
