import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Request() req: any) {
    return req.user;
  }

  @Get('search')
  @UseGuards(JwtGuard)
  search(@Query('q') q: string, @Request() req: any) {
    return this.users.search(q ?? '', req.user.id);
  }

  @Get('u/:username')
  byUsername(@Param('username') username: string) {
    return this.users.findByUsername(username);
  }
}
