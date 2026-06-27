import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async search(q: string, excludeId: string) {
    return this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: excludeId } },
          {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { username: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, name: true, username: true, avatar: true, status: true },
      take: 20,
    });
  }

  async setOnline(id: string, online: boolean) {
    return this.prisma.user.update({
      where: { id },
      data: { status: online ? 'online' : 'offline', lastSeen: online ? undefined : new Date() },
    });
  }

  async savePushToken(userId: string, token: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { pushToken: token } });
  }
}
