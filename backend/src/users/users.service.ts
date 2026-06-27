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

  async updateProfile(id: string, data: { name?: string; bio?: string; avatar?: string }) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name   ? { name: data.name }     : {}),
        ...(data.bio    !== undefined ? { bio: data.bio } : {}),
        ...(data.avatar ? { avatar: data.avatar } : {}),
      },
    });
  }

  async search(q: string, excludeId: string) {
    return this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: excludeId } },
          { OR: [
            { name:     { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { email:    { contains: q, mode: 'insensitive' } },
          ]},
        ],
      },
      select: { id:true, name:true, username:true, avatar:true, status:true },
      take: 20,
    });
  }

  async matchByPhones(phones: string[]) {
    // Cherche les utilisateurs dont le nom ou email correspond aux numéros importés
    return this.prisma.user.findMany({
      where: { OR: phones.map(p => ({ email: { contains: p } })) },
      select: { id:true, name:true, username:true, avatar:true, status:true },
      take: 100,
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
