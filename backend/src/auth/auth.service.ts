import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

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

    let smsSent = false;

    // ── Provider 0 : Email OTP (Gmail SMTP — gratuit, illimité) ──────────
    // Chercher l'email associé au numéro en base pour lui envoyer le code
    const existingUser = await this.prisma.user.findUnique({ where: { phone: cleaned } });
    const targetEmail  = existingUser?.email;
    const gmailUser    = process.env.GMAIL_USER;
    const gmailPass    = process.env.GMAIL_APP_PASSWORD; // App Password Gmail (16 chars)

    if (gmailUser && gmailPass && targetEmail && !targetEmail.endsWith('@oracle.phone')) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: gmailUser, pass: gmailPass },
        });
        await transporter.sendMail({
          from: `"Oracle Messenger" <${gmailUser}>`,
          to: targetEmail,
          subject: `Votre code de connexion Oracle Messenger : ${code}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8f9fa;border-radius:16px">
              <div style="text-align:center;margin-bottom:24px">
                <div style="width:64px;height:64px;background:#128C7E;border-radius:16px;display:inline-flex;align-items:center;justify-content:center">
                  <span style="font-size:32px">💬</span>
                </div>
                <h2 style="color:#111b21;margin:16px 0 4px">Oracle Messenger</h2>
              </div>
              <p style="color:#667781;font-size:15px;text-align:center;margin-bottom:24px">
                Votre code de vérification pour le numéro <strong>${cleaned}</strong>
              </p>
              <div style="background:#fff;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;border:2px solid #128C7E">
                <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#128C7E">${code}</span>
              </div>
              <p style="color:#8696a0;font-size:13px;text-align:center">
                Ce code expire dans <strong>10 minutes</strong>.<br>Ne le partagez avec personne.
              </p>
            </div>
          `,
        });
        smsSent = true;
        console.log(`[OTP] Sent via Gmail to ${targetEmail}`);
      } catch(e) {
        console.error('[OTP] Gmail error:', e);
      }
    }

    // ── Provider 1 : Twilio ───────────────────────────────────────────────
    const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom  = process.env.TWILIO_PHONE_NUMBER;
    if (twilioSid && twilioToken && twilioFrom && !smsSent) {
      try {
        const smsBody = `Votre code Oracle Messenger : ${code}\nValable 10 min.`;
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          { method:'POST', headers:{ Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To:cleaned, From:twilioFrom, Body:smsBody }).toString() },
        );
        if (res.ok) { smsSent = true; console.log('[OTP] Sent via Twilio'); }
        else { const e = await res.json().catch(()=>({})); console.error('[OTP] Twilio:', e); }
      } catch(e) { console.error('[OTP] Twilio error:', e); }
    }

    // ── Provider 2 : Vonage (Nexmo) ───────────────────────────────────────
    const vonageKey    = process.env.VONAGE_API_KEY;
    const vonageSecret = process.env.VONAGE_API_SECRET;
    if (vonageKey && vonageSecret && !smsSent) {
      try {
        const res = await fetch('https://rest.nexmo.com/sms/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: vonageKey, api_secret: vonageSecret,
            to: cleaned.replace('+',''), from: 'Oracle',
            text: `Votre code Oracle Messenger : ${code}. Valable 10 min.`,
          }),
        });
        const data = await res.json().catch(()=>({}));
        if (data?.messages?.[0]?.status === '0') { smsSent = true; console.log('[OTP] Sent via Vonage'); }
        else console.error('[OTP] Vonage:', data?.messages?.[0]);
      } catch(e) { console.error('[OTP] Vonage error:', e); }
    }

    // ── Provider 3 : Africa's Talking ─────────────────────────────────────
    const atUser   = process.env.AT_USERNAME;
    const atApiKey = process.env.AT_API_KEY;
    if (atUser && atApiKey && !smsSent) {
      try {
        const res = await fetch('https://api.africastalking.com/version1/messaging', {
          method: 'POST',
          headers: { apiKey: atApiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            username: atUser, to: cleaned,
            message: `Votre code Oracle Messenger : ${code}. Valable 10 min.`,
          }).toString(),
        });
        const data = await res.json().catch(()=>({}));
        if (data?.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
          smsSent = true; console.log('[OTP] Sent via Africa\'s Talking');
        } else console.error('[OTP] AT:', data);
      } catch(e) { console.error('[OTP] AT error:', e); }
    }

    // ── Provider 4 : Orange SMS CI (API partenaire) ───────────────────────
    const orangeToken = process.env.ORANGE_SMS_TOKEN;
    const orangeSender = process.env.ORANGE_SMS_SENDER ?? 'Oracle';
    if (orangeToken && !smsSent) {
      try {
        const res = await fetch('https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B' + orangeSender.replace(/\D/g,'') + '/requests', {
          method: 'POST',
          headers: { Authorization: `Bearer ${orangeToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outboundSMSMessageRequest: {
              address: `tel:${cleaned}`,
              senderAddress: `tel:+${orangeSender.replace(/\D/g,'')}`,
              outboundSMSTextMessage: { message: `Votre code Oracle Messenger : ${code}. Valable 10 min.` },
            },
          }),
        });
        if (res.ok) { smsSent = true; console.log('[OTP] Sent via Orange'); }
        else { const e = await res.json().catch(()=>({})); console.error('[OTP] Orange:', e); }
      } catch(e) { console.error('[OTP] Orange error:', e); }
    }

    if (!smsSent) {
      console.warn(`[OTP] No SMS provider configured. Code for ${cleaned}: ${code}`);
    }

    return {
      message: smsSent ? 'Code envoyé par SMS' : 'Code généré (vérifiez les logs)',
      // Retourner le code uniquement en dev sans provider configuré
      ...(isDev && !smsSent ? { dev_code: code } : {}),
    };
  }

  // ── Firebase Phone Auth — vérifier le idToken Firebase et connecter ──────
  async firebasePhoneLogin(idToken: string, phone: string): Promise<{ token: string; user: any; isNew: boolean }> {
    // Vérifier le token Firebase via l'API Google
    const firebaseProjectId = process.env.FIREBASE_PROJECT_ID ?? 'tchingankong';
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY ?? 'AIzaSyA9UHWSZXDwgpSEG5ZyI8LdljxQedkI07A'}`;

    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.users?.[0]) {
      throw new BadRequestException('Token Firebase invalide');
    }

    const firebaseUser = verifyData.users[0];
    const verifiedPhone = firebaseUser.phoneNumber ?? phone;
    const cleaned = verifiedPhone.replace(/[^\d+]/g, '');

    let isNew = false;
    let user = await this.prisma.user.findUnique({ where: { phone: cleaned } });
    if (!user) {
      isNew = true;
      let username = `user${cleaned.replace(/\D/g,'').slice(-7)}`;
      const exists = await this.prisma.user.findUnique({ where: { username } });
      if (exists) username = `${username}${Math.floor(Math.random() * 999)}`;
      user = await this.prisma.user.create({
        data: {
          googleId: `firebase_${cleaned}_${Date.now()}`,
          email: `${cleaned.replace(/\D/g,'')}@oracle.phone`,
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
