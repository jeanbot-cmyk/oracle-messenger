import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByUsername(username: string) {
    let decoded = username || '';
    try {
      decoded = decodeURIComponent(decoded);
    } catch {}
    const normalized = decoded.trim().replace(/^@+/, '').toLowerCase();
    if (!normalized) return null;
    return this.prisma.user.findFirst({
      where: { username: { equals: normalized, mode: 'insensitive' } },
      select: { id:true, name:true, username:true, avatar:true, status:true, phone:true },
    });
  }

  async updateProfile(id: string, data: { name?: string; bio?: string; avatar?: string; phone?: string }) {
    const phone = data.phone !== undefined && data.phone !== ''
      ? await this.normalizeUniquePhone(id, data.phone)
      : data.phone === ''
        ? null
        : undefined;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name   ? { name: data.name }     : {}),
        ...(data.bio    !== undefined ? { bio: data.bio } : {}),
        ...(data.avatar ? { avatar: data.avatar } : {}),
        ...(phone !== undefined ? { phone } : {}),
      },
    });
  }

  async setPhone(id: string, phone: string) {
    const cleaned = await this.normalizeUniquePhone(id, phone);

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

  async matchByPhoneHashes(hashes: string[], requesterId: string) {
    const hashSet = new Set((hashes ?? []).filter(h => /^[a-f0-9]{64}$/i.test(h)));
    if (!hashSet.size) return [];

    const users = await this.prisma.user.findMany({
      where: { phone: { not: null }, id: { not: requesterId } },
      select: { id:true, name:true, username:true, avatar:true, status:true, phone:true },
      take: 5000,
    });

    return users.filter(user => {
      const variants = this.phoneHashVariants(user.phone ?? '');
      return variants.some(hash => hashSet.has(hash));
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

  private normalizePhone(phone: string) {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
    return `+${cleaned.replace(/\D/g, '')}`;
  }

  private async normalizeUniquePhone(userId: string, phone: string) {
    const cleaned = this.normalizePhone(phone);
    if (cleaned.replace(/\D/g, '').length < 8) throw new BadRequestException('Numéro de téléphone invalide');

    const owner = await this.prisma.user.findUnique({ where: { phone: cleaned } });
    if (owner && owner.id !== userId) {
      throw new ConflictException('Ce numéro de téléphone est déjà associé à un autre compte Oracle Messenger.');
    }
    return cleaned;
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private phoneHashVariants(phone: string) {
    const normalized = this.normalizePhone(phone);
    const digits = normalized.replace(/\D/g, '');
    return [this.sha256(normalized), this.sha256(digits), this.sha256(digits.slice(-8))];
  }
}
