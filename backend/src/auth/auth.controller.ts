import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('google')
  async googleLogin(@Body() body: { googleId: string; email: string; name: string; avatar?: string }) {
    return this.auth.googleLogin(body);
  }

  @Post('phone')
  async phoneLogin(@Body() body: { phone: string }) {
    return this.auth.phoneLogin(body.phone);
  }

  @Post('otp/send')
  async sendOtp(@Body() body: { phone: string }) {
    return this.auth.sendOtp(body.phone);
  }

  @Post('otp/verify')
  async verifyOtp(@Body() body: { phone: string; code: string }) {
    return this.auth.verifyOtp(body.phone, body.code);
  }
}
