import { Controller, Delete, Get, Patch, Post, Query, Param, Body, UseGuards, Request } from '@nestjs/common';
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
  updateMe(@Request() req: any, @Body() body: { name?: string; bio?: string; avatar?: string; phone?: string }) {
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

  @Post('match-phone-hashes')
  @UseGuards(JwtGuard)
  matchPhoneHashes(@Request() req: any, @Body() body: { hashes: string[] }) {
    return this.users.matchByPhoneHashes(body.hashes ?? [], req.user.id);
  }

  @Post('match-contact')
  @UseGuards(JwtGuard)
  matchContact(@Request() req: any, @Body() body: { hashes?: string[]; phone?: string; email?: string }) {
    return this.users.matchExplicitContact(req.user.id, body ?? {});
  }

  @Delete('contacts/:contactUserId')
  @UseGuards(JwtGuard)
  deleteContact(@Request() req: any, @Param('contactUserId') contactUserId: string) {
    return this.users.deleteContact(req.user.id, contactUserId);
  }

  @Get('me/has-phone')
  @UseGuards(JwtGuard)
  async hasPhone(@Request() req: any) {
    const has = await this.users.hasPhone(req.user.id);
    return { hasPhone: has };
  }

  @Post('me/phone')
  @UseGuards(JwtGuard)
  async setPhone(@Request() req: any, @Body() body: { phone: string }) {
    if (!body.phone) return { error: 'Numéro requis' };
    return this.users.setPhone(req.user.id, body.phone);
  }
}
