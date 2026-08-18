import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

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
      select: { id:true, name:true, username:true, avatar:true, status:true, lastSeen:true },
    });
  }

  async updateProfile(id: string, data: { name?: string; bio?: string; avatar?: string; phone?: string }) {
    const assignment = data.phone !== undefined && data.phone !== ''
      ? await this.preparePhoneAssignment(id, data.phone)
      : undefined;
    if (assignment?.recoveryUser) {
      const user = await this.prisma.user.update({
        where: { id: assignment.recoveryUser.id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.bio !== undefined ? { bio: data.bio } : {}),
          ...(data.avatar ? { avatar: data.avatar } : {}),
          status: 'online',
        },
      });
      return this.withSessionToken(user, true);
    }

    const phone = assignment?.phone !== undefined
      ? assignment.phone
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
    const assignment = await this.preparePhoneAssignment(id, phone);
    if (assignment.recoveryUser) {
      const user = await this.prisma.user.update({
        where: { id: assignment.recoveryUser.id },
        data: { status: 'online' },
      });
      return this.withSessionToken(user, true);
    }
    const cleaned = assignment.phone;

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
    // La découverte d'utilisateurs par recherche directe est désactivée.
    // Les contacts autorisés passent uniquement par matchByPhoneHashes(), à partir
    // des numéros importés ou ajoutés explicitement par l'utilisateur.
    void q;
    void excludeId;
    return [];
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
      select: { id:true, name:true, username:true, avatar:true, status:true, lastSeen:true, phone:true },
      take: 500,
    });

    const matched = users.filter(user => {
      const variants = this.phoneHashVariants(user.phone ?? '');
      return variants.some(hash => hashSet.has(hash));
    });
    await this.rememberContacts(requesterId, matched.map(user => user.id), 'phone_import');
    return matched;
  }

  async matchExplicitContact(requesterId: string, data: { hashes?: string[]; phone?: string; email?: string }) {
    const hashSet = new Set((data.hashes ?? []).filter(h => /^[a-f0-9]{64}$/i.test(h)));
    const rawPhone = String(data.phone ?? '').trim();
    const email = String(data.email ?? '').trim().toLowerCase();
    if (rawPhone) {
      for (const candidate of this.phoneLookupCandidates(rawPhone)) {
        hashSet.add(this.sha256(candidate));
      }
    }
    if (!hashSet.size && !email) return null;

    await this.backfillMissingPhoneHashes();

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: requesterId },
        OR: [
          ...(hashSet.size ? [
            { phoneHash: { in: [...hashSet] } },
            { phoneDigitsHash: { in: [...hashSet] } },
            { phoneLast8Hash: { in: [...hashSet] } },
            { phoneLast9Hash: { in: [...hashSet] } },
          ] : []),
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
      select: { id:true, name:true, username:true, avatar:true, status:true, lastSeen:true, phone:true, email:true },
      take: 20,
    });

    let user = users[0];
    if (rawPhone) {
      const scored = users
        .map(candidate => ({ candidate, score: this.phoneMatchScore(rawPhone, candidate.phone ?? '') }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);
      const best = scored[0];
      const sameBest = best ? scored.filter(item => item.score === best.score) : [];

      // Une correspondance par suffixe seul n'est pas une identité certaine.
      // Si plusieurs comptes ont le même suffixe, on ne lie aucun compte.
      user = best && !(best.score < 80 && sameBest.length > 1)
        ? best.candidate
        : users.find(candidate => candidate.email?.toLowerCase() === email);
    }

    if (!user) return null;
    await this.rememberContacts(requesterId, [user.id], email ? 'manual_email' : 'manual_phone');
    return user;
  }

  async deleteContact(ownerId: string, contactUserId: string) {
    const cleanContactUserId = String(contactUserId || '').trim();
    if (!cleanContactUserId || cleanContactUserId === ownerId) {
      throw new BadRequestException('Contact invalide');
    }
    const result = await this.prisma.contact.deleteMany({
      where: {
        ownerId,
        contactUserId: cleanContactUserId,
      },
    });
    return { ok: true, deleted: result.count };
  }

  async setPresence(id: string, status: 'online' | 'connected' | 'offline') {
    return this.prisma.user.update({
      where: { id },
      data: {
        status,
        lastSeen: status === 'offline' ? new Date() : null,
      },
    });
  }

  async setOnline(id: string, online: boolean) {
    return this.setPresence(id, online ? 'online' : 'offline');
  }

  async markOnlineUsersOfflineExcept(connectedUserIds: string[], keepRecentlyConnectedMs = 0) {
    const keepOnlineIds = [...new Set((connectedUserIds ?? []).filter(Boolean))];
    const connectedCutoff = new Date(Date.now() - Math.max(0, keepRecentlyConnectedMs));
    const staleUsers = await this.prisma.user.findMany({
      where: {
        status: { in: ['online', 'connected'] },
        ...(keepOnlineIds.length ? { id: { notIn: keepOnlineIds } } : {}),
        OR: [
          { status: 'online' },
          {
            status: 'connected',
            ...(keepRecentlyConnectedMs > 0 ? { updatedAt: { lt: connectedCutoff } } : {}),
          },
        ],
      },
      select: { id: true },
    });
    if (!staleUsers.length) return [];

    const lastSeen = new Date();
    const staleIds = staleUsers.map(user => user.id);
    await this.prisma.user.updateMany({
      where: { id: { in: staleIds } },
      data: { status: 'offline', lastSeen },
    });
    return staleIds.map(userId => ({ userId, lastSeen }));
  }

  async savePushToken(userId: string, token: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { pushToken: token } });
  }

  private async rememberContacts(ownerId: string, contactUserIds: string[], source: string) {
    const ids = [...new Set(contactUserIds.filter(id => id && id !== ownerId))];
    if (!ids.length) return;
    await this.prisma.$transaction(ids.map(contactUserId => (
      this.prisma.contact.upsert({
        where: { ownerId_contactUserId: { ownerId, contactUserId } },
        create: { ownerId, contactUserId, source },
        update: { source },
      })
    )));
  }

  private normalizePhone(phone: string) {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
    return `+${cleaned.replace(/\D/g, '')}`;
  }

  private async normalizeUniquePhone(userId: string, phone: string) {
    return (await this.preparePhoneAssignment(userId, phone)).phone;
  }

  private async preparePhoneAssignment(userId: string, phone: string) {
    const cleaned = this.normalizePhone(phone);
    if (cleaned.replace(/\D/g, '').length < 8) throw new BadRequestException('Numéro de téléphone invalide');

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, googleId: true },
    });
    if (!current) throw new BadRequestException('Compte Oracle Messenger introuvable');

    await this.backfillMissingPhoneHashes();
    const digits = cleaned.replace(/\D/g, '');
    const owner = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleaned },
          { phoneHash: this.sha256(cleaned) },
          { phoneDigitsHash: this.sha256(digits) },
        ],
      },
      select: { id: true, email: true, googleId: true },
    });
    if (owner && owner.id !== userId) {
      const sameGoogleAccount =
        (!!owner.googleId && owner.googleId === current.googleId) ||
        (!!owner.email && owner.email.toLowerCase() === current.email.toLowerCase());
      if (sameGoogleAccount) {
        return { phone: cleaned, recoveryUser: owner };
      }
      throw new ConflictException('Ce numéro est déjà lié à un autre compte Google Oracle Messenger. Connectez-vous avec le Gmail associé à ce numéro.');
    }
    return { phone: cleaned, recoveryUser: null };
  }

  private withSessionToken(user: any, recovered: boolean) {
    return {
      ...user,
      recovered,
      token: this.jwt.sign({ sub: user.id, email: user.email }),
    };
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
          { phoneLast8Hash: null },
          { phoneLast9Hash: null },
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
    if (withoutLeadingZero.length >= 8) candidates.add(withoutLeadingZero.slice(-8));
    if (withoutLeadingZero.length >= 9) candidates.add(withoutLeadingZero.slice(-9));
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
