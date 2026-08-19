import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { createWorker } from 'tesseract.js';
import { PrismaService } from '../prisma/prisma.service';

type BusinessStatus = 'prospect' | 'chaud' | 'froid' | 'paye' | 'relancer' | 'vip' | 'perdu';
const ADMIN_PHONE = '+2250700508618';
const BUSINESS_ENTERPRISE_PRICE_FCFA = 50000;
const BUSINESS_WESTERN_UNION_DAILY_AI_WORDS = 8000;
const BUSINESS_WESTERN_UNION_CONFIG_KEY = 'business_western_union_config';
const BUSINESS_STATUSES = new Set(['prospect', 'chaud', 'froid', 'paye', 'relancer', 'vip', 'perdu']);

type WesternUnionFinding = {
  code: string;
  label: string;
  severity: 'info' | 'warning' | 'critical';
};

type BusinessWesternUnionConfig = {
  enabled: boolean;
  beneficiaryFullName: string;
  beneficiaryPhone: string;
  beneficiaryCountry: string;
  minimumAmountFcfa: number;
  feesPaidByUser: boolean;
  dailyAiWords: number;
  conferenceSessionsPerWeek: number;
  aiVideos45sPerWeek: number;
  flyersPerWeek: number;
  blueVerifiedBadge: boolean;
  directAdminAssistance: boolean;
};

const DEFAULT_BUSINESS_WESTERN_UNION_CONFIG: BusinessWesternUnionConfig = {
  enabled: true,
  beneficiaryFullName: 'Tchingankong Georges Bonas',
  beneficiaryPhone: '+2250504673829',
  beneficiaryCountry: "Côte d'Ivoire",
  minimumAmountFcfa: BUSINESS_ENTERPRISE_PRICE_FCFA,
  feesPaidByUser: true,
  dailyAiWords: BUSINESS_WESTERN_UNION_DAILY_AI_WORDS,
  conferenceSessionsPerWeek: 1,
  aiVideos45sPerWeek: 3,
  flyersPerWeek: 6,
  blueVerifiedBadge: true,
  directAdminAssistance: true,
};

function westernUnionRiskScore(findings: WesternUnionFinding[]) {
  const score = findings.reduce((total, finding) => (
    total + (finding.severity === 'critical' ? 45 : finding.severity === 'warning' ? 15 : 4)
  ), 0);
  return Math.max(0, Math.min(100, score));
}

function westernUnionRiskLevel(score: number) {
  if (score >= 80) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 20) return 'moderate';
  return 'low';
}

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(ownerId: string) {
    const access = await this.getAccess(ownerId);
    const westernUnion = await this.getWesternUnionPaymentConfigForUser(ownerId);
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
    return { clients, reminders, payments, access, westernUnion };
  }

  async getAccess(userId: string) {
    const [user, subscription, wallet, config] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, email: true, isPremium: true, premiumUntil: true } }),
      this.prisma.businessSubscription.findUnique({ where: { userId } }),
      this.prisma.aiWallet.findUnique({ where: { userId } }),
      this.getWesternUnionPaymentConfig(),
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
      monthlyPriceFcfa: config.minimumAmountFcfa,
      activeUntil: isAdmin ? null : activeUntil?.toISOString() ?? null,
      wordsRemaining: isAdmin ? null : wallet?.wordsRemaining ?? 0,
      premium: isAdmin || Boolean(user?.isPremium && user?.premiumUntil && user.premiumUntil.getTime() > Date.now()),
      premiumBadge: isAdmin || Boolean(config.blueVerifiedBadge && subscriptionActive),
      premiumBadgeColor: 'blue',
      planCode: subscriptionActive ? 'business_enterprise_monthly' : null,
      planLabel: 'Forfait entreprise',
      dailyAiWords: isAdmin ? null : config.dailyAiWords,
      conferenceSessionsPerWeek: config.conferenceSessionsPerWeek,
      aiVideos45sPerWeek: config.aiVideos45sPerWeek,
      flyersPerWeek: config.flyersPerWeek,
      directAdminAssistance: config.directAdminAssistance,
      libraryIncluded: false,
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
      data: { userId, reference, amountFcfa: access.monthlyPriceFcfa, months: 1 },
    });
    const callbackUrl = nativeReturn
      ? `oraclemessenger://paystack?scope=business&reference=${encodeURIComponent(reference)}`
      : `${process.env.FRONTEND_URL || 'https://messenger.oracle-plus.online'}/business?businessPaystack=verify&reference=${encodeURIComponent(reference)}`;
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: access.monthlyPriceFcfa * 100,
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
    const config = await this.getWesternUnionPaymentConfig();
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
      await tx.aiWallet.upsert({
        where: { userId },
        create: {
          userId,
          wordsRemaining: config.dailyAiWords,
          valueRemainingFcfa: 0,
          wordsConsumed: 0,
          totalResponses: 0,
        },
        update: {
          wordsRemaining: { increment: config.dailyAiWords },
          valueRemainingFcfa: 0,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumUntil: activeUntil },
      });
    });
    await this.sendBusinessPaystackConfirmation(userId, config).catch(() => null);
    return this.overview(userId);
  }

  normalizeWesternUnionConfig(input?: Partial<BusinessWesternUnionConfig> | null): BusinessWesternUnionConfig {
    return {
      ...DEFAULT_BUSINESS_WESTERN_UNION_CONFIG,
      ...(input ?? {}),
      beneficiaryFullName: String(input?.beneficiaryFullName ?? DEFAULT_BUSINESS_WESTERN_UNION_CONFIG.beneficiaryFullName).trim() || DEFAULT_BUSINESS_WESTERN_UNION_CONFIG.beneficiaryFullName,
      beneficiaryPhone: String(input?.beneficiaryPhone ?? DEFAULT_BUSINESS_WESTERN_UNION_CONFIG.beneficiaryPhone).trim() || DEFAULT_BUSINESS_WESTERN_UNION_CONFIG.beneficiaryPhone,
      beneficiaryCountry: String(input?.beneficiaryCountry ?? DEFAULT_BUSINESS_WESTERN_UNION_CONFIG.beneficiaryCountry).trim() || DEFAULT_BUSINESS_WESTERN_UNION_CONFIG.beneficiaryCountry,
      minimumAmountFcfa: BUSINESS_ENTERPRISE_PRICE_FCFA,
      feesPaidByUser: input?.feesPaidByUser ?? true,
      dailyAiWords: BUSINESS_WESTERN_UNION_DAILY_AI_WORDS,
      conferenceSessionsPerWeek: 1,
      aiVideos45sPerWeek: 3,
      flyersPerWeek: 6,
      blueVerifiedBadge: input?.blueVerifiedBadge ?? true,
      directAdminAssistance: input?.directAdminAssistance ?? true,
      enabled: input?.enabled ?? true,
    };
  }

  async getWesternUnionPaymentConfig(): Promise<BusinessWesternUnionConfig> {
    const row = await this.prisma.aiSetting.findUnique({ where: { key: BUSINESS_WESTERN_UNION_CONFIG_KEY } }).catch(() => null);
    if (!row?.value) return DEFAULT_BUSINESS_WESTERN_UNION_CONFIG;
    try {
      return this.normalizeWesternUnionConfig(JSON.parse(row.value));
    } catch {
      return DEFAULT_BUSINESS_WESTERN_UNION_CONFIG;
    }
  }

  async updateWesternUnionPaymentConfig(input: Partial<BusinessWesternUnionConfig>) {
    const config = this.normalizeWesternUnionConfig(input);
    await this.prisma.aiSetting.upsert({
      where: { key: BUSINESS_WESTERN_UNION_CONFIG_KEY },
      create: { key: BUSINESS_WESTERN_UNION_CONFIG_KEY, value: JSON.stringify(config) },
      update: { value: JSON.stringify(config) },
    });
    return { config };
  }

  async getWesternUnionPaymentConfigForUser(userId: string) {
    const [config, user] = await Promise.all([
      this.getWesternUnionPaymentConfig(),
      this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }),
    ]);
    return {
      config,
      available: config.enabled && !this.isCoteDIvoireUser(user?.phone),
      unavailableReason: this.isCoteDIvoireUser(user?.phone)
        ? "Western Union est réservé aux utilisateurs hors de Côte d'Ivoire."
        : null,
      instructions: [
        `Envoyez au minimum ${config.minimumAmountFcfa.toLocaleString('fr-FR')} FCFA par Western Union.`,
        `Les frais Western Union sont à votre charge afin que ${config.beneficiaryFullName} reçoive le montant requis.`,
        'Après l’envoi, photographiez le reçu original le jour même avec l’appareil photo.',
        'Envoyez le reçu dans l’espace sécurisé pour validation automatique en deux contrôles.',
      ],
      enterpriseBenefits: this.enterpriseBenefits(config),
    };
  }

  async submitWesternUnionReceipt(userId: string, body: any) {
    const config = await this.getWesternUnionPaymentConfig();
    if (!config.enabled) throw new BadRequestException('Paiement Western Union indisponible.');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, phone: true } });
    if (!user) throw new ForbiddenException('Utilisateur introuvable.');
    if (this.isCoteDIvoireUser(user.phone) || this.isCoteDIvoireCountry(body?.senderCountry)) {
      throw new ForbiddenException("Western Union est réservé aux utilisateurs hors de Côte d'Ivoire.");
    }

    const transactionNumber = String(body?.transactionNumber ?? '').trim().toUpperCase();
    const senderFullName = String(body?.senderFullName ?? '').trim();
    const senderCountry = String(body?.senderCountry ?? '').trim();
    const fileName = String(body?.fileName ?? 'western-union-recu.jpg').trim().slice(0, 180);
    const mimeType = String(body?.mimeType ?? '').trim().toLowerCase();
    const amountFcfa = Math.round(Number(body?.amountFcfa) || 0);
    const paymentDate = new Date(String(body?.paymentDate ?? ''));
    const receiptDataUrl = String(body?.receiptDataUrl ?? '');
    const width = Math.round(Number(body?.width) || 0);
    const height = Math.round(Number(body?.height) || 0);
    const fileSize = Math.round(Number(body?.fileSize) || 0);
    if (!transactionNumber || !senderFullName || !senderCountry) {
      throw new BadRequestException('Numéro de transaction, envoyeur et pays requis.');
    }
    if (!Number.isFinite(paymentDate.getTime())) throw new BadRequestException('Date de paiement invalide.');
    if (!receiptDataUrl.startsWith('data:image/')) throw new BadRequestException('Photo originale du reçu requise.');
    if (receiptDataUrl.length > 14_000_000) throw new BadRequestException('Photo trop lourde. Reprenez une photo plus légère.');

    await this.ensureWesternUnionReceiptTable();
    const imageBuffer = this.dataUrlToBuffer(receiptDataUrl);
    const documentHash = createHash('sha256')
      .update(imageBuffer)
      .update('|')
      .update(transactionNumber)
      .digest('hex');

    const existing = await this.prisma.$queryRawUnsafe<Array<{ id: string; transactionNumber: string; documentHash: string }>>(
      `SELECT "id", "transactionNumber", "documentHash" FROM "BusinessWesternUnionReceipt" WHERE "transactionNumber" = $1 OR "documentHash" = $2 LIMIT 1`,
      transactionNumber,
      documentHash,
    );

    const firstFindings = this.runWesternUnionFirstControl({
      transactionNumber,
      amountFcfa,
      paymentDate,
      submittedAt: new Date(),
      senderCountry,
      fileName,
      mimeType,
      fileSize,
      width,
      height,
      existingDuplicate: existing[0] ?? null,
      config,
    });

    const second = await this.runWesternUnionSecondControl({
      imageBuffer,
      transactionNumber,
      amountFcfa,
      paymentDate,
      beneficiaryFullName: config.beneficiaryFullName,
    });
    const findings = this.uniqueFindings([...firstFindings, ...second.findings]);
    const riskScore = westernUnionRiskScore(findings);
    const status = findings.some(item => item.severity === 'critical')
      ? 'rejected'
      : findings.some(item => item.severity === 'warning')
        ? 'pending_manual_review'
        : 'approved';

    const id = randomUUID();
    const submittedAt = new Date();
    const audit = {
      firstControlAt: submittedAt.toISOString(),
      secondControlAt: new Date().toISOString(),
      controls: ['technical_integrity', 'ocr_field_coherence'],
      note: 'Les contrôles automatiques ne constituent pas une preuve absolue. Les cas suspects restent vérifiés manuellement.',
      findings,
      riskScore,
      riskLevel: westernUnionRiskLevel(riskScore),
      riskReasons: findings.filter(item => item.severity !== 'info').map(item => item.label).slice(0, 8),
      enterpriseBenefits: this.enterpriseBenefits(config),
    };
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "BusinessWesternUnionReceipt"
       ("id", "userId", "transactionNumber", "documentHash", "amountFcfa", "senderFullName", "senderCountry", "paymentDate", "submittedAt", "status", "beneficiarySnapshot", "documentMeta", "audit", "ocrText", "receiptDataUrl")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15)`,
      id,
      userId,
      transactionNumber,
      documentHash,
      amountFcfa,
      senderFullName,
      senderCountry,
      paymentDate,
      submittedAt,
      status,
      JSON.stringify(config),
      JSON.stringify({ fileName, mimeType, fileSize, width, height }),
      JSON.stringify(audit),
      second.ocrText,
      receiptDataUrl,
    );

    if (status === 'approved') {
      await this.activateWesternUnionEnterprisePlan(userId, config, id);
      await this.sendWesternUnionConfirmation(userId, config).catch(() => null);
    }

    return {
      receipt: {
        id,
        transactionNumber,
        amountFcfa,
        submittedAt: submittedAt.toISOString(),
        status,
        findings,
      },
      access: await this.getAccess(userId),
      message: status === 'approved'
        ? 'Paiement reçu et forfait entreprise activé pour un mois.'
        : status === 'pending_manual_review'
          ? 'Reçu enregistré. Une vérification manuelle est nécessaire avant activation.'
          : 'Reçu refusé automatiquement à cause d’une incohérence critique.',
    };
  }

  async getWesternUnionReceiptsForAdmin() {
    await this.ensureWesternUnionReceiptTable();
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT r."id", r."userId", u."name", u."email", u."phone", r."transactionNumber", r."amountFcfa",
              r."senderFullName", r."senderCountry", r."paymentDate", r."submittedAt", r."status",
              r."documentMeta", r."audit", r."ocrText", r."receiptDataUrl"
       FROM "BusinessWesternUnionReceipt" r
       LEFT JOIN "User" u ON u."id" = r."userId"
       WHERE r."adminDeletedAt" IS NULL
       ORDER BY r."submittedAt" DESC
       LIMIT 100`,
    );
  }

  async hideWesternUnionReceiptForAdmin(receiptId: string) {
    await this.ensureWesternUnionReceiptTable();
    const id = String(receiptId || '').trim();
    if (!id) throw new BadRequestException('Reçu Western Union introuvable.');
    const updated = await this.prisma.$executeRawUnsafe(
      `UPDATE "BusinessWesternUnionReceipt" SET "adminDeletedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
      id,
    );
    return { ok: true, updated };
  }

  async approveWesternUnionReceiptForAdmin(receiptId: string) {
    await this.ensureWesternUnionReceiptTable();
    const id = String(receiptId || '').trim();
    if (!id) throw new BadRequestException('Reçu Western Union introuvable.');
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; userId: string; status: string; beneficiarySnapshot: any }>>(
      `SELECT "id", "userId", "status", "beneficiarySnapshot" FROM "BusinessWesternUnionReceipt" WHERE "id" = $1 LIMIT 1`,
      id,
    );
    const receipt = rows[0];
    if (!receipt) throw new BadRequestException('Reçu Western Union introuvable.');
    const config = this.normalizeWesternUnionConfig(receipt.beneficiarySnapshot);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "BusinessWesternUnionReceipt" SET "status" = 'approved' WHERE "id" = $1`,
      id,
    );
    await this.activateWesternUnionEnterprisePlan(receipt.userId, config, id);
    await this.sendWesternUnionConfirmation(receipt.userId, config).catch(() => null);
    return {
      ok: true,
      receiptId: id,
      status: 'approved',
      access: await this.getAccess(receipt.userId),
    };
  }

  private async activateWesternUnionEnterprisePlan(userId: string, config: BusinessWesternUnionConfig, receiptId: string) {
    const current = await this.prisma.businessSubscription.findUnique({ where: { userId } });
    const base = current?.activeUntil && current.activeUntil.getTime() > Date.now() ? current.activeUntil : new Date();
    const activeUntil = new Date(base);
    activeUntil.setMonth(activeUntil.getMonth() + 1);
    await this.prisma.$transaction(async tx => {
      await tx.businessSubscription.upsert({
        where: { userId },
        create: { userId, active: true, activeUntil },
        update: { active: true, activeUntil },
      });
      await tx.aiWallet.upsert({
        where: { userId },
        create: {
          userId,
          wordsRemaining: config.dailyAiWords,
          valueRemainingFcfa: 0,
          wordsConsumed: 0,
          totalResponses: 0,
        },
        update: {
          wordsRemaining: { increment: config.dailyAiWords },
          valueRemainingFcfa: 0,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumUntil: activeUntil },
      });
      await tx.businessSubscriptionPayment.upsert({
        where: { reference: `wu-business-${receiptId}` },
        create: {
          userId,
          reference: `wu-business-${receiptId}`,
          amountFcfa: config.minimumAmountFcfa,
          months: 1,
          status: 'success',
          paidAt: new Date(),
        },
        update: {
          status: 'success',
          paidAt: new Date(),
        },
      });
    });
  }

  private async sendBusinessPaystackConfirmation(userId: string, config: BusinessWesternUnionConfig) {
    const official = await this.ensureOfficialSystemUser();
    const conv = await this.ensureDirectConversation(official.id, userId);
    await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: official.id,
        type: 'text',
        content: [
          'Paiement Paystack reçu et validé.',
          `Votre forfait entreprise Oracle Messenger est actif pour un mois.`,
          `Accès : ${config.conferenceSessionsPerWeek} session conférence/semaine, ${config.aiVideos45sPerWeek} vidéos 45s/semaine, ${config.flyersPerWeek} flyers/semaine, IA ${config.dailyAiWords.toLocaleString('fr-FR')} mots/jour, badge bleu vérifié et assistance directe administrateur.`,
          'La bibliothèque reste exclue du forfait.',
        ].join('\n'),
      },
    });
  }

  private async sendWesternUnionConfirmation(userId: string, config: BusinessWesternUnionConfig) {
    const official = await this.ensureOfficialSystemUser();
    const conv = await this.ensureDirectConversation(official.id, userId);
    await this.prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: official.id,
        type: 'text',
        content: [
          'Paiement Western Union reçu et validé.',
          `Votre forfait entreprise Oracle Messenger est actif pour un mois.`,
          `Accès : ${config.conferenceSessionsPerWeek} session conférence/semaine, ${config.aiVideos45sPerWeek} vidéos 45s/semaine, ${config.flyersPerWeek} flyers/semaine, IA ${config.dailyAiWords.toLocaleString('fr-FR')} mots/jour, badge bleu vérifié et assistance directe administrateur.`,
          'La bibliothèque reste exclue du forfait.',
        ].join('\n'),
      },
    });
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
          'Écris une relance commerciale polie, directe et naturelle. Respecte le nombre maximum de mots configuré pour l’agent virtuel.',
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

  private enterpriseBenefits(config: BusinessWesternUnionConfig) {
    return {
      plan: 'Forfait entreprise',
      amountFcfa: config.minimumAmountFcfa,
      duration: '1 mois',
      dailyAiWords: config.dailyAiWords,
      conferenceSessionsPerWeek: config.conferenceSessionsPerWeek,
      aiVideos45sPerWeek: config.aiVideos45sPerWeek,
      flyersPerWeek: config.flyersPerWeek,
      blueVerifiedBadge: config.blueVerifiedBadge,
      directAdminAssistance: config.directAdminAssistance,
      libraryIncluded: false,
    };
  }

  private async ensureWesternUnionReceiptTable() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BusinessWesternUnionReceipt" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "transactionNumber" TEXT NOT NULL,
        "documentHash" TEXT NOT NULL,
        "amountFcfa" INTEGER NOT NULL,
        "senderFullName" TEXT NOT NULL,
        "senderCountry" TEXT,
        "paymentDate" TIMESTAMP(3) NOT NULL,
        "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status" TEXT NOT NULL DEFAULT 'pending_manual_review',
        "beneficiarySnapshot" JSONB NOT NULL,
        "documentMeta" JSONB NOT NULL,
        "audit" JSONB NOT NULL,
        "ocrText" TEXT,
        "receiptDataUrl" TEXT NOT NULL,
        "adminDeletedAt" TIMESTAMP(3)
      )
    `);
    await this.prisma.$executeRawUnsafe(`ALTER TABLE "BusinessWesternUnionReceipt" ADD COLUMN IF NOT EXISTS "adminDeletedAt" TIMESTAMP(3)`);
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BusinessWesternUnionReceipt_transaction_uq" ON "BusinessWesternUnionReceipt" ("transactionNumber")`);
    await this.prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BusinessWesternUnionReceipt_hash_uq" ON "BusinessWesternUnionReceipt" ("documentHash")`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BusinessWesternUnionReceipt_user_idx" ON "BusinessWesternUnionReceipt" ("userId", "submittedAt" DESC)`);
  }

  private dataUrlToBuffer(dataUrl: string) {
    const match = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
    if (!match) throw new BadRequestException('Photo de reçu invalide.');
    return Buffer.from(match[1], 'base64');
  }

  private runWesternUnionFirstControl(input: {
    transactionNumber: string;
    amountFcfa: number;
    paymentDate: Date;
    submittedAt: Date;
    senderCountry: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    existingDuplicate: { id: string; transactionNumber: string; documentHash: string } | null;
    config: BusinessWesternUnionConfig;
  }): WesternUnionFinding[] {
    const findings: WesternUnionFinding[] = [];
    const fileName = input.fileName.toLowerCase();
    const sameDay = input.paymentDate.toISOString().slice(0, 10) === input.submittedAt.toISOString().slice(0, 10);
    const ratio = input.width && input.height ? Math.max(input.width, input.height) / Math.max(1, Math.min(input.width, input.height)) : 0;
    if (!/^[A-Z0-9-]{6,30}$/.test(input.transactionNumber)) {
      findings.push({ code: 'transaction_format', label: 'Numéro de transaction invalide ou incomplet.', severity: 'critical' });
    }
    if (input.amountFcfa < input.config.minimumAmountFcfa) {
      findings.push({ code: 'amount_too_low', label: 'Montant inférieur au forfait entreprise requis.', severity: 'critical' });
    }
    if (!sameDay) {
      findings.push({ code: 'not_same_day', label: 'Le reçu doit être envoyé le jour même du paiement.', severity: 'critical' });
    }
    if (this.isCoteDIvoireCountry(input.senderCountry)) {
      findings.push({ code: 'country_not_allowed', label: "Western Union est réservé aux utilisateurs hors de Côte d'Ivoire.", severity: 'critical' });
    }
    if (fileName.includes('screenshot') || fileName.includes('capture') || fileName.includes('screen')) {
      findings.push({ code: 'screenshot_file_name', label: 'Le fichier ressemble à une capture d’écran.', severity: 'critical' });
    }
    if (input.mimeType && !input.mimeType.startsWith('image/')) {
      findings.push({ code: 'mime_not_image', label: 'Le reçu doit être une photo originale.', severity: 'critical' });
    }
    if (input.fileSize > 0 && input.fileSize < 35_000) {
      findings.push({ code: 'abnormal_compression', label: 'Compression anormalement faible pour une photo de reçu.', severity: 'warning' });
    }
    if (ratio > 3.2) {
      findings.push({ code: 'suspicious_crop', label: 'Recadrage inhabituel détecté.', severity: 'warning' });
    }
    if (input.existingDuplicate) {
      findings.push({ code: 'duplicate_receipt', label: 'Numéro de transaction ou document déjà utilisé.', severity: 'critical' });
    }
    return findings;
  }

  private async runWesternUnionSecondControl(input: {
    imageBuffer: Buffer;
    transactionNumber: string;
    amountFcfa: number;
    paymentDate: Date;
    beneficiaryFullName: string;
  }): Promise<{ ocrText: string; findings: WesternUnionFinding[] }> {
    const findings: WesternUnionFinding[] = [];
    let ocrText = '';
    try {
      const worker = await createWorker('fra+eng');
      const result = await worker.recognize(input.imageBuffer);
      await worker.terminate();
      ocrText = String(result?.data?.text ?? '').trim();
    } catch {
      findings.push({ code: 'ocr_failed', label: 'OCR non concluant : vérification manuelle requise.', severity: 'warning' });
      return { ocrText, findings };
    }
    const normalized = this.normalizeForReceiptMatch(ocrText);
    if (ocrText.length < 40) {
      findings.push({ code: 'ocr_text_too_short', label: 'Le texte OCR extrait est insuffisant.', severity: 'warning' });
    }
    const transactionNeedle = this.normalizeForReceiptMatch(input.transactionNumber);
    if (transactionNeedle && !normalized.includes(transactionNeedle)) {
      findings.push({ code: 'transaction_not_found_ocr', label: 'Le numéro de transaction n’est pas confirmé par OCR.', severity: 'warning' });
    }
    const amountNeedle = String(input.amountFcfa);
    const compactText = normalized.replace(/\D/g, '');
    if (!compactText.includes(amountNeedle)) {
      findings.push({ code: 'amount_not_found_ocr', label: 'Le montant n’est pas confirmé par OCR.', severity: 'warning' });
    }
    const beneficiaryTokens = this.normalizeForReceiptMatch(input.beneficiaryFullName).split(/\s+/).filter(token => token.length >= 4);
    const matchedTokens = beneficiaryTokens.filter(token => normalized.includes(token));
    if (beneficiaryTokens.length && matchedTokens.length < Math.min(2, beneficiaryTokens.length)) {
      findings.push({ code: 'beneficiary_not_confirmed_ocr', label: 'Le bénéficiaire n’est pas clairement confirmé par OCR.', severity: 'warning' });
    }
    return { ocrText, findings };
  }

  private uniqueFindings(findings: WesternUnionFinding[]) {
    const seen = new Set<string>();
    return findings.filter(finding => {
      if (seen.has(finding.code)) return false;
      seen.add(finding.code);
      return true;
    });
  }

  private normalizeForReceiptMatch(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private isCoteDIvoireCountry(value?: string | null) {
    const normalized = this.normalizeForReceiptMatch(String(value ?? '')).replace(/\s+/g, '');
    return normalized === 'ci' || normalized === 'cotedivoire' || normalized === 'coteivoire';
  }

  private isCoteDIvoireUser(phone?: string | null) {
    return this.normalizePhone(phone).startsWith('+225');
  }

  private async ensureOfficialSystemUser() {
    const googleId = 'system-oracle-business';
    return this.prisma.user.upsert({
      where: { googleId },
      create: {
        googleId,
        email: 'business@oracle-messenger.local',
        name: 'Oracle Messenger',
        username: `oracle_business_${Date.now()}`,
        avatar: '/icons/oracle-system-avatar.svg',
        status: 'online',
      },
      update: {
        name: 'Oracle Messenger',
        avatar: '/icons/oracle-system-avatar.svg',
        status: 'online',
      },
    });
  }

  private async ensureDirectConversation(systemUserId: string, userId: string) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: 'direct',
        participants: {
          every: { userId: { in: [systemUserId, userId] } },
        },
      },
      include: { participants: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing && existing.participants.some(p => p.userId === systemUserId) && existing.participants.some(p => p.userId === userId)) {
      return existing;
    }
    return this.prisma.conversation.create({
      data: {
        type: 'direct',
        participants: {
          create: [
            { userId: systemUserId, role: 'admin' },
            { userId },
          ],
        },
      },
    });
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
