import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

const ADMIN_PHONE = '+2250700508618';
const PREMIUM_PRICE_FCFA = 2500;
const FREE_DURATION_SECONDS = 10;
const PREMIUM_DURATION_SECONDS = 45;
const GEMINI_MIN_DURATION_SECONDS = 4;
const GEMINI_MAX_DURATION_SECONDS = 8;
const MAX_VIDEO_SEGMENTS = 6;
const GEMINI_SEGMENT_START_DELAY_MS = 12000;
const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_REFERENCE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_VIDEO_MODEL = 'veo-3.1-lite-generate-preview';
const MAX_PROMPT_WORDS = 1000;

type ReferenceImage = {
  mime: string;
  data: string;
  name?: string;
};

type GeminiVideoOutput = {
  base64: string;
  mime: string;
};

@Injectable()
export class AiVideoService {
  private readonly logger = new Logger(AiVideoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string) {
    const user = await this.getUser(userId);
    const { start, next } = this.monthWindow();
    const usedFree = await this.prisma.aiVideoGeneration.count({
      where: { userId, mode: 'free', createdAt: { gte: start, lt: next } },
    });
    const payments = await this.prisma.aiVideoPayment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 });
    const generations = await this.prisma.aiVideoGeneration.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
    const isAdmin = this.isAdmin(user.phone);

    return {
      isAdmin,
      free: {
        available: isAdmin || usedFree === 0,
        nextFreeAt: usedFree === 0 ? null : next.toISOString(),
        monthlyLimit: 1,
        durationSeconds: FREE_DURATION_SECONDS,
      },
      premium: {
        priceFcfa: PREMIUM_PRICE_FCFA,
        durationSeconds: PREMIUM_DURATION_SECONDS,
      },
      payments,
      generations,
      paystackReady: Boolean(process.env.PAYSTACK_SECRET_KEY),
      geminiReady: Boolean(this.geminiKey()),
      model: process.env.GEMINI_VIDEO_MODEL || DEFAULT_VIDEO_MODEL,
      zeroServerStorage: true,
    };
  }

  async initializePaystack(userId: string, nativeReturn = false) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const user = await this.getUser(userId);
    if (!user.email) throw new BadRequestException('Compte utilisateur incomplet.');
    const reference = `om-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payment = await this.prisma.aiVideoPayment.create({
      data: { userId, reference, amountFcfa: PREMIUM_PRICE_FCFA, durationSeconds: PREMIUM_DURATION_SECONDS },
    });
    const callbackUrl = nativeReturn
      ? `oraclemessenger://paystack?scope=video&reference=${encodeURIComponent(reference)}`
      : `${process.env.FRONTEND_URL || 'https://messenger.oracle-plus.online'}/tools?tab=video&videoPaystack=verify&reference=${encodeURIComponent(reference)}`;
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: PREMIUM_PRICE_FCFA * 100,
        currency: process.env.PAYSTACK_CURRENCY || 'XOF',
        reference,
        callback_url: callbackUrl,
        metadata: { module: 'ai_video', durationSeconds: PREMIUM_DURATION_SECONDS, userId },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status || !data?.data?.authorization_url) {
      await this.prisma.aiVideoPayment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      throw new BadRequestException(data?.message || 'Initialisation Paystack impossible.');
    }
    await this.prisma.aiVideoPayment.update({
      where: { id: payment.id },
      data: { authorizationUrl: data.data.authorization_url },
    });
    return { reference, authorizationUrl: data.data.authorization_url };
  }

  async verifyPaystack(userId: string, reference: string) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const payment = await this.prisma.aiVideoPayment.findUnique({ where: { reference } });
    if (!payment || payment.userId !== userId) throw new ForbiddenException('Paiement introuvable.');
    if (payment.status === 'success') return this.getOverview(userId);
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json().catch(() => null);
    const success = Boolean(res.ok && data?.status && data?.data?.status === 'success');
    if (!success) {
      await this.prisma.aiVideoPayment.update({ where: { reference }, data: { status: 'failed' } });
      throw new BadRequestException(data?.message || 'Paiement non validé.');
    }
    await this.prisma.aiVideoPayment.updateMany({
      where: { reference, userId, status: { not: 'success' } },
      data: { status: 'success', paidAt: new Date() },
    });
    return this.getOverview(userId);
  }

  async generate(userId: string, body: any) {
    const user = await this.getUser(userId);
    const prompt = this.normalizePrompt(body?.prompt ?? '');
    const durationSeconds = Number(body?.durationSeconds) === PREMIUM_DURATION_SECONDS ? PREMIUM_DURATION_SECONDS : FREE_DURATION_SECONDS;
    const requestedAspectRatio = this.normalizeChoice(body?.aspectRatio, ['16:9', '9:16', '1:1'], '9:16');
    const aspectRatio = this.toGeminiVideoAspectRatio(requestedAspectRatio);
    const quality = this.normalizeChoice(body?.quality, ['hd', 'full_hd', 'ultra'], 'hd');
    const referenceImages = this.normalizeReferenceImages(body?.referenceImages ?? []);
    const isAdmin = this.isAdmin(user.phone);
    let mode: 'free' | 'premium' | 'admin' = isAdmin ? 'admin' : durationSeconds === FREE_DURATION_SECONDS ? 'free' : 'premium';
    let paymentId: string | null = null;

    if (!isAdmin && durationSeconds === FREE_DURATION_SECONDS) {
      const { start, next } = this.monthWindow();
      const usedFree = await this.prisma.aiVideoGeneration.count({
        where: { userId, mode: 'free', createdAt: { gte: start, lt: next } },
      });
      if (usedFree > 0) {
        throw new ForbiddenException(`Votre essai gratuit IA Vidéo du mois est déjà utilisé. Prochain essai : ${next.toISOString()}`);
      }
    }

    if (!isAdmin && durationSeconds === PREMIUM_DURATION_SECONDS) {
      const reference = String(body?.paymentReference || '').trim();
      if (!reference) throw new ForbiddenException('Paiement Premium 2 500 FCFA requis avant la génération vidéo.');
      const payment = await this.prisma.aiVideoPayment.findUnique({ where: { reference } });
      if (!payment || payment.userId !== userId || payment.status !== 'success' || payment.consumedAt) {
        throw new ForbiddenException('Paiement vidéo invalide, non confirmé ou déjà utilisé.');
      }
      paymentId = payment.id;
      const reserved = await this.prisma.aiVideoPayment.updateMany({
        where: { id: payment.id, userId, status: 'success', consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (reserved.count !== 1) {
        throw new ForbiddenException('Paiement vidéo déjà utilisé par une autre génération.');
      }
      mode = 'premium';
    }

    let video: Awaited<ReturnType<AiVideoService['generateAssembledVideo']>>;
    try {
      video = await this.generateAssembledVideo({
        prompt,
        durationSeconds,
        aspectRatio,
        quality,
        voiceOver: Boolean(body?.voiceOver),
        music: Boolean(body?.music),
        soundEffects: Boolean(body?.soundEffects),
        referenceImages,
        unrestricted: isAdmin,
      });
    } catch (error) {
      if (paymentId) {
        await this.prisma.aiVideoPayment.update({
          where: { id: paymentId },
          data: { consumedAt: null },
        });
      }
      throw error;
    }
    const videoBytes = Math.ceil((video.base64.length * 3) / 4);
    const videoHash = createHash('sha256').update(video.base64).digest('hex');
    const title = this.makeTitle(prompt);

    try {
      await this.prisma.aiVideoGeneration.create({
        data: {
          userId,
          prompt,
          mode,
          mime: video.mime,
          videoBytes,
          videoHash,
          durationSeconds,
          aspectRatio,
          quality,
          referenceCount: referenceImages.length,
          title,
        },
      });
    } catch (error) {
      if (paymentId) {
        await this.prisma.aiVideoPayment.update({
          where: { id: paymentId },
          data: { consumedAt: null },
        });
      }
      throw error;
    }

    return {
      videoUrl: `data:${video.mime};base64,${video.base64}`,
      mime: video.mime,
      title,
      mode,
      durationSeconds,
      aspectRatio,
      quality,
      referenceCount: referenceImages.length,
      segmentCount: video.segmentCount,
      engineDurationSeconds: video.engineDurationSeconds,
      overview: await this.getOverview(userId),
    };
  }

  private async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, phone: true } });
    if (!user) throw new ForbiddenException('Utilisateur introuvable.');
    return user;
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

  private monthWindow(date = new Date()) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    return { start, next };
  }

  private normalizePrompt(value: string) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 4) throw new BadRequestException('Décrivez votre vidéo avec au moins quelques mots.');
    if (words.length > MAX_PROMPT_WORDS) throw new BadRequestException(`La description ne doit pas dépasser ${MAX_PROMPT_WORDS} mots.`);
    return words.join(' ');
  }

  private normalizeChoice<T extends string>(value: any, allowed: T[], fallback: T): T {
    return allowed.includes(value) ? value : fallback;
  }

  private toGeminiVideoAspectRatio(value: '16:9' | '9:16' | '1:1'): '16:9' | '9:16' {
    return value === '16:9' ? '16:9' : '9:16';
  }

  private normalizeReferenceImages(input: any[]) {
    const images = Array.isArray(input) ? input.slice(0, MAX_REFERENCE_IMAGES) : [];
    return images.map((item, index): ReferenceImage => {
      const rawMime = String(item?.mime || '').toLowerCase().trim();
      const dataUrl = String(item?.dataUrl || item?.src || '').trim();
      const data = String(item?.data || '').trim();
      const parsed = this.parseImageData(rawMime, dataUrl, data);
      if (!ALLOWED_REFERENCE_MIMES.has(parsed.mime)) {
        throw new BadRequestException(`Image de référence ${index + 1} invalide. Formats acceptés : JPG, PNG, WEBP.`);
      }
      const bytes = Math.ceil((parsed.data.length * 3) / 4);
      if (bytes > MAX_REFERENCE_IMAGE_BYTES) {
        throw new BadRequestException(`Image de référence ${index + 1} trop lourde. Limite : 4 Mo.`);
      }
      return {
        mime: parsed.mime,
        data: parsed.data,
        name: String(item?.name || '').trim().slice(0, 120) || undefined,
      };
    });
  }

  private parseImageData(rawMime: string, dataUrl: string, data: string) {
    if (dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
      if (!match) throw new BadRequestException('Image de référence invalide.');
      return { mime: match[1].toLowerCase(), data: match[2].replace(/\s/g, '') };
    }
    const clean = data.replace(/\s/g, '');
    if (!clean) throw new BadRequestException('Image de référence vide.');
    return { mime: rawMime || 'image/jpeg', data: clean };
  }

  private async callGeminiVideo(input: {
    prompt: string;
    durationSeconds: number;
    aspectRatio: string;
    quality: string;
    voiceOver: boolean;
    music: boolean;
    soundEffects: boolean;
    referenceImages: ReferenceImage[];
    segmentIndex?: number;
    segmentCount?: number;
    requestedDurationSeconds?: number;
    unrestricted?: boolean;
  }): Promise<GeminiVideoOutput> {
    const apiKey = this.geminiKey();
    if (!apiKey) throw new BadRequestException('Clé Gemini Vidéo absente sur le serveur.');
    if (apiKey.startsWith('sk_')) throw new BadRequestException('Clé Gemini invalide : une clé Paystack est configurée à la place.');
    const model = process.env.GEMINI_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
    const geminiDurationSeconds = Math.min(
      GEMINI_MAX_DURATION_SECONDS,
      Math.max(GEMINI_MIN_DURATION_SECONDS, Number(input.durationSeconds) || GEMINI_MAX_DURATION_SECONDS),
    );
    const promptParts = [
      input.prompt,
      input.segmentCount && input.segmentCount > 1
        ? `Fragment ${input.segmentIndex} sur ${input.segmentCount}. Cette séquence doit être autonome mais cohérente avec les autres fragments.`
        : 'Séquence vidéo unique.',
      `Durée finale demandée par l'utilisateur : ${input.requestedDurationSeconds ?? input.durationSeconds} secondes.`,
      `Crée uniquement ce fragment de ${geminiDurationSeconds} secondes maximum, compatible avec la limite actuelle du moteur vidéo.`,
      `Format ${input.aspectRatio}. Qualité demandée : ${input.quality}.`,
      input.voiceOver ? 'Ajoute une voix off naturelle synchronisée.' : 'Sans voix off.',
      input.music ? 'Ajoute une musique adaptée, moins forte que la voix.' : 'Sans musique de fond.',
      input.soundEffects ? 'Ajoute des effets sonores utiles uniquement.' : 'Sans effets sonores.',
      input.unrestricted ? '' : "N'utilise aucun nom, visage, voix, signature ou ressemblance d'une personne réelle. Utilise un présentateur professionnel fictif.",
      'Rendu professionnel, fluide, couleurs équilibrées, transitions propres.',
    ].filter(Boolean);
    const prompt = promptParts.join('\n');
    const firstImage = input.referenceImages[0];
    const instance: Record<string, any> = { prompt };
    if (firstImage) instance.image = { bytesBase64Encoded: firstImage.data, mimeType: firstImage.mime };

    const startRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predictLongRunning?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio: input.aspectRatio,
          durationSeconds: geminiDurationSeconds,
        },
      }),
    });
    const startData = await startRes.json().catch(() => null);
    if (!startRes.ok || startData?.error) {
      this.logger.warn(`Gemini Video start error ${startRes.status}: ${JSON.stringify(startData)?.slice(0, 600)}`);
      const message = String(startData?.error?.message || '');
      if (/durationSeconds|between 4 and 8|out of bound/i.test(message)) {
        throw new BadRequestException('La génération vidéo actuelle accepte 8 secondes maximum par séquence. La durée a été ajustée automatiquement, réessayez.');
      }
      if (/quota|rate-limits|resource_exhausted|resource exhausted|429/i.test(message) || startRes.status === 429) {
        throw new BadRequestException('Le quota Gemini Vidéo est temporairement atteint. Réessayez dans quelques minutes. Les fragments sont maintenant lancés un par un pour éviter cette erreur.');
      }
      if (/aspectRatio|aspect ratio/i.test(message)) {
        throw new BadRequestException('Ce format vidéo n’est pas supporté par Gemini Vidéo. Le format a été corrigé automatiquement, réessayez.');
      }
      if (/personGeneration|allow_adult|currently not supported|unsupported/i.test(message)) {
        throw new BadRequestException('Un paramètre vidéo n’est pas supporté par le modèle actuel. Il a été retiré, réessayez la génération.');
      }
      throw new BadRequestException(message || 'Gemini Vidéo indisponible pour le moment.');
    }
    const operationName = startData?.name;
    if (!operationName) throw new BadRequestException('Gemini Vidéo n’a pas retourné d’opération.');

    let operation: any = null;
    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${encodeURIComponent(apiKey)}`);
      operation = await pollRes.json().catch(() => null);
      if (!pollRes.ok || operation?.error) {
        throw new BadRequestException(operation?.error?.message || 'Suivi Gemini Vidéo impossible.');
      }
      if (operation?.done) break;
    }
    if (!operation?.done) throw new BadRequestException('Génération vidéo trop longue. Réessayez dans quelques minutes.');

    const video =
      operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video ||
      operation.response?.generatedVideos?.[0]?.video;
    const inline = video?.bytesBase64Encoded;
    const uri = video?.uri;
    const mime = String(video?.mimeType || 'video/mp4');
    if (inline) return { base64: inline, mime };
    if (!uri) {
      const responseKeys = operation.response ? Object.keys(operation.response) : [];
      const generateVideoResponse = operation.response?.generateVideoResponse;
      this.logger.warn(`Gemini Video completed without MP4. responseKeys=${responseKeys.join(',') || 'none'} details=${JSON.stringify({
        done: operation.done,
        hasResponse: Boolean(operation.response),
        generateVideoResponseKeys: generateVideoResponse ? Object.keys(generateVideoResponse) : [],
        filteredCount: generateVideoResponse?.raiMediaFilteredCount,
        filteredReasons: generateVideoResponse?.raiMediaFilteredReasons,
      }).slice(0, 800)}`);
      const filteredReasons = Array.isArray(generateVideoResponse?.raiMediaFilteredReasons)
        ? generateVideoResponse.raiMediaFilteredReasons.join(' ')
        : '';
      if (/real people|real person|people's names|likeness|celebrity/i.test(filteredReasons)) {
        throw new BadRequestException("Gemini refuse les vidéos avec le nom ou la ressemblance d'une personne réelle. Remplacez le nom par 'un présentateur professionnel' ou 'un conseiller', puis réessayez.");
      }
      throw new BadRequestException('Gemini a terminé la génération sans fournir de fichier vidéo. Le prompt est peut-être trop long, trop contraignant ou filtré. Simplifiez la demande puis réessayez.');
    }
    const downloadUrl = uri.includes('?') ? `${uri}&key=${encodeURIComponent(apiKey)}` : `${uri}?key=${encodeURIComponent(apiKey)}`;
    const videoRes = await fetch(downloadUrl);
    if (!videoRes.ok) throw new BadRequestException(`Téléchargement Gemini Vidéo impossible (${videoRes.status}).`);
    const buffer = Buffer.from(await videoRes.arrayBuffer());
    return { base64: buffer.toString('base64'), mime };
  }

  private async generateAssembledVideo(input: {
    prompt: string;
    durationSeconds: number;
    aspectRatio: string;
    quality: string;
    voiceOver: boolean;
    music: boolean;
    soundEffects: boolean;
    referenceImages: ReferenceImage[];
    unrestricted?: boolean;
  }): Promise<GeminiVideoOutput & { segmentCount: number; engineDurationSeconds: number }> {
    const compatiblePrompt = this.makeGeminiCompatiblePrompt(input.prompt, input.durationSeconds, Boolean(input.unrestricted));
    const segmentDurations = this.segmentDurations(input.durationSeconds);
    const segmentCount = segmentDurations.length;

    if (segmentCount === 1) {
      const video = await this.callGeminiVideo({
        ...input,
        prompt: this.segmentPrompt(compatiblePrompt, 1, 1),
        durationSeconds: segmentDurations[0],
        requestedDurationSeconds: input.durationSeconds,
        segmentIndex: 1,
        segmentCount: 1,
      });
      return {
        ...video,
        segmentCount,
        engineDurationSeconds: segmentDurations[0],
      };
    }

    const segments: GeminiVideoOutput[] = [];
    for (let index = 0; index < segmentDurations.length; index += 1) {
      if (index > 0) await new Promise(resolve => setTimeout(resolve, GEMINI_SEGMENT_START_DELAY_MS));
      const duration = segmentDurations[index];
      const segment = await this.callGeminiVideo({
        ...input,
        prompt: this.segmentPrompt(compatiblePrompt, index + 1, segmentCount),
        durationSeconds: duration,
        requestedDurationSeconds: input.durationSeconds,
        segmentIndex: index + 1,
        segmentCount,
      });
      segments.push(segment);
    }

    const assembled = await this.concatVideos(segments, input.durationSeconds);
    return {
      ...assembled,
      segmentCount,
      engineDurationSeconds: segmentDurations.reduce((sum, duration) => sum + duration, 0),
    };
  }

  private segmentDurations(targetSeconds: number) {
    const durations: number[] = [];
    let remaining = Math.max(GEMINI_MIN_DURATION_SECONDS, Math.min(PREMIUM_DURATION_SECONDS, Math.round(targetSeconds)));
    while (remaining > 0 && durations.length < MAX_VIDEO_SEGMENTS) {
      if (remaining <= GEMINI_MIN_DURATION_SECONDS) {
        durations.push(GEMINI_MIN_DURATION_SECONDS);
        break;
      }
      if (remaining <= 6) {
        durations.push(6);
        break;
      }
      if (remaining <= GEMINI_MAX_DURATION_SECONDS) {
        durations.push(GEMINI_MAX_DURATION_SECONDS);
        break;
      }
      durations.push(GEMINI_MAX_DURATION_SECONDS);
      remaining -= GEMINI_MAX_DURATION_SECONDS;
    }
    return durations;
  }

  private makeGeminiCompatiblePrompt(prompt: string, durationSeconds: number, unrestricted = false) {
    let clean = prompt
      .replace(/\b(4K|8K|HDR|60\s*FPS|120\s*FPS|ultra\s*HD|très\s*haute\s*définition)\b/gi, 'qualité HD propre')
      .replace(/\b(30|45|60)\s*secondes?\b/gi, `${durationSeconds} secondes`);

    if (!unrestricted) {
      clean = clean
        .replace(/\b(Le|La)\s+Proph[eè]te\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+/giu, 'un présentateur professionnel fictif')
        .replace(/\bProph[eè]te\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+/giu, 'un présentateur professionnel fictif')
        .replace(/\b(Pasteur|Imam|Docteur|Dr\.?|Coach|Ma[iî]tre|Madame|Monsieur)\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+/giu, 'un conseiller professionnel fictif')
        .replace(/Je suis\s+[^,.!?]+/giu, 'Je suis un conseiller professionnel')
        .replace(/voix\s+de\s+[^,.!?]+/giu, 'voix naturelle professionnelle')
        .replace(/ressemble\s+à\s+[^,.!?]+/giu, 'a une apparence professionnelle fictive');
    }

    clean = unrestricted
      ? [
          'PROMPT ADMIN COMPATIBLE POUR GEMINI VIDEO.',
          'Adapter uniquement aux contraintes techniques du moteur vidéo et aux fragments courts.',
          'Ne pas ajouter les restrictions applicatives Oracle Messenger au prompt administrateur.',
          clean,
        ].join('\n')
      : [
          'PROMPT COMPATIBLE POUR GEMINI VIDEO.',
          'Créer une vidéo publicitaire professionnelle en plusieurs fragments courts.',
          'Ne pas représenter de personne réelle, de célébrité, de personnalité publique, ni utiliser un nom réel dans le visuel.',
          'Utiliser uniquement un présentateur professionnel fictif.',
          'Si un nom de marque ou de personne existe dans la demande, le traiter comme texte marketing abstrait ou le remplacer par une formule générique.',
          'Éviter les promesses médicales, politiques, prédictions garanties ou affirmations sensibles.',
          clean,
        ].join('\n');

    return clean.trim().slice(0, 6000);
  }

  private segmentPrompt(prompt: string, index: number, total: number) {
    const progress = total <= 1 ? 'scène complète' : index === 1 ? 'ouverture' : index === total ? 'conclusion avec appel à l’action' : `scène ${index}`;
    return [
      prompt,
      `Plan de ce fragment : ${progress}.`,
      total > 1
        ? 'Garde la même ambiance, les mêmes couleurs et le même style visuel que les autres fragments.'
        : 'Réalise la vidéo comme une scène complète.',
      'Ne montre aucun texte trop long. Utilise des plans simples et lisibles.',
    ].join('\n');
  }

  private async concatVideos(segments: GeminiVideoOutput[], targetSeconds: number): Promise<GeminiVideoOutput> {
    if (!segments.length) throw new BadRequestException('Aucun fragment vidéo à assembler.');
    const dir = await mkdtemp(join(tmpdir(), 'oracle-video-'));
    try {
      const inputs: string[] = [];
      for (let index = 0; index < segments.length; index += 1) {
        const file = join(dir, `segment-${index}.mp4`);
        await writeFile(file, Buffer.from(segments[index].base64, 'base64'));
        inputs.push(file);
      }

      const listFile = join(dir, 'concat.txt');
      await writeFile(listFile, inputs.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'));
      const concatFile = join(dir, 'assembled.mp4');
      const finalFile = join(dir, 'final.mp4');

      await this.runFfmpeg([
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        '-movflags', '+faststart',
        concatFile,
      ]);

      await this.runFfmpeg([
        '-hide_banner',
        '-loglevel', 'error',
        '-i', concatFile,
        '-t', String(Math.max(GEMINI_MIN_DURATION_SECONDS, Math.round(targetSeconds))),
        '-c', 'copy',
        '-movflags', '+faststart',
        finalFile,
      ]);

      const output = await readFile(finalFile);
      return { base64: output.toString('base64'), mime: 'video/mp4' };
    } catch (error) {
      this.logger.warn(`FFmpeg video assembly failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadRequestException('Assemblage de la vidéo impossible pour le moment. Réessayez avec une demande plus courte.');
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private runFfmpeg(args: string[]) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `ffmpeg exited with ${code}`));
      });
    });
  }

  private makeTitle(prompt: string) {
    const clean = prompt.replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();
    return (clean.slice(0, 48) || 'Vidéo IA').trim();
  }

  private geminiKey() {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  }
}
