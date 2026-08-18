import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SocketStateService } from '../gateway/socket-state.service';
import { hasLiveKitConfig } from '../realtime/realtime-config';
import { MediaService } from '../media/media.service';

type ConferencePlan = {
  code: string;
  label: string;
  priceFcfa: number;
  maxParticipants: number;
  durationMinutes: number;
  aiIncludedWords: number;
  freeTest?: boolean;
};

type ConferenceRoomRow = {
  id: string;
  hostId: string;
  slug: string;
  title: string;
  description: string | null;
  phone: string | null;
  contactInfo: string | null;
  coverUrl: string | null;
  speakerName: string | null;
  scheduledAt: Date | null;
  durationMinutes: number;
  logoUrl: string | null;
  visualIdentity: string | null;
  sourceMode: string;
  prerecordedLocalName: string | null;
  status: string;
  planCode: string | null;
  capacity: number;
  aiWordLimit: number;
  aiWordsUsed: number;
  livekitRoom: string;
  startedAt: Date | null;
  endedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ConferencePaymentRow = {
  id: string;
  userId: string;
  reference: string;
  planCode: string;
  amountFcfa: number;
  capacity: number;
  months: number;
  durationMinutes: number;
  status: string;
};

type ConferenceParticipantRow = {
  id: string;
  roomId: string;
  userId: string;
  role: string;
  handStatus: string;
  handRaisedAt: Date | null;
  micAllowed: boolean;
  micAllowedAt: Date | null;
  joinedAt: Date;
  lastSeenAt: Date;
  leftAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userName?: string | null;
  userAvatar?: string | null;
};

type ConferenceQuestionRow = {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  answer: string | null;
  isPinned: boolean;
  isAnswered: boolean;
  isDeleted: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  userName?: string | null;
  userAvatar?: string | null;
};

type ConferenceReactionRow = {
  id: string;
  roomId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
  userName?: string | null;
};

type ConferencePollRow = {
  id: string;
  roomId: string;
  question: string;
  options: string;
  showResults: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ConferenceDocumentRow = {
  id: string;
  roomId: string;
  userId: string;
  title: string;
  url: string | null;
  mime: string | null;
  kind: string;
  createdAt: Date;
  userName?: string | null;
};

type ConferenceAiSummaryRow = {
  id: string;
  roomId: string;
  userId: string;
  promptType: string;
  content: string;
  createdAt: Date;
};

type ConferenceBookRow = {
  id: string;
  roomId: string;
  hostId: string;
  title: string;
  content: string;
  preview: string;
  pdfUrl: string | null;
  pageCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ConferenceBookPurchaseRow = {
  id: string;
  bookId: string;
  userId: string;
  reference: string;
  amountFcfa: number;
  status: string;
  authorizationUrl: string | null;
  paidAt: Date | null;
  downloadedAt: Date | null;
  purgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const MAIN_ADMIN_EMAILS = new Set([
  'tchingankonggeorges@gmail.com',
  'tchingangankonggeorges@gmail.com',
  ...String(process.env.ORACLE_MAIN_ADMIN_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean),
]);

const MAIN_ADMIN_PHONES = new Set([
  '+2250504673829',
  '+2250700508618',
  ...String(process.env.ORACLE_MAIN_ADMIN_PHONES || '')
    .split(',')
    .map(value => normalizePhone(value))
    .filter(Boolean),
]);

const CONFERENCE_MAX_PARTICIPANTS = 50;
const CONFERENCE_DURATION_MINUTES = 70;
const CONFERENCE_AI_INCLUDED_WORDS = 3500;
const CONFERENCE_FREE_TEST_PARTICIPANTS = 5;
const CONFERENCE_FREE_TEST_MINUTES = 3;
const CONFERENCE_BOOK_PRICE_FCFA = 2000;
const CONFERENCE_BOOK_AI_CREDIT_SOURCE = 'oracle_plus_system_free';
const CONFERENCE_PLAN: ConferencePlan = {
  code: 'conference_50_70m',
  label: 'Oracle Conférence - 1h10',
  priceFcfa: 10000,
  maxParticipants: CONFERENCE_MAX_PARTICIPANTS,
  durationMinutes: CONFERENCE_DURATION_MINUTES,
  aiIncludedWords: CONFERENCE_AI_INCLUDED_WORDS,
};
const FREE_TEST_PLAN: ConferencePlan = {
  code: 'conference_free_test_5p_3m',
  label: 'Test gratuit - 3 minutes',
  priceFcfa: 0,
  maxParticipants: CONFERENCE_FREE_TEST_PARTICIPANTS,
  durationMinutes: CONFERENCE_FREE_TEST_MINUTES,
  aiIncludedWords: 0,
  freeTest: true,
};
const CONFERENCE_PLANS: ConferencePlan[] = [CONFERENCE_PLAN];
const ALLOWED_REACTIONS = new Set(['👍', '❤️', '👏', '🔥', '🙏', '✅']);

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/[^\d+]/g, '');
}

function cleanText(value: unknown, fallback = '', max = 2000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
}

function cleanMultiline(value: unknown, fallback = '', max = 4000) {
  const text = String(value ?? '').replace(/\r/g, '').trim();
  return (text || fallback).slice(0, max);
}

function roomSlug(value: string) {
  return cleanText(value, 'conference', 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || `conference-${Date.now()}`;
}

function addMinutes(base: Date, minutes: number) {
  const next = new Date(base);
  next.setMinutes(next.getMinutes() + Math.max(1, minutes));
  return next;
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function toNullableDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value?: Date | string | null) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseOptions(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(item => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function countWords(value: string) {
  return cleanMultiline(value, '', 20_000).split(/\s+/).filter(Boolean).length;
}

function takeWords(value: string, maxWords: number) {
  const words = cleanMultiline(value, '', 20_000).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, Math.max(0, maxWords)).join(' ')}\n\n[Crédits IA épuisés. Rechargez l’assistance IA pour continuer.]`;
}

function asciiPdfText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function pdfEscape(value: string) {
  return asciiPdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapPdfLines(value: string, width = 88) {
  const lines: string[] = [];
  for (const paragraph of asciiPdfText(value).split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    lines.push('');
  }
  return lines;
}

function createPremiumCoverStream(cover: { title: string; theme?: string | null; speaker?: string | null; date?: string | null; subtitle?: string | null }) {
  const titleLines = wrapPdfLines(cover.title, 28).slice(0, 4);
  const themeLines = wrapPdfLines(cover.theme || cover.subtitle || 'Cahier de conférence Oracle Messenger', 54).slice(0, 4);
  const speaker = cleanText(cover.speaker, 'Conférencier Oracle', 120);
  const date = cleanText(cover.date, new Date().toISOString().slice(0, 10), 40);
  const titleText = titleLines.map(line => `(${pdfEscape(line.toUpperCase())}) Tj T*`).join('\n');
  const themeText = themeLines.map(line => `(${pdfEscape(line)}) Tj T*`).join('\n');
  return [
    '0.035 0.055 0.070 rg',
    '0 0 595 842 re f',
    '0.020 0.030 0.040 rg',
    '0 0 74 842 re f',
    '0.725 0.560 0.235 rg',
    '82 46 2 750 re f',
    '0.850 0.690 0.330 RG',
    '3 w',
    '112 70 430 700 re S',
    '1 w',
    '126 84 402 672 re S',
    '0.120 0.145 0.155 rg',
    '138 112 378 602 re f',
    '0.850 0.690 0.330 rg',
    '168 668 318 3 re f',
    '168 176 318 3 re f',
    '0.950 0.820 0.450 rg',
    'BT',
    '/F1 13 Tf',
    '160 720 Td',
    '(ORACLE MESSENGER) Tj',
    'ET',
    '0.950 0.820 0.450 rg',
    'BT',
    '/F1 24 Tf',
    '160 610 Td',
    '32 TL',
    titleText,
    'ET',
    '0.900 0.900 0.860 rg',
    'BT',
    '/F1 11 Tf',
    '160 455 Td',
    '16 TL',
    themeText,
    'ET',
    '0.950 0.820 0.450 rg',
    'BT',
    '/F1 12 Tf',
    '160 295 Td',
    `(${pdfEscape(speaker)}) Tj`,
    '0 -26 Td',
    `(${pdfEscape(date)}) Tj`,
    'ET',
    '0.850 0.690 0.330 RG',
    '1.5 w',
    '452 220 34 34 re S',
    '0.850 0.690 0.330 rg',
    'BT',
    '/F1 10 Tf',
    '461 241 Td',
    '(OM) Tj',
    'ET',
    '0.020 0.030 0.040 rg',
    'BT',
    '/F1 9 Tf',
    '28 120 Td',
    '90 Tz',
    '(EDITION PREMIUM) Tj',
    'ET',
  ].join('\n');
}

function createSimplePdfBuffer(title: string, content: string, cover?: { title: string; theme?: string | null; speaker?: string | null; date?: string | null; subtitle?: string | null }) {
  const allLines = wrapPdfLines(`${title}\n\n${content}`);
  const linesPerPage = 48;
  const pages: string[][] = [];
  for (let index = 0; index < allLines.length; index += linesPerPage) {
    pages.push(allLines.slice(index, index + linesPerPage));
  }
  if (!pages.length) pages.push([title]);

  const objects: string[] = [];
  const totalPages = pages.length + 1;
  const pageIds = Array.from({ length: totalPages }, (_page, index) => 4 + index * 2);
  const contentIds = Array.from({ length: totalPages }, (_page, index) => 5 + index * 2);
  objects[0] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${totalPages} >>\nendobj\n`;
  objects[2] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  const coverStream = createPremiumCoverStream(cover || { title });
  objects[pageIds[0] - 1] = `${pageIds[0]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[0]} 0 R >>\nendobj\n`;
  objects[contentIds[0] - 1] = `${contentIds[0]} 0 obj\n<< /Length ${Buffer.byteLength(coverStream, 'latin1')} >>\nstream\n${coverStream}\nendstream\nendobj\n`;

  pages.forEach((pageLines, pageIndex) => {
    const index = pageIndex + 1;
    const pageId = pageIds[index];
    const contentId = contentIds[index];
    const stream = [
      'BT',
      '/F1 10 Tf',
      '50 790 Td',
      '14 TL',
      ...pageLines.map(line => `(${pdfEscape(line)}) Tj T*`),
      'ET',
    ].join('\n');
    objects[pageId - 1] = `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
    objects[contentId - 1] = `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(object => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += object;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return { buffer: Buffer.from(pdf, 'latin1'), pageCount: totalPages };
}

@Injectable()
export class ConferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketState: SocketStateService,
    private readonly media: MediaService,
  ) {}

  async getOverview(userId: string) {
    await this.ensureTables();
    const access = await this.getAccess(userId);
    const rooms = await this.prisma.$queryRawUnsafe<ConferenceRoomRow[]>(
      `SELECT * FROM "ConferenceRoom" WHERE "hostId" = $1 ORDER BY "updatedAt" DESC LIMIT 20`,
      userId,
    );
    const payments = await this.prisma.$queryRawUnsafe<ConferencePaymentRow[]>(
      `SELECT * FROM "ConferencePayment" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 10`,
      userId,
    );
    const serializedRooms = await Promise.all(rooms.map(async room => {
      const currentRoom = await this.roomWithCurrentCapacity(room);
      const viewerCount = await this.activeViewerCount(currentRoom.id);
      return this.serializeRoom(currentRoom, viewerCount);
    }));
    return {
      access,
      plans: CONFERENCE_PLANS,
      freeTestPlan: FREE_TEST_PLAN,
      rooms: serializedRooms,
      payments,
      architecture: {
        provider: 'livekit',
        mode: 'one_broadcaster_to_sfu_to_spectators',
        scalable: true,
        paidRoom: { participants: CONFERENCE_MAX_PARTICIPANTS, durationMinutes: CONFERENCE_DURATION_MINUTES, aiIncludedWords: CONFERENCE_AI_INCLUDED_WORDS },
        freeTest: { participants: CONFERENCE_FREE_TEST_PARTICIPANTS, durationMinutes: CONFERENCE_FREE_TEST_MINUTES },
        hostPublishesCameraAndMicrophone: true,
        viewerPublishesByDefault: false,
        viewerMicrophoneRequiresHostApproval: true,
        preferredSpeakerCount: 1,
        prerecordedVideoStorage: 'local_device_metadata_only',
      },
      livekitReady: this.isLiveKitReady(),
      paystackReady: Boolean(process.env.PAYSTACK_SECRET_KEY),
    };
  }

  async initializePaystack(userId: string, planCode: string, nativeReturn = false) {
    await this.ensureTables();
    const access = await this.getAccess(userId);
    if (access.isPrimaryAdmin) return { reference: 'admin-no-payment', authorizationUrl: '', access };
    const plan = this.requirePaidPlan(planCode);
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) throw new BadRequestException('Compte utilisateur incomplet.');

    const reference = `om-conference-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferencePayment"
        ("id", "userId", "reference", "planCode", "amountFcfa", "capacity", "months", "durationMinutes")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      randomUUID(),
      userId,
      reference,
      plan.code,
      plan.priceFcfa,
      plan.maxParticipants,
      0,
      plan.durationMinutes,
    );

    const callbackUrl = nativeReturn
      ? `oraclemessenger://paystack?scope=conference&reference=${encodeURIComponent(reference)}`
      : `${process.env.FRONTEND_URL || 'https://messenger.oracle-plus.online'}/conference?paystack=verify&reference=${encodeURIComponent(reference)}`;
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: plan.priceFcfa * 100,
        currency: process.env.PAYSTACK_CURRENCY || 'XOF',
        reference,
        callback_url: callbackUrl,
        metadata: {
          module: 'conference_room',
          planCode: plan.code,
          capacity: plan.maxParticipants,
          durationMinutes: plan.durationMinutes,
          userId,
        },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status || !data?.data?.authorization_url) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "ConferencePayment" SET "status" = 'failed', "updatedAt" = CURRENT_TIMESTAMP WHERE "reference" = $1`,
        reference,
      );
      throw new BadRequestException(data?.message || 'Initialisation Paystack impossible.');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferencePayment" SET "authorizationUrl" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "reference" = $1`,
      reference,
      data.data.authorization_url,
    );
    return { reference, authorizationUrl: data.data.authorization_url };
  }

  async verifyPaystack(userId: string, reference: string) {
    await this.ensureTables();
    const access = await this.getAccess(userId);
    if (access.isPrimaryAdmin) return this.getOverview(userId);
    const cleanReference = cleanText(reference, '', 180);
    if (!cleanReference) throw new BadRequestException('Référence Paystack absente.');
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const [payment] = await this.prisma.$queryRawUnsafe<ConferencePaymentRow[]>(
      `SELECT * FROM "ConferencePayment" WHERE "reference" = $1 LIMIT 1`,
      cleanReference,
    );
    if (!payment || payment.userId !== userId) throw new ForbiddenException('Paiement conférence introuvable.');
    if (payment.status === 'success') return this.getOverview(userId);

    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(cleanReference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json().catch(() => null);
    const success = Boolean(res.ok && data?.status && data?.data?.status === 'success');
    if (!success) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "ConferencePayment" SET "status" = 'failed', "updatedAt" = CURRENT_TIMESTAMP WHERE "reference" = $1`,
        cleanReference,
      );
      throw new BadRequestException(data?.message || 'Paiement conférence non validé.');
    }

    const duration = Number(payment.durationMinutes || CONFERENCE_DURATION_MINUTES);
    const [current] = await this.prisma.$queryRawUnsafe<Array<{ activeUntil: Date | null }>>(
      `SELECT "activeUntil" FROM "ConferenceSubscription" WHERE "userId" = $1 LIMIT 1`,
      userId,
    );
    const base = current?.activeUntil && current.activeUntil.getTime() > Date.now() ? current.activeUntil : new Date();
    const activeUntil = addMinutes(base, duration);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        `UPDATE "ConferencePayment" SET "status" = 'success', "paidAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "reference" = $1 AND "userId" = $2`,
        cleanReference,
        userId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "ConferenceSubscription" ("id", "userId", "planCode", "capacity", "activeUntil")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("userId") DO UPDATE SET
           "planCode" = EXCLUDED."planCode",
           "capacity" = EXCLUDED."capacity",
           "activeUntil" = EXCLUDED."activeUntil",
           "updatedAt" = CURRENT_TIMESTAMP`,
        randomUUID(),
        userId,
        payment.planCode,
        CONFERENCE_MAX_PARTICIPANTS,
        activeUntil,
      );
    });
    return this.getOverview(userId);
  }

  async createRoom(userId: string, body: any) {
    await this.ensureTables();
    const plan = this.roomPlanFromCode(body?.planCode);
    const title = cleanText(body.title, 'Salle de conférence Oracle', 120);
    const slugBase = roomSlug(body.slug || title);
    const slug = await this.uniqueSlug(slugBase);
    const id = randomUUID();
    const livekitRoom = `conference-${id}`;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceRoom"
        ("id", "hostId", "slug", "title", "description", "phone", "contactInfo", "coverUrl", "speakerName",
         "scheduledAt", "durationMinutes", "logoUrl", "visualIdentity", "sourceMode", "prerecordedLocalName",
         "status", "planCode", "capacity", "aiWordLimit", "aiWordsUsed", "livekitRoom")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      id,
      userId,
      slug,
      title,
      cleanText(body.description, '', 2000) || null,
      cleanText(body.phone, '', 80) || null,
      cleanText(body.contactInfo, '', 1000) || null,
      cleanText(body.coverUrl, '', 2000) || null,
      cleanText(body.speakerName, '', 160) || null,
      toNullableDate(body.scheduledAt),
      plan.durationMinutes,
      cleanText(body.logoUrl, '', 2000) || null,
      cleanText(body.visualIdentity, '', 1000) || null,
      body.sourceMode === 'prerecorded' ? 'prerecorded' : 'camera',
      cleanText(body.prerecordedLocalName, '', 260) || null,
      'draft',
      plan.code,
      plan.maxParticipants,
      plan.aiIncludedWords,
      0,
      livekitRoom,
    );
    return this.getOwnedRoom(userId, id);
  }

  async updateRoom(userId: string, roomId: string, body: any) {
    await this.ensureTables();
    await this.requireHost(userId, roomId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceRoom" SET
        "title" = CASE WHEN $3::boolean THEN COALESCE(NULLIF($4, ''), "title") ELSE "title" END,
        "description" = CASE WHEN $5::boolean THEN NULLIF($6, '') ELSE "description" END,
        "phone" = CASE WHEN $7::boolean THEN NULLIF($8, '') ELSE "phone" END,
        "contactInfo" = CASE WHEN $9::boolean THEN NULLIF($10, '') ELSE "contactInfo" END,
        "coverUrl" = CASE WHEN $11::boolean THEN NULLIF($12, '') ELSE "coverUrl" END,
        "speakerName" = CASE WHEN $13::boolean THEN NULLIF($14, '') ELSE "speakerName" END,
        "scheduledAt" = CASE WHEN $15::boolean THEN $16 ELSE "scheduledAt" END,
        "logoUrl" = CASE WHEN $17::boolean THEN NULLIF($18, '') ELSE "logoUrl" END,
        "visualIdentity" = CASE WHEN $19::boolean THEN NULLIF($20, '') ELSE "visualIdentity" END,
        "sourceMode" = CASE WHEN $21::boolean THEN $22 ELSE "sourceMode" END,
        "prerecordedLocalName" = CASE WHEN $23::boolean THEN NULLIF($24, '') ELSE "prerecordedLocalName" END,
        "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "hostId" = $2`,
      roomId,
      userId,
      body.title !== undefined,
      body.title === undefined ? '' : cleanText(body.title, '', 120),
      body.description !== undefined,
      body.description === undefined ? '' : cleanText(body.description, '', 2000),
      body.phone !== undefined,
      body.phone === undefined ? '' : cleanText(body.phone, '', 80),
      body.contactInfo !== undefined,
      body.contactInfo === undefined ? '' : cleanText(body.contactInfo, '', 1000),
      body.coverUrl !== undefined,
      body.coverUrl === undefined ? '' : cleanText(body.coverUrl, '', 2000),
      body.speakerName !== undefined,
      body.speakerName === undefined ? '' : cleanText(body.speakerName, '', 160),
      body.scheduledAt !== undefined,
      toNullableDate(body.scheduledAt),
      body.logoUrl !== undefined,
      body.logoUrl === undefined ? '' : cleanText(body.logoUrl, '', 2000),
      body.visualIdentity !== undefined,
      body.visualIdentity === undefined ? '' : cleanText(body.visualIdentity, '', 1000),
      body.sourceMode !== undefined,
      body.sourceMode === 'prerecorded' ? 'prerecorded' : 'camera',
      body.prerecordedLocalName !== undefined,
      body.prerecordedLocalName === undefined ? '' : cleanText(body.prerecordedLocalName, '', 260),
    );
    return this.getOwnedRoom(userId, roomId);
  }

  async startRoom(userId: string, roomId: string) {
    await this.ensureTables();
    await this.requireHost(userId, roomId);
    if (!this.isLiveKitReady()) throw new BadRequestException('LiveKit/SFU doit être configuré pour démarrer le direct.');
    const [room] = await this.prisma.$queryRawUnsafe<ConferenceRoomRow[]>(
      `SELECT * FROM "ConferenceRoom" WHERE "id" = $1 AND "hostId" = $2 LIMIT 1`,
      roomId,
      userId,
    );
    if (!room) throw new NotFoundException('Salle de conférence introuvable.');
    const plan = this.roomPlanFromCode(room.planCode);
    const access = await this.getAccess(userId);
    if (!plan.freeTest && access.paymentRequired) {
      throw new ForbiddenException('Achetez la salle Oracle Conférence 1h10 avant de démarrer le direct.');
    }
    const startedAt = new Date();
    const planExpiresAt = addMinutes(startedAt, plan.durationMinutes);
    const paidUntil = access.activeUntil ? new Date(access.activeUntil) : planExpiresAt;
    const expiresAt = plan.freeTest ? planExpiresAt : minDate(planExpiresAt, paidUntil);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceRoom" SET
         "status" = 'live',
         "capacity" = $3,
         "durationMinutes" = $4,
         "planCode" = $5,
         "aiWordLimit" = $6,
         "startedAt" = CURRENT_TIMESTAMP,
         "expiresAt" = $7,
         "endedAt" = NULL,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "hostId" = $2`,
      roomId,
      userId,
      plan.maxParticipants,
      plan.durationMinutes,
      plan.code,
      plan.aiIncludedWords,
      expiresAt,
    );
    await this.emitConferenceChanged(roomId, 'room:started');
    return this.getOwnedRoom(userId, roomId);
  }

  async stopRoom(userId: string, roomId: string) {
    await this.ensureTables();
    await this.requireHost(userId, roomId);
    await this.endRoom(roomId);
    const [room] = await this.prisma.$queryRawUnsafe<ConferenceRoomRow[]>(
      `SELECT * FROM "ConferenceRoom" WHERE "id" = $1 LIMIT 1`,
      roomId,
    );
    if (room) {
      await this.ensureBookShell(room).catch(error => {
        console.warn('[conference:book:cover-prepare:failed]', {
          roomId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
    await this.emitConferenceChanged(roomId, 'room:stopped');
    return this.getOwnedRoom(userId, roomId);
  }

  async getPublicRoom(slug: string) {
    await this.ensureTables();
    const found = await this.findRoomBySlug(slug);
    const room = found ? await this.roomWithCurrentCapacity(found) : null;
    if (!room) throw new NotFoundException('Salle de conférence introuvable.');
    const currentRoom = await this.expireRoomIfNeeded(room);
    const viewerCount = await this.activeViewerCount(currentRoom.id);
    return { room: this.serializeRoom(currentRoom, viewerCount) };
  }

  async joinRoom(userId: string, slug: string) {
    await this.ensureTables();
    const [user, foundRoom] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, avatar: true } }),
      this.findRoomBySlug(slug),
    ]);
    if (!user || !foundRoom) throw new NotFoundException('Salle de conférence introuvable.');
    const room = await this.expireRoomIfNeeded(await this.roomWithCurrentCapacity(foundRoom));
    const host = room.hostId === userId;
    if (!host && room.status === 'ended') throw new BadRequestException('Cette salle de conférence est terminée.');
    const [activeViewerCount, participant] = await Promise.all([
      this.activeViewerCount(room.id),
      this.findParticipant(room.id, userId),
    ]);
    const alreadyActive = Boolean(participant && !participant.leftAt);
    if (!host && !alreadyActive && activeViewerCount >= room.capacity) {
      throw new ForbiddenException(`Capacité maximale de ${room.capacity} participant(s) atteinte pour cette salle.`);
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceParticipant" ("id", "roomId", "userId", "role", "lastSeenAt", "micAllowed")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
       ON CONFLICT ("roomId", "userId") DO UPDATE SET
         "role" = EXCLUDED."role",
         "leftAt" = NULL,
         "lastSeenAt" = CURRENT_TIMESTAMP,
         "micAllowed" = CASE WHEN EXCLUDED."role" = 'host' THEN TRUE ELSE "ConferenceParticipant"."micAllowed" END,
         "updatedAt" = CURRENT_TIMESTAMP`,
      randomUUID(),
      room.id,
      userId,
      host ? 'host' : 'viewer',
      host,
    );
    await this.emitConferenceChanged(room.id, host ? 'host:joined' : 'participant:joined');
    const currentParticipant = await this.requireParticipant(room.id, userId);
    const viewerCount = await this.activeViewerCount(room.id);
    if (!host && room.status !== 'live') {
      return {
        room: this.serializeRoom(room, viewerCount),
        livekit: {
          enabled: false,
          waiting: true,
          role: 'viewer',
          reason: 'Salle rejointe. Le participant reste en attente jusqu’au démarrage du direct.',
        },
        state: await this.buildState(room, userId),
      };
    }
    return {
      room: this.serializeRoom(room, viewerCount),
      livekit: await this.createLiveKitToken(
        room,
        user.id,
        user.name || user.email || 'Spectateur',
        host ? 'host' : currentParticipant.micAllowed ? 'speaker' : 'viewer',
      ),
      state: await this.buildState(room, userId),
    };
  }

  async heartbeat(userId: string, slug: string) {
    await this.ensureTables();
    const found = await this.findRoomBySlug(slug);
    if (!found) throw new NotFoundException('Salle de conférence introuvable.');
    const room = await this.expireRoomIfNeeded(found);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceParticipant"
       SET "lastSeenAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "roomId" = $1 AND "userId" = $2 AND "leftAt" IS NULL`,
      room.id,
      userId,
    );
    const viewerCount = await this.activeViewerCount(room.id);
    return { room: this.serializeRoom(await this.roomWithCurrentCapacity(room), viewerCount), state: await this.buildState(room, userId) };
  }

  async getRoomState(userId: string, slug: string) {
    await this.ensureTables();
    const room = await this.findRequiredRoomBySlug(slug);
    return this.buildState(await this.expireRoomIfNeeded(room), userId);
  }

  async raiseHand(userId: string, slug: string) {
    const room = await this.requireJoinedLiveRoom(userId, slug);
    const participant = await this.requireParticipant(room.id, userId);
    if (participant.role === 'host') throw new BadRequestException('Le conférencier contrôle déjà le micro.');
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceParticipant" SET "handStatus" = 'pending', "handRaisedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "roomId" = $1 AND "userId" = $2`,
      room.id,
      userId,
    );
    await this.emitConferenceChanged(room.id, 'hand:raised');
    return this.buildState(room, userId);
  }

  async cancelHand(userId: string, slug: string) {
    const room = await this.requireJoinedLiveRoom(userId, slug);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceParticipant" SET "handStatus" = 'none', "handRaisedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "roomId" = $1 AND "userId" = $2 AND "role" <> 'host'`,
      room.id,
      userId,
    );
    await this.emitConferenceChanged(room.id, 'hand:cancelled');
    return this.buildState(room, userId);
  }

  async decideHand(hostId: string, slug: string, participantId: string, decision: 'allow' | 'refuse' | 'revoke') {
    const room = await this.requireHostBySlug(hostId, slug);
    const target = await this.requireParticipantById(room.id, participantId);
    if (target.role === 'host') throw new BadRequestException('Le conférencier ne peut pas être modéré ici.');
    if (decision === 'allow') {
      await this.prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(
          `UPDATE "ConferenceParticipant" SET "micAllowed" = FALSE, "micAllowedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
           WHERE "roomId" = $1 AND "role" <> 'host'`,
          room.id,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "ConferenceParticipant" SET "handStatus" = 'allowed', "micAllowed" = TRUE, "micAllowedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $1 AND "roomId" = $2`,
          participantId,
          room.id,
        );
      });
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "ConferenceParticipant" SET "handStatus" = $3, "micAllowed" = FALSE, "micAllowedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1 AND "roomId" = $2`,
        participantId,
        room.id,
        decision === 'refuse' ? 'refused' : 'revoked',
      );
    }
    await this.emitConferenceChanged(room.id, `hand:${decision}`);
    return this.buildState(room, hostId);
  }

  async addQuestion(userId: string, slug: string, body: any) {
    const room = await this.requireJoinedLiveRoom(userId, slug);
    const content = cleanMultiline(body?.content, '', 1200);
    if (!content) throw new BadRequestException('Question vide.');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceQuestion" ("id", "roomId", "userId", "content") VALUES ($1, $2, $3, $4)`,
      randomUUID(),
      room.id,
      userId,
      content,
    );
    await this.emitConferenceChanged(room.id, 'question:created');
    return this.buildState(room, userId);
  }

  async answerQuestion(hostId: string, slug: string, questionId: string, body: any) {
    const room = await this.requireHostBySlug(hostId, slug);
    const answer = cleanMultiline(body?.answer, '', 1600);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceQuestion" SET "answer" = NULLIF($3, ''), "isAnswered" = TRUE, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "roomId" = $2`,
      questionId,
      room.id,
      answer,
    );
    await this.emitConferenceChanged(room.id, 'question:answered');
    return this.buildState(room, hostId);
  }

  async updateQuestionFlag(hostId: string, slug: string, questionId: string, body: any) {
    const room = await this.requireHostBySlug(hostId, slug);
    const pin = body?.isPinned;
    const answered = body?.isAnswered;
    const deleted = body?.isDeleted;
    const priority = Number.isFinite(Number(body?.priority)) ? Math.max(0, Math.min(100, Number(body.priority))) : 0;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceQuestion" SET
         "isPinned" = CASE WHEN $3::boolean THEN $4 ELSE "isPinned" END,
         "isAnswered" = CASE WHEN $5::boolean THEN $6 ELSE "isAnswered" END,
         "isDeleted" = CASE WHEN $7::boolean THEN $8 ELSE "isDeleted" END,
         "priority" = CASE WHEN $9::boolean THEN $10 ELSE "priority" END,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "roomId" = $2`,
      questionId,
      room.id,
      pin !== undefined,
      Boolean(pin),
      answered !== undefined,
      Boolean(answered),
      deleted !== undefined,
      Boolean(deleted),
      body?.priority !== undefined,
      priority,
    );
    await this.emitConferenceChanged(room.id, 'question:updated');
    return this.buildState(room, hostId);
  }

  async addReaction(userId: string, slug: string, body: any) {
    const room = await this.requireJoinedLiveRoom(userId, slug);
    const emoji = cleanText(body?.emoji, '👍', 12);
    if (!ALLOWED_REACTIONS.has(emoji)) throw new BadRequestException('Réaction non autorisée.');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceReaction" ("id", "roomId", "userId", "emoji") VALUES ($1, $2, $3, $4)`,
      randomUUID(),
      room.id,
      userId,
      emoji,
    );
    await this.emitConferenceChanged(room.id, 'reaction:created');
    return this.buildState(room, userId);
  }

  async createPoll(hostId: string, slug: string, body: any) {
    const room = await this.requireHostBySlug(hostId, slug);
    const question = cleanText(body?.question, '', 240);
    const options = Array.isArray(body?.options)
      ? body.options.map((item: unknown) => cleanText(item, '', 80)).filter(Boolean).slice(0, 8)
      : [];
    if (!question || options.length < 2) throw new BadRequestException('Sondage invalide : question + au moins deux options.');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferencePoll" ("id", "roomId", "question", "options", "showResults")
       VALUES ($1, $2, $3, $4, $5)`,
      randomUUID(),
      room.id,
      question,
      JSON.stringify(options),
      body?.showResults !== false,
    );
    await this.emitConferenceChanged(room.id, 'poll:created');
    return this.buildState(room, hostId);
  }

  async closePoll(hostId: string, slug: string, pollId: string) {
    const room = await this.requireHostBySlug(hostId, slug);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferencePoll" SET "status" = 'closed', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "roomId" = $2`,
      pollId,
      room.id,
    );
    await this.emitConferenceChanged(room.id, 'poll:closed');
    return this.buildState(room, hostId);
  }

  async votePoll(userId: string, slug: string, pollId: string, body: any) {
    const room = await this.requireJoinedLiveRoom(userId, slug);
    const [poll] = await this.prisma.$queryRawUnsafe<ConferencePollRow[]>(
      `SELECT * FROM "ConferencePoll" WHERE "id" = $1 AND "roomId" = $2 LIMIT 1`,
      pollId,
      room.id,
    );
    if (!poll || poll.status !== 'open') throw new BadRequestException('Sondage fermé ou introuvable.');
    const options = parseOptions(poll.options);
    const optionIndex = Number(body?.optionIndex);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
      throw new BadRequestException('Option de sondage invalide.');
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferencePollVote" ("id", "pollId", "userId", "optionIndex")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("pollId", "userId") DO UPDATE SET "optionIndex" = EXCLUDED."optionIndex", "updatedAt" = CURRENT_TIMESTAMP`,
      randomUUID(),
      pollId,
      userId,
      optionIndex,
    );
    await this.emitConferenceChanged(room.id, 'poll:voted');
    return this.buildState(room, userId);
  }

  async shareDocument(hostId: string, slug: string, body: any) {
    const room = await this.requireHostBySlug(hostId, slug);
    const title = cleanText(body?.title, '', 180);
    const url = cleanText(body?.url, '', 2000);
    if (!title && !url) throw new BadRequestException('Document invalide.');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceDocument" ("id", "roomId", "userId", "title", "url", "mime", "kind")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      randomUUID(),
      room.id,
      hostId,
      title || url,
      url || null,
      cleanText(body?.mime, '', 120) || null,
      cleanText(body?.kind, 'link', 40),
    );
    await this.emitConferenceChanged(room.id, 'document:shared');
    return this.buildState(room, hostId);
  }

  async generateAiSummary(hostId: string, slug: string, body: any) {
    const room = await this.roomWithCurrentCapacity(await this.requireHostBySlug(hostId, slug));
    const remainingWords = Math.max(0, Number(room.aiWordLimit || 0) - Number(room.aiWordsUsed || 0));
    if (remainingWords <= 0) {
      throw new BadRequestException('Crédits IA conférence épuisés. Rechargez l’assistance IA pour générer un nouveau résumé; la conférence continue normalement.');
    }
    const promptType = cleanText(body?.promptType, 'summary', 60);
    const state = await this.buildState(room, hostId);
    const generatedContent = await this.createConferenceSummary(room, state, promptType);
    const content = takeWords(generatedContent, remainingWords);
    const consumedWords = Math.min(countWords(content), remainingWords);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceAiSummary" ("id", "roomId", "userId", "promptType", "content")
       VALUES ($1, $2, $3, $4, $5)`,
      randomUUID(),
      room.id,
      hostId,
      promptType,
      content,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceRoom" SET "aiWordsUsed" = LEAST("aiWordLimit", "aiWordsUsed" + $2), "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
      room.id,
      consumedWords,
    );
    await this.emitConferenceChanged(room.id, 'ai-summary:created');
    const [updatedRoom] = await this.prisma.$queryRawUnsafe<ConferenceRoomRow[]>(
      `SELECT * FROM "ConferenceRoom" WHERE "id" = $1 LIMIT 1`,
      room.id,
    );
    return this.buildState(updatedRoom || room, hostId);
  }

  async generateBook(hostId: string, slug: string) {
    const room = await this.requireHostBySlug(hostId, slug);
    await this.generateBookForRoom(room, hostId);
    await this.emitConferenceChanged(room.id, 'book:generated');
    return this.getBookAccess(hostId, room.slug);
  }

  async getBookAccess(userId: string, slug: string) {
    await this.ensureTables();
    const room = await this.findRequiredRoomBySlug(slug);
    const isHost = room.hostId === userId;
    const participant = isHost ? null : await this.findParticipant(room.id, userId);
    if (!isHost && !participant) throw new ForbiddenException('Ce cahier est réservé au conférencier et aux participants de cette salle.');

    const [book] = await this.prisma.$queryRawUnsafe<ConferenceBookRow[]>(
      `SELECT * FROM "ConferenceBook" WHERE "roomId" = $1 LIMIT 1`,
      room.id,
    );
    if (!book) {
      return {
        available: true,
        book: this.serializeBookCover(room, null),
        room: this.serializeRoom(await this.roomWithCurrentCapacity(room), await this.activeViewerCount(room.id)),
        access: {
          isHost,
          canDownload: false,
          paid: false,
          priceFcfa: isHost ? 0 : CONFERENCE_BOOK_PRICE_FCFA,
          aiCreditSource: CONFERENCE_BOOK_AI_CREDIT_SOURCE,
          chargedToUser: false,
          reason: isHost
            ? 'Couverture prête. Le cahier complet peut être généré gratuitement.'
            : 'Couverture disponible. Le cahier complet sera écrit et généré après paiement.',
        },
      };
    }
    const purchase = isHost ? null : await this.getBookPurchase(book.id, userId);
    const purchasePurged = Boolean(purchase?.purgedAt);
    const purchasePaid = Boolean(purchase && ['success', 'downloaded_purged'].includes(purchase.status));
    const canDownload = isHost || Boolean(purchase?.status === 'success' && !purchasePurged);
    return {
      available: true,
      book: canDownload ? this.serializeBook(book, true, room) : this.serializeBookCover(room, book),
      room: this.serializeRoom(await this.roomWithCurrentCapacity(room), await this.activeViewerCount(room.id)),
      access: {
        isHost,
        canDownload,
        paid: isHost || purchasePaid,
        downloaded: Boolean(purchase?.downloadedAt),
        purged: purchasePurged,
        priceFcfa: isHost ? 0 : CONFERENCE_BOOK_PRICE_FCFA,
        aiCreditSource: CONFERENCE_BOOK_AI_CREDIT_SOURCE,
        chargedToUser: false,
        reason: canDownload
          ? 'Téléchargement autorisé.'
          : purchasePurged
            ? 'Cahier déjà téléchargé. La copie serveur de ce participant a été retirée.'
            : 'Couverture disponible. Le cahier complet sera écrit et généré après paiement.',
      },
    };
  }

  async initializeBookPaystack(userId: string, slug: string, nativeReturn = false) {
    await this.ensureTables();
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const room = await this.findRequiredRoomBySlug(slug);
    if (room.hostId === userId) return this.getBookAccess(userId, slug);
    const participant = await this.findParticipant(room.id, userId);
    if (!participant) throw new ForbiddenException('Paiement réservé aux participants de la conférence.');
    const book = await this.ensureBookShell(room);
    const existingPurchase = await this.getBookPurchase(book.id, userId);
    if (existingPurchase && ['success', 'downloaded_purged'].includes(existingPurchase.status)) return this.getBookAccess(userId, slug);

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) throw new BadRequestException('Compte utilisateur incomplet.');
    const reference = `om-conf-book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceBookPurchase"
        ("id", "bookId", "userId", "reference", "amountFcfa")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("bookId", "userId") DO UPDATE SET
         "reference" = EXCLUDED."reference",
         "amountFcfa" = EXCLUDED."amountFcfa",
         "status" = 'pending',
         "authorizationUrl" = NULL,
         "updatedAt" = CURRENT_TIMESTAMP`,
      randomUUID(),
      book.id,
      userId,
      reference,
      CONFERENCE_BOOK_PRICE_FCFA,
    );
    const callbackUrl = nativeReturn
      ? `oraclemessenger://paystack?scope=conference-book&reference=${encodeURIComponent(reference)}`
      : `${process.env.FRONTEND_URL || 'https://messenger.oracle-plus.online'}/conference/${encodeURIComponent(room.slug)}?bookPaystack=verify&reference=${encodeURIComponent(reference)}`;
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: CONFERENCE_BOOK_PRICE_FCFA * 100,
        currency: process.env.PAYSTACK_CURRENCY || 'XOF',
        reference,
        callback_url: callbackUrl,
        metadata: {
          module: 'conference_book',
          roomId: room.id,
          slug: room.slug,
          bookId: book.id,
          userId,
        },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status || !data?.data?.authorization_url) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "ConferenceBookPurchase" SET "status" = 'failed', "updatedAt" = CURRENT_TIMESTAMP WHERE "reference" = $1`,
        reference,
      );
      throw new BadRequestException(data?.message || 'Initialisation Paystack impossible.');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceBookPurchase" SET "authorizationUrl" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "reference" = $1`,
      data.data.authorization_url,
      reference,
    );
    return { reference, authorizationUrl: data.data.authorization_url, amountFcfa: CONFERENCE_BOOK_PRICE_FCFA };
  }

  async verifyBookPaystack(userId: string, reference: string) {
    await this.ensureTables();
    const cleanReference = cleanText(reference, '', 180);
    if (!cleanReference) throw new BadRequestException('Référence Paystack absente.');
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new BadRequestException('Paystack n’est pas configuré sur le serveur.');
    const [purchase] = await this.prisma.$queryRawUnsafe<ConferenceBookPurchaseRow[]>(
      `SELECT * FROM "ConferenceBookPurchase" WHERE "reference" = $1 LIMIT 1`,
      cleanReference,
    );
    if (!purchase || purchase.userId !== userId) throw new ForbiddenException('Paiement cahier introuvable.');
    const [book] = await this.prisma.$queryRawUnsafe<ConferenceBookRow[]>(
      `SELECT * FROM "ConferenceBook" WHERE "id" = $1 LIMIT 1`,
      purchase.bookId,
    );
    if (!book) throw new NotFoundException('Cahier de conférence introuvable.');
    const [room] = await this.prisma.$queryRawUnsafe<ConferenceRoomRow[]>(
      `SELECT * FROM "ConferenceRoom" WHERE "id" = $1 LIMIT 1`,
      book.roomId,
    );
    if (!room) throw new NotFoundException('Salle de conférence introuvable.');
    if (purchase.status === 'success') {
      await this.generateBookForRoom(room, room.hostId);
      await this.emitConferenceChanged(room.id, 'book:generated-after-payment');
      return this.getBookAccess(userId, room.slug);
    }

    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(cleanReference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json().catch(() => null);
    const success = Boolean(res.ok && data?.status && data?.data?.status === 'success');
    if (!success) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "ConferenceBookPurchase" SET "status" = 'failed', "updatedAt" = CURRENT_TIMESTAMP WHERE "reference" = $1`,
        cleanReference,
      );
      throw new BadRequestException(data?.message || 'Paiement du cahier non validé.');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceBookPurchase" SET "status" = 'success', "paidAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       , "downloadedAt" = NULL, "purgedAt" = NULL
       WHERE "reference" = $1 AND "userId" = $2`,
      cleanReference,
      userId,
    );
    await this.generateBookForRoom(room, room.hostId);
    await this.emitConferenceChanged(room.id, 'book:generated-after-payment');
    return this.getBookAccess(userId, room.slug);
  }

  async markBookDownloaded(userId: string, slug: string) {
    await this.ensureTables();
    const room = await this.findRequiredRoomBySlug(slug);
    const isHost = room.hostId === userId;
    const [book] = await this.prisma.$queryRawUnsafe<ConferenceBookRow[]>(
      `SELECT * FROM "ConferenceBook" WHERE "roomId" = $1 LIMIT 1`,
      room.id,
    );
    if (!book) throw new NotFoundException('Cahier de conférence introuvable.');
    if (isHost) return this.getBookAccess(userId, slug);
    const participant = await this.findParticipant(room.id, userId);
    if (!participant) throw new ForbiddenException('Ce cahier est réservé aux participants de cette salle.');
    const purchase = await this.getBookPurchase(book.id, userId);
    if (!purchase || purchase.status !== 'success' || purchase.purgedAt) {
      throw new ForbiddenException('Téléchargement participant non autorisé.');
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceBookPurchase"
       SET "status" = 'downloaded_purged',
           "downloadedAt" = CURRENT_TIMESTAMP,
           "purgedAt" = CURRENT_TIMESTAMP,
           "authorizationUrl" = NULL,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "userId" = $2`,
      purchase.id,
      userId,
    );
    await this.emitConferenceChanged(room.id, 'book:participant-purged');
    return this.getBookAccess(userId, slug);
  }

  private async getAccess(userId: string) {
    const [user, subscription] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } }),
      this.prisma.$queryRawUnsafe<Array<{ planCode: string; capacity: number; activeUntil: Date | null }>>(
        `SELECT "planCode", "capacity", "activeUntil" FROM "ConferenceSubscription" WHERE "userId" = $1 LIMIT 1`,
        userId,
      ),
    ]);
    const isPrimaryAdmin = this.isPrimaryAdmin(user?.email, user?.phone);
    const active = subscription[0]?.activeUntil && subscription[0].activeUntil.getTime() > Date.now();
    return {
      isPrimaryAdmin,
      planCode: CONFERENCE_PLAN.code,
      capacity: CONFERENCE_MAX_PARTICIPANTS,
      maxParticipants: CONFERENCE_MAX_PARTICIPANTS,
      durationMinutes: CONFERENCE_DURATION_MINUTES,
      aiIncludedWords: CONFERENCE_AI_INCLUDED_WORDS,
      freeTestPlan: FREE_TEST_PLAN,
      unlimited: false,
      activeUntil: active ? subscription[0].activeUntil?.toISOString() ?? null : null,
      paymentRequired: !isPrimaryAdmin && !active,
      priceFcfa: CONFERENCE_PLAN.priceFcfa,
    };
  }

  private requirePaidPlan(planCode: string) {
    const normalizedCode = planCode === 'conference_50_1h' ? CONFERENCE_PLAN.code : planCode;
    const plan = CONFERENCE_PLANS.find(item => item.code === normalizedCode);
    if (!plan || plan.priceFcfa <= 0) throw new BadRequestException('Forfait conférence invalide.');
    return plan;
  }

  private roomPlanFromCode(planCode?: string | null) {
    if (planCode === FREE_TEST_PLAN.code) return FREE_TEST_PLAN;
    return CONFERENCE_PLAN;
  }

  private async getOwnedRoom(userId: string, roomId: string) {
    const [room] = await this.prisma.$queryRawUnsafe<ConferenceRoomRow[]>(
      `SELECT * FROM "ConferenceRoom" WHERE "id" = $1 AND "hostId" = $2 LIMIT 1`,
      roomId,
      userId,
    );
    if (!room) throw new NotFoundException('Salle de conférence introuvable.');
    const currentRoom = await this.expireRoomIfNeeded(await this.roomWithCurrentCapacity(room));
    const viewerCount = await this.activeViewerCount(currentRoom.id);
    return { room: this.serializeRoom(currentRoom, viewerCount), livekitReady: this.isLiveKitReady(), state: await this.buildState(currentRoom, userId) };
  }

  private async requireHost(userId: string, roomId: string) {
    const [room] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "ConferenceRoom" WHERE "id" = $1 AND "hostId" = $2 LIMIT 1`,
      roomId,
      userId,
    );
    if (!room) throw new ForbiddenException('Action réservée au créateur de la salle.');
  }

  private async requireHostBySlug(userId: string, slug: string) {
    await this.ensureTables();
    const room = await this.findRequiredRoomBySlug(slug);
    if (room.hostId !== userId) throw new ForbiddenException('Action réservée au conférencier.');
    return this.expireRoomIfNeeded(room);
  }

  private async findRoomBySlug(slug: string) {
    const cleanSlug = roomSlug(slug);
    const [room] = await this.prisma.$queryRawUnsafe<ConferenceRoomRow[]>(
      `SELECT * FROM "ConferenceRoom" WHERE "slug" = $1 LIMIT 1`,
      cleanSlug,
    );
    return room ?? null;
  }

  private async findRequiredRoomBySlug(slug: string) {
    const room = await this.findRoomBySlug(slug);
    if (!room) throw new NotFoundException('Salle de conférence introuvable.');
    return room;
  }

  private async requireJoinedLiveRoom(userId: string, slug: string) {
    await this.ensureTables();
    const room = await this.expireRoomIfNeeded(await this.findRequiredRoomBySlug(slug));
    if (room.status !== 'live') throw new BadRequestException('La salle n’est pas en direct.');
    await this.requireParticipant(room.id, userId);
    return room;
  }

  private async activeViewerCount(roomId: string) {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM "ConferenceParticipant"
       WHERE "roomId" = $1 AND "role" = 'viewer' AND "leftAt" IS NULL AND "lastSeenAt" >= NOW() - INTERVAL '90 seconds'`,
      roomId,
    );
    return Number(row?.count ?? 0);
  }

  private async findParticipant(roomId: string, userId: string) {
    const [participant] = await this.prisma.$queryRawUnsafe<ConferenceParticipantRow[]>(
      `SELECT * FROM "ConferenceParticipant" WHERE "roomId" = $1 AND "userId" = $2 LIMIT 1`,
      roomId,
      userId,
    );
    return participant ?? null;
  }

  private async requireParticipant(roomId: string, userId: string) {
    const participant = await this.findParticipant(roomId, userId);
    if (!participant || participant.leftAt) throw new ForbiddenException('Vous devez rejoindre la conférence avant cette action.');
    return participant;
  }

  private async requireParticipantById(roomId: string, participantId: string) {
    const [participant] = await this.prisma.$queryRawUnsafe<ConferenceParticipantRow[]>(
      `SELECT * FROM "ConferenceParticipant" WHERE "id" = $1 AND "roomId" = $2 AND "leftAt" IS NULL LIMIT 1`,
      participantId,
      roomId,
    );
    if (!participant) throw new NotFoundException('Participant introuvable.');
    return participant;
  }

  private async roomWithCurrentCapacity(room: ConferenceRoomRow): Promise<ConferenceRoomRow> {
    const plan = this.roomPlanFromCode(room.planCode);
    const aiWordLimit = Number(room.aiWordLimit ?? 0) > 0 || plan.aiIncludedWords === 0
      ? Number(room.aiWordLimit ?? plan.aiIncludedWords)
      : plan.aiIncludedWords;
    if (
      room.planCode !== plan.code ||
      room.capacity !== plan.maxParticipants ||
      room.durationMinutes !== plan.durationMinutes ||
      Number(room.aiWordLimit ?? 0) !== aiWordLimit
    ) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "ConferenceRoom" SET
           "planCode" = $2,
           "capacity" = $3,
           "durationMinutes" = $4,
           "aiWordLimit" = $5,
           "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        room.id,
        plan.code,
        plan.maxParticipants,
        plan.durationMinutes,
        aiWordLimit,
      );
    }
    return {
      ...room,
      planCode: plan.code,
      capacity: plan.maxParticipants,
      durationMinutes: plan.durationMinutes,
      aiWordLimit,
      aiWordsUsed: Number(room.aiWordsUsed ?? 0),
    };
  }

  private async uniqueSlug(base: string) {
    for (let index = 0; index < 20; index += 1) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      const existing = await this.findRoomBySlug(candidate);
      if (!existing) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  private async createLiveKitToken(room: ConferenceRoomRow, identity: string, name: string, role: 'host' | 'speaker' | 'viewer') {
    if (!this.isLiveKitReady()) {
      return { enabled: false, reason: 'LIVEKIT_URL, LIVEKIT_API_KEY ou LIVEKIT_API_SECRET manquant' };
    }
    const url = process.env.LIVEKIT_URL!;
    const apiKey = process.env.LIVEKIT_API_KEY!;
    const apiSecret = process.env.LIVEKIT_API_SECRET!;
    const canPublishCamera = role === 'host';
    const canPublishMicrophone = role === 'host' || role === 'speaker';
    const canPublish = canPublishCamera || canPublishMicrophone;
    const token = new AccessToken(apiKey, apiSecret, { identity, name });
    token.addGrant({
      room: room.livekitRoom,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: canPublish,
      canPublishSources: canPublishCamera
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
        : canPublishMicrophone
          ? [TrackSource.MICROPHONE]
          : undefined,
      canUpdateOwnMetadata: true,
    } as any);
    return {
      enabled: true,
      provider: 'livekit',
      url,
      room: room.livekitRoom,
      token: await token.toJwt(),
      role,
      canPublish,
      canPublishCamera,
      canPublishMicrophone,
      canSubscribe: true,
    };
  }

  private async buildState(room: ConferenceRoomRow, userId: string) {
    const currentRoom = await this.expireRoomIfNeeded(await this.roomWithCurrentCapacity(room));
    const viewerCount = await this.activeViewerCount(currentRoom.id);
    const [participants, questions, reactions, polls, documents, aiSummaries] = await Promise.all([
      this.prisma.$queryRawUnsafe<ConferenceParticipantRow[]>(
        `SELECT p.*, u."name" AS "userName", u."avatar" AS "userAvatar"
         FROM "ConferenceParticipant" p
         JOIN "User" u ON u."id" = p."userId"
         WHERE p."roomId" = $1 AND p."leftAt" IS NULL AND p."lastSeenAt" >= NOW() - INTERVAL '90 seconds'
         ORDER BY CASE WHEN p."role" = 'host' THEN 0 ELSE 1 END, p."handRaisedAt" ASC NULLS LAST, p."joinedAt" ASC`,
        currentRoom.id,
      ),
      this.prisma.$queryRawUnsafe<ConferenceQuestionRow[]>(
        `SELECT q.*, u."name" AS "userName", u."avatar" AS "userAvatar"
         FROM "ConferenceQuestion" q
         JOIN "User" u ON u."id" = q."userId"
         WHERE q."roomId" = $1 AND q."isDeleted" = FALSE
         ORDER BY q."isPinned" DESC, q."priority" DESC, q."createdAt" DESC
         LIMIT 120`,
        currentRoom.id,
      ),
      this.prisma.$queryRawUnsafe<ConferenceReactionRow[]>(
        `SELECT r.*, u."name" AS "userName"
         FROM "ConferenceReaction" r
         JOIN "User" u ON u."id" = r."userId"
         WHERE r."roomId" = $1 AND r."createdAt" >= NOW() - INTERVAL '90 seconds'
         ORDER BY r."createdAt" DESC
         LIMIT 80`,
        currentRoom.id,
      ),
      this.prisma.$queryRawUnsafe<ConferencePollRow[]>(
        `SELECT * FROM "ConferencePoll" WHERE "roomId" = $1 ORDER BY "createdAt" DESC LIMIT 30`,
        currentRoom.id,
      ),
      this.prisma.$queryRawUnsafe<ConferenceDocumentRow[]>(
        `SELECT d.*, u."name" AS "userName"
         FROM "ConferenceDocument" d
         JOIN "User" u ON u."id" = d."userId"
         WHERE d."roomId" = $1 ORDER BY d."createdAt" DESC LIMIT 80`,
        currentRoom.id,
      ),
      this.prisma.$queryRawUnsafe<ConferenceAiSummaryRow[]>(
        `SELECT * FROM "ConferenceAiSummary" WHERE "roomId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
        currentRoom.id,
      ),
    ]);
    const serializedPolls = await Promise.all(polls.map(async poll => this.serializePoll(poll)));
    const currentParticipant = participants.find(item => item.userId === userId) || null;
    const isHost = currentRoom.hostId === userId;
    return {
      room: this.serializeRoom(currentRoom, viewerCount),
      participants: participants.map(item => this.serializeParticipant(item)),
      raisedHands: participants.filter(item => item.handStatus === 'pending').map(item => this.serializeParticipant(item)),
      currentSpeaker: participants.find(item => item.role !== 'host' && item.micAllowed) ? this.serializeParticipant(participants.find(item => item.role !== 'host' && item.micAllowed)!) : null,
      questions: questions.map(item => this.serializeQuestion(item)),
      reactions: reactions.map(item => ({ ...item, createdAt: iso(item.createdAt) })),
      polls: serializedPolls,
      documents: documents.map(item => ({ ...item, createdAt: iso(item.createdAt) })),
      aiSummaries: aiSummaries.map(item => ({ ...item, createdAt: iso(item.createdAt) })),
      me: currentParticipant ? this.serializeParticipant(currentParticipant) : null,
      permissions: {
        isHost,
        canManage: isHost,
        canRaiseHand: Boolean(currentParticipant && !isHost && currentRoom.status === 'live'),
        canAskQuestion: Boolean(currentParticipant && currentRoom.status === 'live'),
        canSpeak: Boolean(isHost || currentParticipant?.micAllowed),
      },
    };
  }

  private async serializePoll(poll: ConferencePollRow) {
    const options = parseOptions(poll.options);
    const counts = await this.prisma.$queryRawUnsafe<Array<{ optionIndex: number; count: bigint | number }>>(
      `SELECT "optionIndex", COUNT(*) AS count FROM "ConferencePollVote" WHERE "pollId" = $1 GROUP BY "optionIndex"`,
      poll.id,
    );
    const voteCounts = options.map((_option, index) => Number(counts.find(item => item.optionIndex === index)?.count ?? 0));
    return {
      id: poll.id,
      roomId: poll.roomId,
      question: poll.question,
      options,
      showResults: poll.showResults,
      status: poll.status,
      voteCounts,
      totalVotes: voteCounts.reduce((sum, count) => sum + count, 0),
      createdAt: iso(poll.createdAt),
      updatedAt: iso(poll.updatedAt),
    };
  }

  private serializeParticipant(participant: ConferenceParticipantRow) {
    return {
      id: participant.id,
      userId: participant.userId,
      role: participant.role,
      name: participant.userName || 'Participant',
      avatar: participant.userAvatar || null,
      handStatus: participant.handStatus,
      handRaisedAt: iso(participant.handRaisedAt),
      micAllowed: Boolean(participant.micAllowed),
      micAllowedAt: iso(participant.micAllowedAt),
      joinedAt: iso(participant.joinedAt),
      lastSeenAt: iso(participant.lastSeenAt),
    };
  }

  private serializeQuestion(question: ConferenceQuestionRow) {
    return {
      id: question.id,
      userId: question.userId,
      name: question.userName || 'Participant',
      avatar: question.userAvatar || null,
      content: question.content,
      answer: question.answer,
      isPinned: Boolean(question.isPinned),
      isAnswered: Boolean(question.isAnswered),
      priority: Number(question.priority || 0),
      createdAt: iso(question.createdAt),
      updatedAt: iso(question.updatedAt),
    };
  }

  private isLiveKitReady() {
    return hasLiveKitConfig();
  }

  private isPrimaryAdmin(email?: string | null, phone?: string | null) {
    return MAIN_ADMIN_EMAILS.has(String(email || '').toLowerCase()) || MAIN_ADMIN_PHONES.has(normalizePhone(phone));
  }

  private publicLink(slug: string) {
    const base = (process.env.CONFERENCE_PUBLIC_URL || process.env.FRONTEND_URL || 'https://messenger.oracle-plus.online').replace(/\/$/, '');
    return `${base}/conference/${encodeURIComponent(slug)}`;
  }

  private serializeRoom(room: ConferenceRoomRow, viewerCount: number) {
    const plan = this.roomPlanFromCode(room.planCode);
    const expiresAt = room.expiresAt ? new Date(room.expiresAt) : null;
    const timeRemainingSeconds = expiresAt && room.status === 'live'
      ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
      : null;
    const aiWordLimit = Number(room.aiWordLimit ?? plan.aiIncludedWords);
    const aiWordsUsed = Math.max(0, Number(room.aiWordsUsed ?? 0));
    const aiWordsRemaining = Math.max(0, aiWordLimit - aiWordsUsed);
    return {
      ...room,
      link: this.publicLink(room.slug),
      deepLink: `oraclemessenger://conference/${encodeURIComponent(room.slug)}`,
      viewerCount,
      planCode: plan.code,
      planLabel: plan.label,
      freeTest: Boolean(plan.freeTest),
      maxParticipants: room.capacity,
      commercialCapacity: CONFERENCE_MAX_PARTICIPANTS,
      unlimitedCommercialCapacity: false,
      durationMinutes: room.durationMinutes,
      priceFcfa: plan.priceFcfa,
      aiWordLimit,
      aiWordsUsed,
      aiWordsRemaining,
      aiRechargeRequired: aiWordLimit <= 0 || aiWordsRemaining <= 0,
      timeRemainingSeconds,
      scheduledAt: iso(room.scheduledAt),
      startedAt: iso(room.startedAt),
      endedAt: iso(room.endedAt),
      expiresAt: iso(room.expiresAt),
      createdAt: iso(room.createdAt),
      updatedAt: iso(room.updatedAt),
    };
  }

  private async expireRoomIfNeeded(room: ConferenceRoomRow) {
    if (room.status === 'live' && room.expiresAt && room.expiresAt.getTime() <= Date.now()) {
      await this.endRoom(room.id);
      await this.emitConferenceChanged(room.id, 'room:expired');
      return { ...room, status: 'ended', endedAt: new Date(), updatedAt: new Date() };
    }
    return room;
  }

  private async endRoom(roomId: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceRoom" SET "status" = 'ended', "endedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      roomId,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ConferenceParticipant" SET "leftAt" = CURRENT_TIMESTAMP, "micAllowed" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "roomId" = $1 AND "leftAt" IS NULL`,
      roomId,
    );
  }

  private async emitConferenceChanged(roomId: string, reason: string) {
    const [room] = await this.prisma.$queryRawUnsafe<Array<{ id: string; slug: string; hostId: string }>>(
      `SELECT "id", "slug", "hostId" FROM "ConferenceRoom" WHERE "id" = $1 LIMIT 1`,
      roomId,
    );
    if (!room) return;
    const participants = await this.prisma.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT "userId" FROM "ConferenceParticipant" WHERE "roomId" = $1 AND "leftAt" IS NULL`,
      roomId,
    );
    const recipients = new Set([room.hostId, ...participants.map(item => item.userId)]);
    const payload = { roomId: room.id, slug: room.slug, reason, at: new Date().toISOString() };
    for (const userId of recipients) {
      this.socketState.emitToUser(userId, 'conference:changed', payload);
    }
  }

  private async createConferenceSummary(room: ConferenceRoomRow, state: any, promptType: string) {
    const questions = Array.isArray(state.questions) ? state.questions.slice(0, 40) : [];
    const polls = Array.isArray(state.polls) ? state.polls.slice(0, 10) : [];
    const context = [
      `Conference: ${room.title}`,
      `Description: ${room.description || ''}`,
      `Questions: ${questions.map((item: any) => `- ${item.content}${item.answer ? ` | reponse: ${item.answer}` : ''}`).join('\n')}`,
      `Sondages: ${polls.map((item: any) => `- ${item.question}: ${item.options?.join(' / ')}`).join('\n')}`,
    ].join('\n');
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Tu es l'Agent virtuel Oracle. Genere un resultat professionnel pour: ${promptType}.\n\n${context}`,
              }],
            }],
          }),
        });
        const data = await res.json().catch(() => null);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (res.ok && text) return cleanMultiline(text, '', 6000);
      } catch {
        // Le compte rendu déterministe ci-dessous reste disponible si l'IA externe échoue.
      }
    }
    const importantQuestions = questions.filter((item: any) => item.isPinned).slice(0, 8);
    return cleanMultiline([
      `Compte rendu Oracle Conference - ${room.title}`,
      room.description ? `Sujet: ${room.description}` : '',
      `Questions recues: ${questions.length}`,
      importantQuestions.length ? `Questions importantes:\n${importantQuestions.map((item: any) => `- ${item.content}`).join('\n')}` : '',
      polls.length ? `Sondages:\n${polls.map((item: any) => `- ${item.question} (${item.totalVotes || 0} votes)`).join('\n')}` : '',
      'Actions recommandees: repondre aux questions non traitees, partager les documents utiles et publier le resume aux participants.',
    ].filter(Boolean).join('\n\n'), '', 6000);
  }

  private async hasBookPurchase(bookId: string, userId: string) {
    const purchase = await this.getBookPurchase(bookId, userId);
    return Boolean(purchase?.status === 'success' && !purchase.purgedAt);
  }

  private async getBookPurchase(bookId: string, userId: string) {
    const [purchase] = await this.prisma.$queryRawUnsafe<ConferenceBookPurchaseRow[]>(
      `SELECT * FROM "ConferenceBookPurchase"
       WHERE "bookId" = $1 AND "userId" = $2
       ORDER BY "updatedAt" DESC
       LIMIT 1`,
      bookId,
      userId,
    );
    return purchase || null;
  }

  private bookCover(room: ConferenceRoomRow) {
    return {
      title: `Cahier de conférence - ${room.title}`,
      theme: room.description || room.title,
      speaker: cleanText(room.speakerName, '', 160) || 'Conférencier Oracle',
      date: iso(room.startedAt || room.scheduledAt || room.createdAt)?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      style: 'Couverture premium hardcover, finition mate/satinée, dorure à chaud, gaufrage et rendu éditorial institutionnel.',
    };
  }

  private serializeBookCover(room: ConferenceRoomRow, book: ConferenceBookRow | null) {
    const cover = this.bookCover(room);
    return {
      id: book?.id || null,
      roomId: room.id,
      title: cover.title,
      preview: '',
      pageCount: 0,
      status: book?.status || 'cover_only',
      coverOnly: true,
      cover,
      downloadUrl: null,
      aiCreditSource: CONFERENCE_BOOK_AI_CREDIT_SOURCE,
      chargedToUser: false,
      createdAt: iso(book?.createdAt || room.createdAt),
      updatedAt: iso(book?.updatedAt || room.updatedAt),
    };
  }

  private serializeBook(book: ConferenceBookRow, canDownload: boolean, room?: ConferenceRoomRow) {
    return {
      id: book.id,
      roomId: book.roomId,
      title: book.title,
      preview: canDownload ? book.preview : '',
      pageCount: Number(book.pageCount || 1),
      status: book.status,
      coverOnly: false,
      cover: room ? this.bookCover(room) : null,
      downloadUrl: canDownload ? book.pdfUrl : null,
      aiCreditSource: CONFERENCE_BOOK_AI_CREDIT_SOURCE,
      chargedToUser: false,
      createdAt: iso(book.createdAt),
      updatedAt: iso(book.updatedAt),
    };
  }

  private async ensureBookShell(room: ConferenceRoomRow) {
    const [existing] = await this.prisma.$queryRawUnsafe<ConferenceBookRow[]>(
      `SELECT * FROM "ConferenceBook" WHERE "roomId" = $1 LIMIT 1`,
      room.id,
    );
    if (existing) return existing;
    const title = `Cahier de conférence - ${room.title}`;
    const preview = cleanMultiline([
      `Couverture premium`,
      `Titre: ${room.title}`,
      `Theme: ${room.description || room.title}`,
      `Conferencier: ${room.speakerName || 'Conférencier Oracle'}`,
    ].join('\n'), '', 1000);
    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceBook"
        ("id", "roomId", "hostId", "title", "content", "preview", "pdfUrl", "pageCount", "status")
       VALUES ($1, $2, $3, $4, '', $5, NULL, 0, 'cover_only')`,
      id,
      room.id,
      room.hostId,
      title,
      preview,
    );
    const [created] = await this.prisma.$queryRawUnsafe<ConferenceBookRow[]>(
      `SELECT * FROM "ConferenceBook" WHERE "id" = $1 LIMIT 1`,
      id,
    );
    return created;
  }

  private async collectBookData(roomId: string) {
    const [participants, questions, documents, summaries, polls] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<any>>(
        `SELECT p.*, u."name" AS "userName"
         FROM "ConferenceParticipant" p
         JOIN "User" u ON u."id" = p."userId"
         WHERE p."roomId" = $1
         ORDER BY CASE WHEN p."role" = 'host' THEN 0 ELSE 1 END, p."joinedAt" ASC`,
        roomId,
      ),
      this.prisma.$queryRawUnsafe<Array<any>>(
        `SELECT q.*, u."name" AS "userName"
         FROM "ConferenceQuestion" q
         JOIN "User" u ON u."id" = q."userId"
         WHERE q."roomId" = $1 AND q."isDeleted" = FALSE
         ORDER BY q."isPinned" DESC, q."priority" DESC, q."createdAt" ASC`,
        roomId,
      ),
      this.prisma.$queryRawUnsafe<Array<any>>(
        `SELECT d.*, u."name" AS "userName"
         FROM "ConferenceDocument" d
         JOIN "User" u ON u."id" = d."userId"
         WHERE d."roomId" = $1
         ORDER BY d."createdAt" ASC`,
        roomId,
      ),
      this.prisma.$queryRawUnsafe<Array<any>>(
        `SELECT * FROM "ConferenceAiSummary"
         WHERE "roomId" = $1
         ORDER BY "createdAt" ASC`,
        roomId,
      ),
      this.prisma.$queryRawUnsafe<Array<any>>(
        `SELECT * FROM "ConferencePoll"
         WHERE "roomId" = $1
         ORDER BY "createdAt" ASC`,
        roomId,
      ),
    ]);
    return { participants, questions, documents, summaries, polls };
  }

  private createBookContent(room: ConferenceRoomRow, data: Awaited<ReturnType<ConferenceService['collectBookData']>>) {
    const speaker = cleanText(room.speakerName, '', 160) || 'Conférencier Oracle';
    const date = iso(room.startedAt || room.createdAt)?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const summaries = data.summaries.map(item => cleanMultiline(item.content, '', 3000)).filter(Boolean);
    const participantReports = data.participants.map(participant => {
      const name = participant.userName || 'Participant';
      const participantQuestions = data.questions.filter(question => question.userId === participant.userId);
      return [
        `Rapport individuel - ${name}`,
        `Role: ${participant.role === 'host' ? 'conferencier' : participant.micAllowed ? 'intervenant autorise' : 'participant'}.`,
        participant.handStatus && participant.handStatus !== 'none' ? `Demande de parole: ${participant.handStatus}.` : '',
        participantQuestions.length
          ? `Questions ou contributions:\n${participantQuestions.map(question => `- ${question.content}${question.answer ? `\n  Reponse: ${question.answer}` : ''}`).join('\n')}`
          : 'Aucune question écrite enregistrée pour ce participant.',
      ].filter(Boolean).join('\n');
    });
    const answeredQuestions = data.questions.filter(question => question.answer);
    const pinnedQuestions = data.questions.filter(question => question.isPinned);
    return cleanMultiline([
      `CAHIER DE CONFERENCE ORACLE MESSENGER`,
      `Titre: ${room.title}`,
      `Theme: ${room.description || room.title}`,
      `Conferencier: ${speaker}`,
      `Date: ${date}`,
      '',
      `Introduction`,
      room.description || 'Cette conférence a été organisée dans Oracle Messenger. Le cahier reprend les idées, interventions, questions et synthèses disponibles.',
      '',
      `Pensée du conférencier`,
      summaries.length
        ? summaries.join('\n\n')
        : 'Agent virtuel Oracle n’a pas encore reçu de synthèse détaillée. Le document s’appuie donc sur les données structurées de la salle.',
      '',
      `Points importants`,
      pinnedQuestions.length
        ? pinnedQuestions.map(question => `- ${question.content}${question.answer ? ` | Reponse: ${question.answer}` : ''}`).join('\n')
        : answeredQuestions.slice(0, 12).map(question => `- ${question.content} | Reponse: ${question.answer}`).join('\n') || 'Aucun point épinglé.',
      '',
      `Questions et réponses`,
      data.questions.length
        ? data.questions.map(question => `- ${question.userName || 'Participant'}: ${question.content}${question.answer ? `\n  Reponse du conferencier: ${question.answer}` : ''}`).join('\n')
        : 'Aucune question enregistrée.',
      '',
      `Sondages`,
      data.polls.length
        ? data.polls.map(poll => `- ${poll.question}: ${parseOptions(poll.options).join(' / ')}`).join('\n')
        : 'Aucun sondage enregistré.',
      '',
      `Documents et supports`,
      data.documents.length
        ? data.documents.map(document => `- ${document.title}${document.url ? ` (${document.url})` : ''}`).join('\n')
        : 'Aucun document partagé.',
      '',
      `Rapports individuels des participants`,
      participantReports.join('\n\n'),
      '',
      `Conclusion`,
      'Ce cahier rassemble les traces disponibles de la conférence et les reformule pour une lecture simple. Il ne doit pas attribuer au conférencier des affirmations absentes des données de la salle.',
    ].join('\n\n'), '', 60_000);
  }

  private async writeBookWithOraclePlusSystemCredits(room: ConferenceRoomRow, draft: string) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) return draft;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: [
                'Tu es Agent virtuel Oracle. Ecris un vrai cahier de conference professionnel en francais simple.',
                'Developpe les idees sans inventer de faits non presents dans les donnees.',
                'Structure avec couverture, introduction, themes, sous-themes, explications, questions/reponses, rapports participants et conclusion.',
                'Le cout est pris en charge par les credits systeme Oracle Plus, pas par le participant.',
                `Titre: ${room.title}`,
                `Theme: ${room.description || room.title}`,
                '',
                draft,
              ].join('\n'),
            }],
          }],
        }),
      });
      const data = await res.json().catch(() => null);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (res.ok && text) return cleanMultiline(text, draft, 60_000);
    } catch {
      // La génération déterministe reste disponible si l'IA externe échoue.
    }
    return draft;
  }

  private async generateBookForRoom(room: ConferenceRoomRow, hostId: string) {
    await this.ensureTables();
    const currentRoom = await this.roomWithCurrentCapacity(room);
    const data = await this.collectBookData(currentRoom.id);
    const title = `Cahier de conférence - ${currentRoom.title}`;
    const draft = this.createBookContent(currentRoom, data);
    const content = await this.writeBookWithOraclePlusSystemCredits(currentRoom, draft);
    const pdf = createSimplePdfBuffer(title, content, this.bookCover(currentRoom));
    const saved = await this.media.saveBuffer({
      buffer: pdf.buffer,
      name: `${roomSlug(currentRoom.title)}-cahier-oracle.pdf`,
      mime: 'application/pdf',
      kind: 'conference-book',
      maxBytes: 8 * 1024 * 1024,
    }, hostId);
    const preview = cleanMultiline(content, '', 1400);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceBook"
        ("id", "roomId", "hostId", "title", "content", "preview", "pdfUrl", "pageCount", "status")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ready')
       ON CONFLICT ("roomId") DO UPDATE SET
         "title" = EXCLUDED."title",
         "content" = EXCLUDED."content",
         "preview" = EXCLUDED."preview",
         "pdfUrl" = EXCLUDED."pdfUrl",
         "pageCount" = EXCLUDED."pageCount",
         "status" = 'ready',
         "updatedAt" = CURRENT_TIMESTAMP`,
      randomUUID(),
      currentRoom.id,
      hostId,
      title,
      content,
      preview,
      saved.url,
      pdf.pageCount,
    );
  }

  private async ensureTables() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceSubscription" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
        "planCode" TEXT NOT NULL DEFAULT 'conference_50_70m',
        "capacity" INTEGER NOT NULL DEFAULT 50,
        "activeUntil" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferencePayment" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "reference" TEXT NOT NULL UNIQUE,
        "planCode" TEXT NOT NULL,
        "amountFcfa" INTEGER NOT NULL,
        "capacity" INTEGER NOT NULL,
        "months" INTEGER NOT NULL DEFAULT 0,
        "durationMinutes" INTEGER NOT NULL DEFAULT 70,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "authorizationUrl" TEXT,
        "paidAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceRoom" (
        "id" TEXT PRIMARY KEY,
        "hostId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "slug" TEXT NOT NULL UNIQUE,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "phone" TEXT,
        "contactInfo" TEXT,
        "coverUrl" TEXT,
        "speakerName" TEXT,
        "scheduledAt" TIMESTAMP(3),
        "durationMinutes" INTEGER NOT NULL DEFAULT 70,
        "logoUrl" TEXT,
        "visualIdentity" TEXT,
        "sourceMode" TEXT NOT NULL DEFAULT 'camera',
        "prerecordedLocalName" TEXT,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "planCode" TEXT NOT NULL DEFAULT 'conference_50_70m',
        "capacity" INTEGER NOT NULL DEFAULT 50,
        "aiWordLimit" INTEGER NOT NULL DEFAULT 3500,
        "aiWordsUsed" INTEGER NOT NULL DEFAULT 0,
        "livekitRoom" TEXT NOT NULL UNIQUE,
        "startedAt" TIMESTAMP(3),
        "endedAt" TIMESTAMP(3),
        "expiresAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceParticipant" (
        "id" TEXT PRIMARY KEY,
        "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "role" TEXT NOT NULL DEFAULT 'viewer',
        "handStatus" TEXT NOT NULL DEFAULT 'none',
        "handRaisedAt" TIMESTAMP(3),
        "micAllowed" BOOLEAN NOT NULL DEFAULT FALSE,
        "micAllowedAt" TIMESTAMP(3),
        "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "leftAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("roomId", "userId")
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceQuestion" (
        "id" TEXT PRIMARY KEY,
        "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "content" TEXT NOT NULL,
        "answer" TEXT,
        "isPinned" BOOLEAN NOT NULL DEFAULT FALSE,
        "isAnswered" BOOLEAN NOT NULL DEFAULT FALSE,
        "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
        "priority" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceReaction" (
        "id" TEXT PRIMARY KEY,
        "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "emoji" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferencePoll" (
        "id" TEXT PRIMARY KEY,
        "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
        "question" TEXT NOT NULL,
        "options" TEXT NOT NULL DEFAULT '[]',
        "showResults" BOOLEAN NOT NULL DEFAULT TRUE,
        "status" TEXT NOT NULL DEFAULT 'open',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferencePollVote" (
        "id" TEXT PRIMARY KEY,
        "pollId" TEXT NOT NULL REFERENCES "ConferencePoll"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "optionIndex" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("pollId", "userId")
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceDocument" (
        "id" TEXT PRIMARY KEY,
        "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "title" TEXT NOT NULL,
        "url" TEXT,
        "mime" TEXT,
        "kind" TEXT NOT NULL DEFAULT 'link',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceAiSummary" (
        "id" TEXT PRIMARY KEY,
        "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "promptType" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceBook" (
        "id" TEXT PRIMARY KEY,
        "roomId" TEXT NOT NULL UNIQUE REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
        "hostId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "preview" TEXT NOT NULL,
        "pdfUrl" TEXT,
        "pageCount" INTEGER NOT NULL DEFAULT 1,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ConferenceBookPurchase" (
        "id" TEXT PRIMARY KEY,
        "bookId" TEXT NOT NULL REFERENCES "ConferenceBook"("id") ON DELETE CASCADE,
        "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "reference" TEXT NOT NULL UNIQUE,
        "amountFcfa" INTEGER NOT NULL DEFAULT 2000,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "authorizationUrl" TEXT,
        "paidAt" TIMESTAMP(3),
        "downloadedAt" TIMESTAMP(3),
        "purgedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("bookId", "userId")
      )
    `);
    const alters = [
      `ALTER TABLE "ConferenceSubscription" ALTER COLUMN "planCode" SET DEFAULT 'conference_50_70m'`,
      `ALTER TABLE "ConferencePayment" ALTER COLUMN "months" SET DEFAULT 0`,
      `ALTER TABLE "ConferencePayment" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 70`,
      `ALTER TABLE "ConferencePayment" ALTER COLUMN "durationMinutes" SET DEFAULT 70`,
      `ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT`,
      `ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "speakerName" TEXT`,
      `ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3)`,
      `ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 70`,
      `ALTER TABLE "ConferenceRoom" ALTER COLUMN "durationMinutes" SET DEFAULT 70`,
      `ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`,
      `ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "planCode" TEXT NOT NULL DEFAULT 'conference_50_70m'`,
      `ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "aiWordLimit" INTEGER NOT NULL DEFAULT 3500`,
      `ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "aiWordsUsed" INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE "ConferenceParticipant" ADD COLUMN IF NOT EXISTS "handStatus" TEXT NOT NULL DEFAULT 'none'`,
      `ALTER TABLE "ConferenceParticipant" ADD COLUMN IF NOT EXISTS "handRaisedAt" TIMESTAMP(3)`,
      `ALTER TABLE "ConferenceParticipant" ADD COLUMN IF NOT EXISTS "micAllowed" BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE "ConferenceParticipant" ADD COLUMN IF NOT EXISTS "micAllowedAt" TIMESTAMP(3)`,
      `ALTER TABLE "ConferenceBookPurchase" ADD COLUMN IF NOT EXISTS "downloadedAt" TIMESTAMP(3)`,
      `ALTER TABLE "ConferenceBookPurchase" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3)`,
    ];
    for (const statement of alters) {
      await this.prisma.$executeRawUnsafe(statement);
    }
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceRoom_hostId_updatedAt_idx" ON "ConferenceRoom"("hostId", "updatedAt" DESC)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceRoom_status_idx" ON "ConferenceRoom"("status")`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceParticipant_room_active_idx" ON "ConferenceParticipant"("roomId", "leftAt", "lastSeenAt")`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceParticipant_hand_idx" ON "ConferenceParticipant"("roomId", "handStatus", "handRaisedAt")`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceQuestion_room_createdAt_idx" ON "ConferenceQuestion"("roomId", "createdAt" DESC)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceReaction_room_createdAt_idx" ON "ConferenceReaction"("roomId", "createdAt" DESC)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferencePoll_room_createdAt_idx" ON "ConferencePoll"("roomId", "createdAt" DESC)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceDocument_room_createdAt_idx" ON "ConferenceDocument"("roomId", "createdAt" DESC)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferencePayment_user_createdAt_idx" ON "ConferencePayment"("userId", "createdAt" DESC)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceBook_room_status_idx" ON "ConferenceBook"("roomId", "status")`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ConferenceBookPurchase_user_createdAt_idx" ON "ConferenceBookPurchase"("userId", "createdAt" DESC)`);
  }
}
