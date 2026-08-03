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
    const phoneHashes = phone !== undefined ? this.phoneHashData(phone) : undefined;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name   ? { name: data.name }     : {}),
        ...(data.bio    !== undefined ? { bio: data.bio } : {}),
        ...(data.avatar ? { avatar: data.avatar } : {}),
        ...(phone !== undefined ? { phone, ...phoneHashes } : {}),
      },
    });
  }

  async setPhone(id: string, phone: string) {
    const cleaned = await this.normalizeUniquePhone(id, phone);

    return this.prisma.user.update({
      where: { id },
      data: { phone: cleaned, ...this.phoneHashData(cleaned) },
    });
  }

  async hasPhone(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { phone: true } });
    return !!(user?.phone);
  }

  async search(q: string, excludeId: string) {
    const term = (q ?? '').trim();
    const cleaned = term.replace(/[^\d+]/g, '');
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 6 && term.length < 3) return [];

    const phoneCandidates = this.phoneLookupCandidates(term);
    const textFilters = digits.length >= 6 ? [] : [
      { name:     { contains: term, mode: 'insensitive' as const } },
      { username: { contains: term, mode: 'insensitive' as const } },
    ];
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: excludeId } },
          { OR: [
            ...textFilters,
            // Recherche par numéro de téléphone (partielle)
            ...(digits.length >= 6 ? phoneCandidates.map(candidate => ({ phone: { contains: candidate } })) : []),
          ]},
        ],
      },
      select: { id:true, name:true, username:true, avatar:true, status:true, phone:true },
      take: digits.length >= 6 ? 200 : 20,
    });

    if (digits.length < 6) return users.slice(0, 20);

    const ranked = users
      .map(user => ({ user, score: this.phoneMatchScore(term, user.phone ?? '') }))
      .filter(item => item.score > 0 || users.length <= 20)
      .sort((a, b) => b.score - a.score)
      .map(item => item.user);

    return ranked.slice(0, 20);
  }

  async matchByPhoneHashes(hashes: string[], requesterId: string) {
    const hashSet = new Set((hashes ?? []).filter(h => /^[a-f0-9]{64}$/i.test(h)));
    if (!hashSet.size) return [];
    await this.backfillMissingPhoneHashes();

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: requesterId },
        OR: [
          { phoneHash: { in: [...hashSet] } },
          { phoneDigitsHash: { in: [...hashSet] } },
          { phoneLast8Hash: { in: [...hashSet] } },
          { phoneLast9Hash: { in: [...hashSet] } },
        ],
      },
      select: { id:true, name:true, username:true, avatar:true, status:true, phone:true },
      take: 500,
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
    return [
      this.sha256(normalized),
      this.sha256(digits),
      ...(digits.length >= 8 ? [this.sha256(digits.slice(-8))] : []),
      ...(digits.length >= 9 ? [this.sha256(digits.slice(-9))] : []),
    ];
  }

  private phoneHashData(phone: string | null) {
    if (!phone) {
      return {
        phoneHash: null,
        phoneDigitsHash: null,
        phoneLast8Hash: null,
        phoneLast9Hash: null,
      };
    }
    const normalized = this.normalizePhone(phone);
    const digits = normalized.replace(/\D/g, '');
    return {
      phoneHash: this.sha256(normalized),
      phoneDigitsHash: digits ? this.sha256(digits) : null,
      phoneLast8Hash: digits.length >= 8 ? this.sha256(digits.slice(-8)) : null,
      phoneLast9Hash: digits.length >= 9 ? this.sha256(digits.slice(-9)) : null,
    };
  }

  private async backfillMissingPhoneHashes() {
    const users = await this.prisma.user.findMany({
      where: {
        phone: { not: null },
        OR: [
          { phoneHash: null },
          { phoneDigitsHash: null },
        ],
      },
      select: { id: true, phone: true },
      take: 1000,
    });
    if (!users.length) return;
    await this.prisma.$transaction(
      users.map(user => this.prisma.user.update({
        where: { id: user.id },
        data: this.phoneHashData(user.phone),
      })),
    );
  }

  private phoneLookupCandidates(phone: string) {
    const normalized = this.normalizePhone(phone);
    const digits = normalized.replace(/\D/g, '');
    const withoutLeadingZero = digits.replace(/^0+/, '');
    const candidates = new Set<string>();
    if (normalized.length >= 7) candidates.add(normalized);
    if (digits.length >= 6) candidates.add(digits);
    if (withoutLeadingZero.length >= 6) candidates.add(withoutLeadingZero);
    if (digits.length >= 8) candidates.add(digits.slice(-8));
    if (digits.length >= 9) candidates.add(digits.slice(-9));
    return [...candidates];
  }

  private phoneMatchScore(query: string, phone: string) {
    const queryDigits = this.normalizePhone(query).replace(/\D/g, '');
    const phoneDigits = this.normalizePhone(phone).replace(/\D/g, '');
    if (queryDigits.length < 6 || phoneDigits.length < 6) return 0;
    if (queryDigits === phoneDigits) return 100;
    if (phoneDigits.endsWith(queryDigits)) return 90;
    if (queryDigits.endsWith(phoneDigits)) return 85;
    if (phoneDigits.includes(queryDigits)) return 75;
    if (queryDigits.includes(phoneDigits)) return 70;
    if (queryDigits.length >= 8 && phoneDigits.endsWith(queryDigits.slice(-8))) return 60;
    if (queryDigits.length >= 9 && phoneDigits.endsWith(queryDigits.slice(-9))) return 65;
    return 0;
  }
}
