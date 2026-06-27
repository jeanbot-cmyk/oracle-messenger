import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async googleLogin(dto: { googleId: string; email: string; name: string; avatar?: string }) {
    // Générer un username unique depuis le nom
    let username = dto.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) username = `${username}${Math.floor(Math.random() * 9999)}`;

    const user = await this.prisma.user.upsert({
      where: { googleId: dto.googleId },
      update: { name: dto.name, avatar: dto.avatar, status: 'online' },
      create: { googleId: dto.googleId, email: dto.email, name: dto.name, username, avatar: dto.avatar },
    });

    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { token, user };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
}
