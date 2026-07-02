import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

// In-memory OTP store: phone → { code, expiresAt }
const otpStore = new Map<string, { code: string; expiresAt: number }>();

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // ── Phone OTP auth ────────────────────────────────────────────────────────

  async sendOtp(phone: string): Promise<{ message: string; dev_code?: string }> {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.length < 8) throw new BadRequestException('Numéro invalide');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(cleaned, { code, expiresAt });

    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[OTP] ${cleaned} → ${code}`);

    // ── Envoi SMS via Twilio ──────────────────────────────────────────────
    const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom  = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const body = `Votre code Oracle Messenger : ${code}\nValable 10 minutes. Ne le partagez pas.`;
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: cleaned, From: twilioFrom, Body: body }).toString(),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('[OTP] Twilio error:', err);
          // Ne pas bloquer — le code est quand même stocké
        }
      } catch (e) {
        console.error('[OTP] SMS send failed:', e);
      }
    }

    return {
      message: 'Code envoyé par SMS',
      // En dev (sans Twilio), retourner le code pour faciliter les tests
      ...(isDev && !twilioSid ? { dev_code: code } : {}),
    };
  }

  async verifyOtp(phone: string, code: string): Promise<{ token: string; user: any; isNew: boolean }> {
    const cleaned = phone.replace(/[^\d+]/g, '');
    const entry = otpStore.get(cleaned);

    if (!entry) throw new BadRequestException('Aucun code envoyé pour ce numéro');
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(cleaned);
      throw new BadRequestException('Code expiré — demandez un nouveau code');
    }
    if (entry.code !== code.trim()) throw new BadRequestException('Code incorrect');

    otpStore.delete(cleaned);

    let isNew = false;
    let user = await this.prisma.user.findUnique({ where: { phone: cleaned } });
    if (!user) {
      isNew = true;
      let username = `user${cleaned.replace(/\D/g, '').slice(-7)}`;
      const exists = await this.prisma.user.findUnique({ where: { username } });
      if (exists) username = `${username}${Math.floor(Math.random() * 999)}`;

      user = await this.prisma.user.create({
        data: {
          googleId: `phone_${cleaned}_${Date.now()}`,
          email: `${cleaned.replace(/\D/g, '')}@oracle.phone`,
          name: cleaned,
          username,
          phone: cleaned,
          status: 'online',
        },
      });
    } else {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: 'online' } });
    }

    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { token, user, isNew };
  }

  // ── Phone login — no OTP, phone is the unique identifier ─────────────────

  async phoneLogin(phone: string): Promise<{ token: string; user: any; isNew: boolean }> {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.length < 8) throw new BadRequestException('Numéro invalide');

    let isNew = false;
    let user = await this.prisma.user.findUnique({ where: { phone: cleaned } });

    if (!user) {
      isNew = true;
      // Generate a unique username from the last 7 digits
      let username = `user${cleaned.replace(/\D/g, '').slice(-7)}`;
      const exists = await this.prisma.user.findUnique({ where: { username } });
      if (exists) username = `${username}${Math.floor(Math.random() * 999)}`;

      user = await this.prisma.user.create({
        data: {
          googleId: `phone_${cleaned}_${Date.now()}`,
          email: `${cleaned.replace(/\D/g, '')}@oracle.phone`,
          name: cleaned,   // placeholder — user will set real name in onboarding
          username,
          phone: cleaned,
          status: 'online',
        },
      });
    } else {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: 'online' } });
    }

    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { token, user, isNew };
  }

  // ── Google OAuth (kept for existing accounts) ─────────────────────────────

  async googleLogin(dto: { googleId: string; email: string; name: string; avatar?: string }) {
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
