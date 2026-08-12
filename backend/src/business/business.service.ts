import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type BusinessStatus = 'prospect' | 'chaud' | 'froid' | 'paye' | 'relancer' | 'vip' | 'perdu';
const ADMIN_PHONE = '+2250700508618';
const BUSINESS_MONTHLY_PRICE_FCFA = 10000;
const BUSINESS_STATUSES = new Set(['prospect', 'chaud', 'froid', 'paye', 'relancer', 'vip', 'perdu']);

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(ownerId: string) {
    const access = await this.getAccess(ownerId);
    const [clients, reminders, payments] = await Promise.all([
      this.prisma.businessClient.findMany({
        where: { ownerId },
        orderBy: { updatedAt: 'desc' },
        take: 300,
      }),
      this.prisma.businessReminder.findMany({
        where: { ownerId },
        orderBy: { dueAt: 'asc' },
        take: 300,
      }),
      this.prisma.businessSubscriptionPayment.findMany({
        where: { userId: ownerId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);
    return { clients, reminders, payments, access };
  }

  async getAccess(userId: string) {
    const [user, subscription, wallet] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, email: true } }),
      this.prisma.businessSubscription.findUnique({ where: { userId } }),
      this.prisma.aiWallet.findUnique({ where: { userId } }),
    ]);
    const isAdmin = this.isAdmin(user?.phone);
    const activeUntil = subscription?.activeUntil ?? null;
    const subscriptionActive = isAdmin || Boolean(subscription?.active && activeUntil && activeUntil.getTime() > Date.now());
    const aiCreditsOk = isAdmin || (wallet?.wordsRemaining ?? 0) > 0;
    return {
      isAdmin,
      subscriptionActive,
      aiCreditsOk,
      canAct: subscriptionActive && aiCreditsOk,
      monthlyPriceFcfa: BUSINESS_MONTHLY_PRICE_FCFA,
      activeUntil: isAdmin ? null : activeUntil?.toISOString() ?? null,
      wordsRemaining: isAdmin ? null : wallet?.wordsRemaining ?? 0,
    };
  }

  async initializePaystack(userId: string, nativeReturn = false) {
    const access = await this.getAccess(userId);
    if (access.isAdmin) return { reference: 'admin-unlimited', authorizationUrl: '' };
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) throw new BadRequestException('Compte utilisateur incomplet.');
    const reference = `om-business-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payment = await this.prisma.businessSubscriptionPayment.create({
      data: { userId, reference, amountFcfa: BUSINESS_MONTHLY_PRICE_FCFA, months: 1 },
    });
    const callbackUrl = nativeReturn
      ? `oraclemessenger://paystack?scope=business&reference=${encodeURIComponent(reference)}`
      : `${process.env.FRONTEND_URL || 'https://messenger.oracle-plus.online'}/business?businessPaystack=verify&reference=${encodeURIComponent(reference)}`;
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: BUSINESS_MONTHLY_PRICE_FCFA * 100,
        currency: process.env.PAYSTACK_CURRENCY || 'XOF',
        reference,
        callback_url: callbackUrl,
        metadata: { module: 'business_subscription', months: 1, userId },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status || !data?.data?.authorization_url) {
      await this.prisma.businessSubscriptionPayment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      throw new BadRequestException(data?.message || 'Initialisation Paystack impossible.');
    }
    await this.prisma.businessSubscriptionPayment.update({
      where: { id: payment.id },
      data: { authorizationUrl: data.data.authorization_url },
    });
    return { reference, authorizationUrl: data.data.authorization_url };
  }

  async verifyPaystack(userId: string, reference: string) {
    const access = await this.getAccess(userId);
    if (access.isAdmin) return this.overview(userId);
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const payment = await this.prisma.businessSubscriptionPayment.findUnique({ where: { reference } });
    if (!payment || payment.userId !== userId) throw new ForbiddenException('Paiement Business introuvable.');
    if (payment.status === 'success') return this.overview(userId);
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json().catch(() => null);
    const success = Boolean(res.ok && data?.status && data?.data?.status === 'success');
    if (!success) {
      await this.prisma.businessSubscriptionPayment.update({ where: { reference }, data: { status: 'failed' } });
      throw new BadRequestException(data?.message || 'Paiement Business non validé.');
    }
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.businessSubscriptionPayment.updateMany({
        where: { reference, userId, status: { not: 'success' } },
        data: { status: 'success', paidAt: new Date() },
      });
      if (claimed.count !== 1) return;
      const current = await tx.businessSubscription.findUnique({ where: { userId } });
      const base = current?.activeUntil && current.activeUntil.getTime() > Date.now() ? current.activeUntil : new Date();
      const activeUntil = new Date(base);
      activeUntil.setMonth(activeUntil.getMonth() + Math.max(1, payment.months));
      await tx.businessSubscription.upsert({
        where: { userId },
        create: { userId, active: true, activeUntil },
        update: { active: true, activeUntil },
      });
    });
    return this.overview(userId);
  }

  async saveClient(ownerId: string, dto: {
    id?: string;
    name?: string;
    phone?: string;
    email?: string;
    status?: string;
    tags?: string[];
    notes?: string;
    value?: number;
  }) {
    await this.requireBusinessAction(ownerId);
    const name = String(dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Nom client requis.');

    const status = this.normalizeStatus(dto.status);
    const tags = this.normalizeTags(dto.tags, status);
    const data = {
      name: name.slice(0, 120),
      phone: this.cleanOptional(dto.phone, 40),
      email: this.cleanOptional(dto.email, 180),
      status,
      tags,
      notes: String(dto.notes ?? '').trim().slice(0, 7000),
      value: Math.max(0, Math.round(Number(dto.value) || 0)),
      source: 'manual',
    };

    if (dto.id) {
      const existing = await this.prisma.businessClient.findFirst({ where: { id: dto.id, ownerId }, select: { id: true } });
      if (!existing) throw new ForbiddenException('Client Business introuvable.');
      return this.prisma.businessClient.update({ where: { id: existing.id }, data });
    }
    return this.prisma.businessClient.create({ data: { ownerId, ...data } });
  }

  async saveReminder(ownerId: string, dto: { clientId?: string; title?: string; note?: string; dueAt?: string; autoSend?: boolean }) {
    await this.requireBusinessAction(ownerId);
    const dueAt = new Date(String(dto.dueAt ?? ''));
    if (!Number.isFinite(dueAt.getTime())) throw new BadRequestException('Date de rappel invalide.');

    let client = null as null | { id: string; name: string; conversationId: string | null };
    if (dto.clientId) {
      client = await this.prisma.businessClient.findFirst({
        where: { id: dto.clientId, ownerId },
        select: { id: true, name: true, conversationId: true },
      });
      if (!client) throw new ForbiddenException('Client Business introuvable.');
    }
    if (dto.autoSend && !client?.conversationId) {
      throw new BadRequestException('Relance automatique impossible : ce client n’est pas encore relié à une conversation Oracle Messenger.');
    }

    return this.prisma.businessReminder.create({
      data: {
        ownerId,
        clientId: client?.id,
        conversationId: client?.conversationId,
        title: String(dto.title || (client ? `Relancer ${client.name}` : 'Rappel Business')).trim().slice(0, 160),
        note: String(dto.note ?? '').trim().slice(0, 1200),
        dueAt,
        source: dto.autoSend ? 'ai_auto' : 'manual',
      },
    });
  }

  async markReminderDone(ownerId: string, id: string, done: boolean) {
    await this.requireBusinessAction(ownerId);
    const existing = await this.prisma.businessReminder.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!existing) throw new ForbiddenException('Rappel Business introuvable.');
    return this.prisma.businessReminder.update({ where: { id: existing.id }, data: { done } });
  }

  async collectDueAiReminderActions(limit = 20) {
    const reminders = await this.prisma.businessReminder.findMany({
      where: {
        done: false,
        source: 'ai_auto',
        conversationId: { not: null },
        dueAt: { lte: new Date() },
      },
      include: {
        client: {
          select: {
            name: true,
            status: true,
            tags: true,
            notes: true,
            lastIntent: true,
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: Math.max(1, Math.min(50, limit)),
    });

    const actions: Array<{ reminderId: string; ownerId: string; conversationId: string; context: string }> = [];
    for (const reminder of reminders) {
      const access = await this.getAccess(reminder.ownerId);
      if (!access.canAct || !reminder.conversationId) continue;
      const clientName = reminder.client?.name || 'Client';
      actions.push({
        reminderId: reminder.id,
        ownerId: reminder.ownerId,
        conversationId: reminder.conversationId,
        context: [
          'Tâche Business Oracle Messenger: relance automatique client.',
          `Client: ${clientName}`,
          `Statut client: ${reminder.client?.status || 'prospect'}`,
          `Intention détectée: ${reminder.client?.lastIntent || 'non précisée'}`,
          `Rappel: ${reminder.title}`,
          reminder.note ? `Message ou note source: ${reminder.note}` : '',
          reminder.client?.notes ? `Mémoire CRM courte: ${reminder.client.notes.slice(-900)}` : '',
          'Écris une relance commerciale polie, directe et naturelle. Respecte le nombre maximum de mots configuré dans Gemini.',
        ].filter(Boolean).join('\n'),
      });
    }
    return actions;
  }

  async markAiReminderExecuted(ownerId: string, id: string) {
    await this.prisma.businessReminder.updateMany({
      where: { id, ownerId, source: 'ai_auto' },
      data: { done: true },
    });
  }

  async applyAiMessageInsight(ownerId: string, customerUserId: string, conversationId: string, message: string) {
    const access = await this.getAccess(ownerId);
    if (!access.canAct) return null;

    const clean = String(message || '').trim();
    if (!clean || ownerId === customerUserId) return null;

    const customer = await this.prisma.user.findUnique({
      where: { id: customerUserId },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (!customer) return null;

    const insight = this.classifyMessage(clean);
    const existing = await this.prisma.businessClient.findFirst({
      where: {
        ownerId,
        OR: [
          { conversationId },
          { customerUserId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const previousNotes = existing?.notes ? `${existing.notes}\n` : '';
    const noteLine = `[IA ${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ${insight.reason}`;
    const nextStatus = insight.status || (existing?.status as BusinessStatus | undefined) || 'prospect';
    const tags = Array.from(new Set([
      ...(existing?.tags?.split('|').map(t => t.trim()).filter(Boolean) ?? []),
      nextStatus,
      ...insight.tags,
    ])).slice(0, 8).join('|') || 'prospect';

    const client = existing
      ? await this.prisma.businessClient.update({
          where: { id: existing.id },
          data: {
            customerUserId,
            conversationId,
            name: existing.name || customer.name || 'Client',
            phone: existing.phone || customer.phone,
            email: existing.email || customer.email,
            status: nextStatus,
            tags,
            notes: `${previousNotes}${noteLine}`.slice(-7000),
            source: existing.source === 'manual' ? 'manual' : 'ai_auto',
            lastIntent: insight.intent,
            lastMessageAt: new Date(),
          },
        })
      : await this.prisma.businessClient.create({
          data: {
            ownerId,
            customerUserId,
            conversationId,
            name: customer.name || 'Client',
            phone: customer.phone,
            email: customer.email,
            status: nextStatus,
            tags,
            notes: noteLine,
            source: 'ai_auto',
            lastIntent: insight.intent,
            lastMessageAt: new Date(),
          },
        });

    const dueAt = this.extractReminderDate(clean);
    let reminder = null;
    if (dueAt) {
      reminder = await this.prisma.businessReminder.create({
        data: {
          ownerId,
          clientId: client.id,
          conversationId,
          title: `Relancer ${client.name}`,
          note: clean.slice(0, 600),
          dueAt,
          source: 'ai_auto',
        },
      });
      if (nextStatus !== 'paye') {
        await this.prisma.businessClient.update({
          where: { id: client.id },
          data: {
            status: 'relancer',
            tags: Array.from(new Set(`${tags}|relancer`.split('|').filter(Boolean))).join('|'),
          },
        });
      }
    }

    return { clientId: client.id, status: nextStatus, reminderId: reminder?.id ?? null };
  }

  private async requireBusinessAction(userId: string) {
    const access = await this.getAccess(userId);
    if (!access.canAct) {
      throw new ForbiddenException(!access.subscriptionActive
        ? 'Abonnement Business requis.'
        : 'Crédit IA insuffisant pour les actions Business.');
    }
  }

  private cleanOptional(value: unknown, max: number) {
    const clean = String(value ?? '').trim();
    return clean ? clean.slice(0, max) : null;
  }

  private normalizeStatus(status: unknown): BusinessStatus {
    const raw = String(status ?? 'prospect').trim().toLowerCase();
    if (raw === 'payé') return 'paye';
    return BUSINESS_STATUSES.has(raw) ? raw as BusinessStatus : 'prospect';
  }

  private normalizeTags(tags: unknown, fallback: BusinessStatus) {
    const list = Array.isArray(tags) ? tags : String(tags ?? '').split('|');
    const clean = list
      .map(tag => this.normalizeStatus(tag))
      .filter(Boolean);
    return Array.from(new Set([fallback, ...clean])).slice(0, 8).join('|') || fallback;
  }

  async markPaidFromPayment(ownerId: string, customerUserId?: string | null, conversationId?: string | null, amountFcfa?: number) {
    const where = [
      conversationId ? { conversationId } : null,
      customerUserId ? { customerUserId } : null,
    ].filter(Boolean) as any[];
    if (!where.length) return null;
    const existing = await this.prisma.businessClient.findFirst({ where: { ownerId, OR: where } });
    if (!existing) return null;
    return this.prisma.businessClient.update({
      where: { id: existing.id },
      data: {
        status: 'paye',
        tags: Array.from(new Set(`${existing.tags}|paye`.split('|').filter(Boolean))).join('|'),
        value: amountFcfa ? Math.max(existing.value || 0, amountFcfa) : existing.value,
        source: 'payment',
        notes: `${existing.notes || ''}\n[Paiement] Statut passé à payé${amountFcfa ? ` (${amountFcfa} FCFA)` : ''}.`.trim(),
      },
    });
  }

  private classifyMessage(message: string) {
    const text = message.toLowerCase();
    const tags: string[] = [];
    let status: BusinessStatus = 'prospect';
    let intent = 'message_client';
    let reason = `Message reçu : ${message.slice(0, 240)}`;

    if (/(pay[eé]|paiement effectu[eé]|j'ai pay[eé]|versement|transfert envoy[eé]|reçu de paiement|transaction)/i.test(text)) {
      status = 'paye';
      intent = 'paiement';
      tags.push('paye');
      reason = `Paiement ou confirmation détecté : ${message.slice(0, 240)}`;
    } else if (/(facture|invoice|re[cç]u|devis|proforma|bon de commande|preuve|capture|bordereau)/i.test(text)) {
      status = 'chaud';
      intent = 'facture_ou_document';
      tags.push('chaud', 'facture');
      reason = `Facture, devis, reçu ou document commercial à traiter : ${message.slice(0, 240)}`;
    } else if (/(prix|tarif|combien|devis|acheter|commande|abonnement|int[eé]ress[eé]|je prends|je veux|rdv|rendez-vous|disponible)/i.test(text)) {
      status = 'chaud';
      intent = 'interet_achat';
      tags.push('chaud');
      reason = `Intérêt commercial fort détecté : ${message.slice(0, 240)}`;
    } else if (/(pas int[eé]ress[eé]|trop cher|plus tard|je vais réfléchir|pas maintenant|annuler|stop)/i.test(text)) {
      status = 'froid';
      intent = 'faible_interet';
      tags.push('froid');
      reason = `Intérêt faible ou report détecté : ${message.slice(0, 240)}`;
    }

    if (/(rappel|rappelle|relance|recontact|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lundi|demain|prochain|dans \d+ jours?)/i.test(text)) {
      tags.push('relancer');
      if (status === 'prospect') status = 'relancer';
      intent = `${intent}_rappel`;
    }

    const amount = message.match(/(?:montant|total|prix|solde)?\s*((?:\d[\d\s.,]{2,}))\s*(?:f\s*cfa|fcfa|xof|€|eur|usd)?/i);
    if (amount?.[0]) {
      tags.push('montant');
      reason = `${reason} Montant possible : ${amount[0].trim().slice(0, 40)}.`;
    }

    return { status, tags, intent, reason };
  }

  private extractReminderDate(message: string) {
    const text = message.toLowerCase();
    const now = new Date();
    let target: Date | null = null;

    const inDays = text.match(/dans\s+(\d{1,2})\s+jours?/i);
    if (inDays) {
      target = new Date(now);
      target.setDate(target.getDate() + Number(inDays[1]));
    } else if (/\bdemain\b/i.test(text)) {
      target = new Date(now);
      target.setDate(target.getDate() + 1);
    } else {
      const weekdays: Record<string, number> = {
        dimanche: 0,
        lundi: 1,
        mardi: 2,
        mercredi: 3,
        jeudi: 4,
        vendredi: 5,
        samedi: 6,
      };
      for (const [label, day] of Object.entries(weekdays)) {
        if (text.includes(label)) {
          target = new Date(now);
          const diff = (day - now.getDay() + 7) % 7 || 7;
          target.setDate(target.getDate() + diff);
          break;
        }
      }
    }

    if (!target) return null;
    const hourMatch = text.match(/\b([01]?\d|2[0-3])(?:h|:)([0-5]\d)?\b/);
    target.setHours(hourMatch ? Number(hourMatch[1]) : 9, hourMatch?.[2] ? Number(hourMatch[2]) : 0, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target;
  }

  private isAdmin(phone?: string | null) {
    return this.normalizePhone(phone) === ADMIN_PHONE;
  }

  private normalizePhone(phone?: string | null) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('225')) return `+${digits}`;
    if (digits.startsWith('0')) return `+225${digits.slice(1)}`;
    return `+${digits}`;
  }
}
