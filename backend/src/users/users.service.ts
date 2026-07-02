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

  async updateProfile(id: string, data: { name?: string; bio?: string; avatar?: string; phone?: string }) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name   ? { name: data.name }     : {}),
        ...(data.bio    !== undefined ? { bio: data.bio } : {}),
        ...(data.avatar ? { avatar: data.avatar } : {}),
        ...(data.phone  !== undefined ? { phone: data.phone || null } : {}),
      },
    });
  }

  async setPhone(id: string, phone: string) {
    // Nettoyer le numéro : garder uniquement chiffres et +
    const cleaned = phone.replace(/[^\d+]/g, '');
    return this.prisma.user.update({
      where: { id },
      data: { phone: cleaned },
    });
  }

  async hasPhone(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { phone: true } });
    return !!(user?.phone);
  }

  async search(q: string, excludeId: string) {
    const cleaned = q.replace(/[^\d+]/g, '');
    return this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: excludeId } },
          { OR: [
            { name:     { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { email:    { contains: q, mode: 'insensitive' } },
            // Recherche par numéro de téléphone (partielle)
            ...(cleaned.length >= 6 ? [{ phone: { contains: cleaned } }] : []),
          ]},
        ],
      },
      select: { id:true, name:true, username:true, avatar:true, status:true, phone:true },
      take: 20,
    });
  }

  async matchByPhones(phones: string[]) {
    if (!phones.length) return [];

    // Normalise a phone number to its last 8 digits (country-code-agnostic matching)
    const last8 = (p: string) => p.replace(/[^\d]/g, '').slice(-8);

    const suffixes = phones
      .map(p => last8(p))
      .filter(p => p.length === 8);

    if (!suffixes.length) return [];

    // Fetch all users that have a phone, then filter in-process for suffix match.
    // This avoids DB-specific regex and works with any SQL dialect.
    const allWithPhone = await this.prisma.user.findMany({
      where: { phone: { not: null } },
      select: { id:true, name:true, username:true, avatar:true, status:true, phone:true },
      take: 5000,
    });

    const suffixSet = new Set(suffixes);
    return allWithPhone.filter(u => u.phone && suffixSet.has(last8(u.phone)));
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
