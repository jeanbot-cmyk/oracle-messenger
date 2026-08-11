import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BusinessService } from './business.service';

@Controller('business')
@UseGuards(JwtGuard)
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('overview')
  overview(@CurrentUser() user: any) {
    return this.business.overview(user.id);
  }

  @Post('paystack/initialize')
  initializePaystack(@CurrentUser() user: any, @Body() body: { nativeReturn?: boolean }) {
    return this.business.initializePaystack(user.id, Boolean(body?.nativeReturn));
  }

  @Post('paystack/verify')
  verifyPaystack(@CurrentUser() user: any, @Body() body: { reference?: string }) {
    return this.business.verifyPaystack(user.id, body?.reference ?? '');
  }

  @Post('clients')
  saveClient(@CurrentUser() user: any, @Body() body: {
    id?: string;
    name?: string;
    phone?: string;
    email?: string;
    status?: string;
    tags?: string[];
    notes?: string;
    value?: number;
  }) {
    return this.business.saveClient(user.id, body ?? {});
  }

  @Post('reminders')
  saveReminder(@CurrentUser() user: any, @Body() body: {
    clientId?: string;
    title?: string;
    note?: string;
    dueAt?: string;
  }) {
    return this.business.saveReminder(user.id, body ?? {});
  }

  @Patch('reminders/:id/done')
  markReminderDone(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { done?: boolean }) {
    return this.business.markReminderDone(user.id, id, body?.done !== false);
  }
}
