import { Controller, Get, Patch, Post, Query, Param, Body, UseGuards, Request } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Request() req: any) { return req.user; }

  @Patch('me')
  @UseGuards(JwtGuard)
  updateMe(@Request() req: any, @Body() body: { name?: string; bio?: string; avatar?: string }) {
    return this.users.updateProfile(req.user.id, body);
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

  @Post('match-phones')
  @UseGuards(JwtGuard)
  matchPhones(@Body() body: { phones: string[] }) {
    return this.users.matchByPhones(body.phones ?? []);
  }
}
