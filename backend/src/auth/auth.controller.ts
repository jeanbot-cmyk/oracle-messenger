import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('google')
  async googleLogin(@Body() body: { googleId: string; email: string; name: string; avatar?: string }) {
    return this.auth.googleLogin(body);
  }
}
