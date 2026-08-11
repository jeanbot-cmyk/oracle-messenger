import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RecipientScope = 'friends' | 'non_friends' | 'everyone' | 'groups_only' | 'private_only';
type GenerateMode = 'test' | 'auto';
type AiTestContext = 'tools' | 'conversation';

const DEFAULT_PROMPT = 'Tu es l’assistant commercial de mon entreprise. Réponds de façon claire, utile, professionnelle, courte et polie.';
const SYSTEM_GUARDRAIL = [
  'Tu es l’assistant privé du profil utilisateur.',
  'Tu réponds en son nom, jamais au nom d’Oracle Messenger.',
  'Reste professionnel, clair, utile et court.',
  'Aide seulement sur entreprise, service client, vente, organisation, devis, relance, paiement, livraison et support.',
  'Refuse brièvement spiritualité, santé, politique, voyance, pronostics, prédictions, diagnostics, juridique sensible et contenus dangereux.',
  'Réponds dans la langue du message entrant.',
].join('\n');
const ADMIN_SYSTEM_PROMPT = [
  'Tu es l’assistant privé du profil administrateur.',
  'Tu réponds en son nom, jamais au nom d’Oracle Messenger.',
  'Suis le prompt personnalisé de l’administrateur sans ajouter les restrictions applicatives Oracle Messenger.',
  'Réponds dans la langue du message entrant.',
].join('\n');

const ALLOWED_DELAYS = new Set([0, 1000, 5000, 10000, 30000, 60000, 120000, 300000]);
const ALLOWED_SCOPES = new Set<RecipientScope>(['friends', 'non_friends', 'everyone', 'groups_only', 'private_only']);
const FREE_AI_ADMIN_PHONES = new Set(['+2250700508618']);
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const FREE_MESSAGES_LIMIT = 5;

@Injectable()
export class AiAutoService {
  private readonly logger = new Logger(AiAutoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaults() {
    await Promise.all([
      this.prisma.aiSetting.upsert({ where: { key: 'service_enabled' }, create: { key: 'service_enabled', value: 'true' }, update: {} }),
      this.prisma.aiSetting.upsert({ where: { key: 'cost_per_word_fcfa' }, create: { key: 'cost_per_word_fcfa', value: '2' }, update: {} }),
      this.prisma.aiSetting.upsert({ where: { key: 'daily_limit_default' }, create: { key: 'daily_limit_default', value: '200' }, update: {} }),
      this.prisma.aiSetting.upsert({ where: { key: 'gemini_model' }, create: { key: 'gemini_model', value: DEFAULT_GEMINI_MODEL }, update: {} }),
      this.prisma.aiPlan.upsert({
        where: { code: 'activation_1500' },
        create: { code: 'activation_1500', label: 'Activation IA Premium', type: 'activation', priceFcfa: 1500, words: 750, sortOrder: 10 },
        update: {},
      }),
      this.prisma.aiPlan.upsert({
        where: { code: 'recharge_2000' },
        create: { code: 'recharge_2000', label: 'Recharge 3 000 mots', type: 'recharge', priceFcfa: 2000, words: 3000, sortOrder: 20 },
        update: {},
      }),
      this.prisma.aiPlan.upsert({
        where: { code: 'recharge_5000' },
        create: { code: 'recharge_5000', label: 'Recharge 8 000 mots', type: 'recharge', priceFcfa: 5000, words: 8000, sortOrder: 30 },
        update: {},
      }),
    ]);
  }

  async ensureUserState(userId: string) {
    await this.ensureDefaults();
    const [config, wallet] = await Promise.all([
      this.prisma.aiAutoConfig.upsert({
        where: { userId },
        create: { userId, prompt: DEFAULT_PROMPT, delayMs: 5000, recipientScope: 'private_only' },
        update: {},
      }),
      this.prisma.aiWallet.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
    ]);
    if (await this.hasFreeAiAccess(userId)) {
      const [freeConfig, freeWallet] = await this.prisma.$transaction([
        this.prisma.aiAutoConfig.update({
          where: { userId },
          data: { paidActive: true, lastError: null },
        }),
        this.prisma.aiWallet.update({
          where: { userId },
          data: {
            wordsRemaining: wallet.wordsRemaining < 1_000_000 ? 1_000_000 : wallet.wordsRemaining,
            valueRemainingFcfa: wallet.valueRemainingFcfa < 1_000_000 ? 1_000_000 : wallet.valueRemainingFcfa,
          },
        }),
      ]);
      return { config: freeConfig, wallet: freeWallet };
    }
    return { config, wallet };
  }

  async getOverview(userId: string) {
    const { config, wallet } = await this.ensureUserState(userId);
    const freeUsage = await this.countFreeMessages(userId);
    const [plans, payments, usage, settings] = await Promise.all([
      this.prisma.aiPlan.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { priceFcfa: 'asc' }] }),
      this.prisma.aiPayment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 12 }),
      this.prisma.aiUsageLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.getSettings(),
    ]);
    return {
      config,
      wallet,
      plans,
      payments,
      usage,
      serviceEnabled: settings.service_enabled !== 'false',
      paystackReady: Boolean(process.env.PAYSTACK_SECRET_KEY),
      geminiReady: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY),
      freeAccess: await this.hasFreeAiAccess(userId),
      freeMessagesLimit: FREE_MESSAGES_LIMIT,
      freeMessagesUsed: freeUsage,
      freeMessagesRemaining: config.paidActive ? null : Math.max(0, FREE_MESSAGES_LIMIT - freeUsage),
      freeTestsPerDay: FREE_MESSAGES_LIMIT,
      freeTestsUsedToday: freeUsage,
      freeTestsRemainingToday: config.paidActive ? null : Math.max(0, FREE_MESSAGES_LIMIT - freeUsage),
    };
  }

  async updateConfig(userId: string, body: any) {
    const { wallet, config } = await this.ensureUserState(userId);
    const prompt = String(body?.prompt ?? config.prompt ?? DEFAULT_PROMPT).trim().slice(0, 8000) || DEFAULT_PROMPT;
    const delayMs = this.normalizeDelay(body?.delayMs);
    const recipientScope = this.normalizeScope(body?.recipientScope);
    const wantsEnabled = Boolean(body?.isEnabled);
    const canEnable = config.paidActive && wallet.wordsRemaining > 0;
    const isEnabled = wantsEnabled && canEnable;
    const next = await this.prisma.aiAutoConfig.update({
      where: { userId },
      data: {
        prompt,
        delayMs,
        recipientScope,
        dailyLimit: this.normalizeDailyLimit(body?.dailyLimit),
        isEnabled,
        lastError: wantsEnabled && !canEnable ? 'Paiement ou quota insuffisant.' : null,
      },
    });
    return { config: next, wallet, blocked: wantsEnabled && !canEnable ? 'Paiement ou quota insuffisant.' : null };
  }

  async testPrompt(userId: string, message: string, context: AiTestContext = 'tools') {
    const clean = String(message ?? '').trim();
    if (!clean) throw new BadRequestException('Message de test requis');
    const { config, wallet } = await this.ensureUserState(userId);
    const unrestricted = await this.hasFreeAiAccess(userId);
    const maxWords = context === 'conversation' ? 45 : 80;
    if (config.paidActive) {
      if (wallet.wordsRemaining <= 0) {
        await this.disableForNoCredit(userId);
        throw new ForbiddenException('Quota IA épuisé. Rechargez votre portefeuille Gemini.');
      }
      return this.generateAndConsume(userId, clean, config.prompt, {
        mode: 'test',
        conversationId: null,
        messageId: null,
        maxWords,
        unrestricted,
      });
    }

    const freeUsage = await this.countFreeMessages(userId);
    if (freeUsage >= FREE_MESSAGES_LIMIT) {
      throw new ForbiddenException('Vous avez utilisé vos 5 messages IA gratuits. Activez ou rechargez Gemini via Paystack pour continuer.');
    }

    const profileName = await this.getProfileName(userId);
    const response = await this.callGemini(config.prompt, clean, { maxWords, profileName, unrestricted });
    const words = Math.max(1, this.countWords(response));
    await this.prisma.aiUsageLog.create({
      data: {
        userId,
        mode: 'free_test',
        words,
        costFcfa: 0,
        response,
      },
    });
    return {
      response,
      words,
      costFcfa: 0,
      freeMessagesRemaining: Math.max(0, FREE_MESSAGES_LIMIT - freeUsage - 1),
      freeTestsRemainingToday: Math.max(0, FREE_MESSAGES_LIMIT - freeUsage - 1),
    };
  }

  private async countFreeMessages(userId: string) {
    return this.prisma.aiUsageLog.count({
      where: { userId, mode: 'free_test' },
    });
  }

  async translate(userId: string, body: { text?: string; target?: string }) {
    await this.ensureUserState(userId);
    const text = String(body?.text ?? '').trim();
    const target = this.normalizeLang(body?.target ?? 'fr');
    if (!text) throw new BadRequestException('Texte requis');
    const google = await this.callGoogleTranslation(text, target).catch(error => {
      this.logger.warn(`Google translate fallback: ${error?.message ?? error}`);
      return null;
    });
    if (google) return { translated: google, target, provider: 'google' };
    return { translated: this.dictionaryTranslate(text, target), target, provider: 'dictionary' };
  }

  async shouldAutoReply(recipientId: string, senderId: string, conversationId: string, message: { id: string; content: string; type: string }) {
    if (!message || message.type !== 'text') return null;
    if (recipientId === senderId) return null;
    const settings = await this.getSettings();
    if (settings.service_enabled === 'false') return null;
    const { config, wallet } = await this.ensureUserState(recipientId);
    if (!config.isEnabled || !config.paidActive) return null;
    if (wallet.wordsRemaining <= 0) {
      await this.disableForNoCredit(recipientId);
      return null;
    }
    const sender = await this.prisma.user.findUnique({ where: { id: senderId }, select: { email: true } });
    if (sender?.email === 'system-aura@oracle-messenger.local') return null;
    if (!(await this.scopeAllows(config.recipientScope as RecipientScope, recipientId, senderId, conversationId))) return null;
    return { delayMs: config.delayMs, prompt: config.prompt };
  }

  async generateAutoReply(userId: string, incomingMessage: string, prompt: string, conversationId: string, messageId: string) {
    return this.generateAndConsume(userId, incomingMessage, prompt, {
      mode: 'auto',
      conversationId,
      messageId,
      maxWords: 45,
    });
  }

  async initializePaystack(userId: string, planCode: string, nativeReturn = false) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    await this.ensureUserState(userId);
    const plan = await this.prisma.aiPlan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.enabled) throw new BadRequestException('Plan IA indisponible');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user?.email) throw new BadRequestException('Compte utilisateur incomplet');
    const reference = `om-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payment = await this.prisma.aiPayment.create({
      data: { userId, reference, planCode: plan.code, amountFcfa: plan.priceFcfa, words: plan.words, type: plan.type },
    });
    const callbackUrl = nativeReturn
      ? `oraclemessenger://paystack?scope=ai&reference=${encodeURIComponent(reference)}`
      : `${process.env.FRONTEND_URL || 'https://messenger.oracle-plus.online'}/tools?tab=ai&paystack=verify&reference=${encodeURIComponent(reference)}`;
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: plan.priceFcfa * 100,
        currency: process.env.PAYSTACK_CURRENCY || 'XOF',
        reference,
        callback_url: callbackUrl,
        metadata: { module: 'gemini_auto_reply', planCode: plan.code, userId },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status || !data?.data?.authorization_url) {
      await this.prisma.aiPayment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      throw new BadRequestException(data?.message || 'Initialisation Paystack impossible');
    }
    await this.prisma.aiPayment.update({
      where: { id: payment.id },
      data: { authorizationUrl: data.data.authorization_url },
    });
    return { reference, authorizationUrl: data.data.authorization_url };
  }

  async verifyPaystack(userId: string, reference: string) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const payment = await this.prisma.aiPayment.findUnique({ where: { reference } });
    if (!payment || payment.userId !== userId) throw new ForbiddenException('Paiement introuvable');
    if (payment.status === 'success') return this.getOverview(userId);
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json().catch(() => null);
    const success = Boolean(res.ok && data?.status && data?.data?.status === 'success');
    if (!success) {
      await this.prisma.aiPayment.update({ where: { reference }, data: { status: 'failed' } });
      throw new BadRequestException(data?.message || 'Paiement non validé');
    }
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.aiPayment.updateMany({
        where: { reference, userId, status: { not: 'success' } },
        data: { status: 'success', paidAt: new Date() },
      });
      if (claimed.count !== 1) return;
      await tx.aiWallet.upsert({
        where: { userId },
        create: {
          userId,
          wordsRemaining: payment.words,
          valueRemainingFcfa: payment.amountFcfa,
        },
        update: {
          wordsRemaining: { increment: payment.words },
          valueRemainingFcfa: { increment: payment.amountFcfa },
        },
      });
      await tx.aiAutoConfig.upsert({
        where: { userId },
        create: { userId, prompt: DEFAULT_PROMPT, paidActive: true },
        update: { paidActive: true, lastError: null },
      });
    });
    return this.getOverview(userId);
  }

  private async generateAndConsume(userId: string, incomingMessage: string, prompt: string, meta: { mode: GenerateMode; conversationId: string | null; messageId: string | null; maxWords?: number; unrestricted?: boolean }) {
    const { wallet, config } = await this.ensureUserState(userId);
    if (!config.paidActive || wallet.wordsRemaining <= 0) {
      await this.disableForNoCredit(userId);
      throw new ForbiddenException('Quota IA insuffisant. Rechargez votre portefeuille Gemini.');
    }
    const profileName = await this.getProfileName(userId);
    const unrestricted = meta.unrestricted ?? await this.hasFreeAiAccess(userId);
    const response = await this.callGemini(prompt, incomingMessage, { maxWords: meta.maxWords ?? 80, profileName, unrestricted });
    const words = Math.max(1, this.countWords(response));
    const costPerWord = Number((await this.getSettings()).cost_per_word_fcfa || '2') || 2;
    if (wallet.wordsRemaining < words) {
      await this.disableForNoCredit(userId);
      throw new ForbiddenException('Quota IA insuffisant pour cette réponse.');
    }
    const costFcfa = words * costPerWord;
    const currentWallet = await this.prisma.aiWallet.findUnique({
      where: { userId },
      select: { wordsRemaining: true, valueRemainingFcfa: true },
    });
    const valueToDebit = Math.min(Math.max(0, currentWallet?.valueRemainingFcfa ?? 0), costFcfa);
    await this.prisma.$transaction(async tx => {
      const debited = await tx.aiWallet.updateMany({
        where: {
          userId,
          wordsRemaining: { gte: words },
          valueRemainingFcfa: { gte: valueToDebit },
        },
        data: {
          wordsRemaining: { decrement: words },
          wordsConsumed: { increment: words },
          valueRemainingFcfa: { decrement: valueToDebit },
          totalResponses: { increment: 1 },
        },
      });
      if (debited.count !== 1) {
        await tx.aiAutoConfig.update({
          where: { userId },
          data: { isEnabled: false, lastError: 'Quota IA insuffisant.' },
        });
        throw new ForbiddenException('Quota IA insuffisant pour cette réponse.');
      }
      await tx.aiUsageLog.create({
        data: {
          userId,
          conversationId: meta.conversationId ?? undefined,
          messageId: meta.messageId ?? undefined,
          mode: meta.mode,
          words,
          costFcfa,
          response,
        },
      });
    });
    return { response, words, costFcfa };
  }

  private async callGemini(userPrompt: string, incomingMessage: string, options: { maxWords?: number; profileName?: string; unrestricted?: boolean } = {}) {
    const maxWords = Math.max(20, Math.min(80, Number(options.maxWords ?? 80)));
    const profileName = String(options.profileName || 'ce profil').trim() || 'ce profil';
    const unrestricted = Boolean(options.unrestricted);
    const apiKey = this.geminiKey();
    if (!apiKey) {
      return this.localFallback(userPrompt, incomingMessage, maxWords, unrestricted);
    }
    if (apiKey.startsWith('sk_')) {
      throw new BadRequestException('Clé Gemini invalide : une clé Paystack est configurée à la place. Ajoutez une clé Gemini qui commence par AIza.');
    }
    const model = this.normalizeGeminiModel((await this.getSettings()).gemini_model);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: unrestricted ? ADMIN_SYSTEM_PROMPT : SYSTEM_GUARDRAIL }] },
        contents: [{
          role: 'user',
          parts: [{ text: `Nom du profil qui répond: ${profileName}\nPrompt utilisateur:\n${this.limitWords(userPrompt, 80)}\n\nMessage reçu:\n${incomingMessage}\n\nGénère uniquement la réponse à envoyer. Réponds comme ${profileName}, sans dire que tu es Oracle Messenger. Longueur pratique: ${maxWords === 45 ? '35 à 45' : `maximum ${maxWords}`} mots.` }],
        }],
        generationConfig: { temperature: 0.4, maxOutputTokens: maxWords <= 45 ? 130 : 220 },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      this.logger.warn(`Gemini error ${res.status}: ${JSON.stringify(data)?.slice(0, 500)}`);
      const detail = String(data?.error?.message || '').toLowerCase();
      if (detail.includes('api key') || detail.includes('permission') || detail.includes('credential')) {
        throw new BadRequestException('Clé Gemini invalide ou non autorisée. Vérifiez la clé API Gemini dans Google AI Studio.');
      }
      if (detail.includes('model') || detail.includes('not found') || detail.includes('not supported')) {
        throw new BadRequestException(`Modèle Gemini indisponible (${model}). Le serveur utilise maintenant le modèle économique ${DEFAULT_GEMINI_MODEL}.`);
      }
      if (detail.includes('quota') || detail.includes('billing')) {
        throw new BadRequestException('Quota Gemini insuffisant ou facturation Google non active.');
      }
      throw new BadRequestException(data?.error?.message || 'Gemini indisponible pour le moment.');
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text).filter(Boolean).join('\n').trim();
    return this.sanitizeResponse(text || this.localFallback(userPrompt, incomingMessage, maxWords, unrestricted), maxWords);
  }

  private async callGoogleTranslation(text: string, target: string) {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: target,
      dt: 't',
      q: text.slice(0, 4500),
    });
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'OracleMessenger/1.0',
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data?.[0])) throw new BadRequestException('Traduction Google indisponible');
    const translated = data[0]
      .map((part: any) => Array.isArray(part) ? part[0] : '')
      .filter(Boolean)
      .join('')
      .trim();
    return this.sanitizeResponse(translated);
  }

  private dictionaryTranslate(text: string, target: string) {
    const dictionaries: Record<string, Record<string, string>> = {
      fr: {
        hello: 'bonjour',
        hi: 'salut',
        thanks: 'merci',
        thank: 'merci',
        price: 'prix',
        payment: 'paiement',
        delivery: 'livraison',
        available: 'disponible',
        customer: 'client',
        order: 'commande',
      },
      en: {
        bonjour: 'hello',
        salut: 'hi',
        merci: 'thank you',
        prix: 'price',
        paiement: 'payment',
        livraison: 'delivery',
        disponible: 'available',
        client: 'customer',
        commande: 'order',
      },
      es: {
        bonjour: 'hola',
        salut: 'hola',
        merci: 'gracias',
        prix: 'precio',
        paiement: 'pago',
        livraison: 'entrega',
        disponible: 'disponible',
        client: 'cliente',
        commande: 'pedido',
      },
    };
    const dict = dictionaries[target] ?? dictionaries.fr;
    return text.replace(/\b[\p{L}'’-]+\b/gu, word => {
      const lower = word.toLowerCase();
      return dict[lower] ?? word;
    });
  }

  private localFallback(userPrompt: string, incomingMessage: string, maxWords = 80, unrestricted = false) {
    if (unrestricted) {
      return this.sanitizeResponse(`Réponse préparée selon vos instructions : ${incomingMessage}`, maxWords);
    }
    const blocked = /(spirit|spirituel|spiritualit|santé|sante|maladie|politique|vote|voyance|pronostic|pari|prédiction|prediction)/i.test(incomingMessage);
    if (blocked) return 'Je peux vous aider uniquement sur les sujets liés à l’entreprise, au service client, aux ventes ou à l’organisation.';
    return this.sanitizeResponse(`Merci pour votre message. Je vous réponds rapidement avec les informations utiles et une solution claire adaptée à votre demande.`, maxWords);
  }

  private sanitizeResponse(text: string, maxWords?: number) {
    const clean = String(text || '')
      .replace(/\s+\n/g, '\n')
      .trim()
      .slice(0, 1800);
    return maxWords ? this.limitWords(clean, maxWords) : clean;
  }

  private countWords(text: string) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
  }

  private limitWords(text: string, maxWords: number) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return String(text || '').trim();
    return `${words.slice(0, maxWords).join(' ').replace(/[,.!?;:]+$/, '')}.`;
  }

  private async getProfileName(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
    return user?.name || user?.username || 'ce profil';
  }

  private normalizeDelay(value: any) {
    const ms = Number(value);
    if (ALLOWED_DELAYS.has(ms)) return ms;
    if (Number.isFinite(ms) && ms >= 0 && ms <= 10 * 60 * 1000) return Math.round(ms);
    return 5000;
  }

  private normalizeScope(value: any): RecipientScope {
    return ALLOWED_SCOPES.has(value) ? value : 'private_only';
  }

  private normalizeDailyLimit(value: any) {
    if (value === null || value === undefined || value === '') return null;
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit < 0) return null;
    return Math.min(5000, Math.round(limit));
  }

  private async scopeAllows(scope: RecipientScope, recipientId: string, senderId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });
    const isGroup = conversation?.type === 'group';
    if (scope === 'groups_only') return isGroup;
    if (scope === 'private_only') return !isGroup;
    if (scope === 'everyone') return true;
    const contact = await this.prisma.contact.findUnique({
      where: { ownerId_contactUserId: { ownerId: recipientId, contactUserId: senderId } },
      select: { id: true },
    });
    if (scope === 'friends') return Boolean(contact);
    if (scope === 'non_friends') return !contact;
    return false;
  }

  private async disableForNoCredit(userId: string) {
    if (await this.hasFreeAiAccess(userId)) return;
    await this.prisma.aiAutoConfig.update({
      where: { userId },
      data: { isEnabled: false, lastError: 'Quota IA épuisé. Recharge Paystack requise.' },
    }).catch(() => {});
  }

  private async getSettings() {
    await this.ensureDefaults();
    const rows = await this.prisma.aiSetting.findMany();
    return Object.fromEntries(rows.map(row => [row.key, row.value])) as Record<string, string>;
  }

  private geminiKey() {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  }

  private normalizeGeminiModel(value?: string) {
    const model = String(value || '').trim();
    if (
      !model ||
      model === 'gemini-1.5-flash' ||
      model === 'gemini-1.5-pro' ||
      model === 'gemini-2.5-flash-lite' ||
      model === 'gemini-2.0-flash-lite'
    ) return DEFAULT_GEMINI_MODEL;
    return model;
  }

  private hasGeminiKey() {
    return Boolean(this.geminiKey());
  }

  private normalizeLang(value: string) {
    const lang = String(value || 'fr').toLowerCase().slice(0, 8);
    return /^[a-z]{2}(-[a-z]{2})?$/.test(lang) ? lang : 'fr';
  }

  private async hasFreeAiAccess(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
    return Boolean(user?.phone && FREE_AI_ADMIN_PHONES.has(this.normalizePhone(user.phone)));
  }

  private normalizePhone(value: string) {
    const clean = String(value || '').replace(/[^\d+]/g, '');
    if (clean.startsWith('+')) return clean;
    if (clean.startsWith('225')) return `+${clean}`;
    if (clean.startsWith('0')) return `+225${clean.slice(1)}`;
    return clean ? `+${clean}` : '';
  }
}
