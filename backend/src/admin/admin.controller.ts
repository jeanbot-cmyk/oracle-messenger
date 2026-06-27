import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtGuard)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('stats')
  stats() { return this.admin.getStats(); }

  @Get('metrics')
  metrics() { return this.admin.getMetrics(); }

  @Get('users')
  users() { return this.admin.getRecentUsers(); }
}
