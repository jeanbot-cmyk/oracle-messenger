import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private async verifyGoogleToken(idToken: string) {
    if (!idToken?.trim()) throw new BadRequestException('Jeton Google manquant');

    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`);
    if (!res.ok) throw new BadRequestException('Jeton Google invalide');
    const payload = await res.json();

    const allowedClientIds = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_ID_WEB,
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    ].filter(Boolean);

    if (!allowedClientIds.length) {
      throw new BadRequestException('Configuration Google manquante');
    }
    if (!allowedClientIds.includes(payload.aud)) {
      throw new BadRequestException('Jeton Google non autorisé');
    }
    if (!payload.sub || !payload.email || payload.email_verified === 'false') {
      throw new BadRequestException('Compte Google non vérifié');
    }

    return {
      googleId: String(payload.sub),
      email: String(payload.email).toLowerCase(),
      name: String(payload.name || payload.email.split('@')[0] || 'Utilisateur'),
      avatar: payload.picture ? String(payload.picture) : undefined,
    };
  }

  async googleLogin(dto: { idToken?: string; googleId?: string; email?: string; name?: string; avatar?: string }) {
    const verified = await this.verifyGoogleToken(dto.idToken ?? '');
    const googleId = verified.googleId;
    const email = verified.email;
    const name = verified.name.trim() || email.split('@')[0] || 'Utilisateur';
    const avatar = verified.avatar;

    if (!googleId || !email) throw new BadRequestException('Compte Google invalide');

    const emailOwner = await this.prisma.user.findUnique({ where: { email } });
    if (emailOwner && emailOwner.googleId !== googleId) {
      throw new ConflictException('Cette adresse Gmail est déjà liée à un autre compte Oracle Messenger.');
    }

    let username = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (!username) username = email.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists && exists.googleId !== googleId) username = `${username}${Math.floor(Math.random() * 9999)}`;

    const user = await this.prisma.user.upsert({
      where: { googleId },
      update: { email, name, avatar, status: 'online' },
      create: { googleId, email, name, username, avatar, status: 'online' },
    });

    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { token, user };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async recoverByPhone(phone: string) {
    const lookup = this.phoneRecoveryLookup(phone);
    if (!lookup) throw new BadRequestException('Numéro de téléphone invalide');

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: lookup.normalized },
          { phoneHash: lookup.normalizedHash },
          { phoneDigitsHash: lookup.digitsHash },
        ],
      },
      select: { email: true, name: true },
    });

    if (!user) {
      return {
        found: false,
        message: 'Aucun compte Oracle Messenger trouvé avec ce numéro.',
      };
    }

    return {
      found: true,
      name: user.name,
      emailHint: this.maskEmail(user.email),
      message: 'Compte trouvé. Connectez-vous avec le compte Google indiqué. Google peut demander un code de vérification.',
    };
  }

  private normalizePhone(phone: string) {
    const cleaned = String(phone ?? '').replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\D/g, '')}`;
    return `+${cleaned.replace(/\D/g, '')}`;
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private phoneRecoveryLookup(phone: string) {
    const normalized = this.normalizePhone(phone);
    const digits = normalized.replace(/\D/g, '');
    if (digits.length < 8) return null;
    return {
      normalized,
      normalizedHash: this.sha256(normalized),
      digitsHash: this.sha256(digits),
    };
  }

  private maskEmail(email: string) {
    const [local, domain] = String(email || '').split('@');
    if (!local || !domain) return '';
    const visible = local.length <= 2 ? `${local[0] ?? ''}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
    return `${visible}@${domain}`;
  }
}
