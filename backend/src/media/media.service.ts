import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { createHash, randomUUID } from 'crypto';

export const MEDIA_UPLOAD_MAX_BYTES = Number(process.env.MEDIA_UPLOAD_MAX_BYTES || 18 * 1024 * 1024);
const DEFAULT_UPLOAD_ROOT = process.env.MEDIA_UPLOAD_DIR || join(process.cwd(), 'uploads');
const SAFE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp', 'video/mpeg', 'video/x-matroska',
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/amr', 'audio/3gpp',
  'application/pdf',
  'application/octet-stream',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const SAFE_GENERIC_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif',
  '.mp4', '.webm', '.mov', '.3gp', '.mpeg', '.mpg', '.mkv',
  '.mp3', '.m4a', '.aac', '.ogg', '.wav', '.amr',
  '.pdf', '.txt', '.csv', '.json', '.zip',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
]);

function extensionFor(mime: string, originalName = '') {
  const original = extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const allowedByMime: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
    'image/heic': ['.heic'],
    'image/heif': ['.heif'],
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
    'video/3gpp': ['.3gp'],
    'video/mpeg': ['.mpeg', '.mpg'],
    'video/x-matroska': ['.mkv'],
    'audio/mpeg': ['.mp3'],
    'audio/mp3': ['.mp3'],
    'audio/mp4': ['.m4a', '.mp4'],
    'audio/aac': ['.aac', '.m4a'],
    'audio/webm': ['.webm'],
    'audio/ogg': ['.ogg'],
    'audio/wav': ['.wav'],
    'audio/x-m4a': ['.m4a'],
    'audio/amr': ['.amr'],
    'audio/3gpp': ['.3gp'],
    'application/pdf': ['.pdf'],
    'application/octet-stream': [...SAFE_GENERIC_EXTENSIONS],
    'text/plain': ['.txt'],
    'text/csv': ['.csv'],
    'application/json': ['.json'],
    'application/zip': ['.zip'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-powerpoint': ['.ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  };
  const allowed = allowedByMime[mime] ?? [];
  if (original && allowed.includes(original)) return original;
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/heic') return '.heic';
  if (mime === 'image/heif') return '.heif';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/quicktime') return '.mov';
  if (mime === 'video/3gpp') return '.3gp';
  if (mime === 'video/mpeg') return '.mpeg';
  if (mime === 'video/x-matroska') return '.mkv';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return '.mp3';
  if (mime === 'audio/mp4' || mime === 'audio/aac' || mime === 'audio/x-m4a') return '.m4a';
  if (mime === 'audio/webm') return '.webm';
  if (mime === 'audio/ogg') return '.ogg';
  if (mime === 'audio/wav') return '.wav';
  if (mime === 'audio/amr') return '.amr';
  if (mime === 'audio/3gpp') return '.3gp';
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'application/octet-stream' && original && SAFE_GENERIC_EXTENSIONS.has(original)) return original;
  if (mime === 'text/plain') return '.txt';
  if (mime === 'text/csv') return '.csv';
  if (mime === 'application/json') return '.json';
  if (mime === 'application/zip') return '.zip';
  if (mime === 'application/msword') return '.doc';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
  if (mime === 'application/vnd.ms-excel') return '.xls';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return '.xlsx';
  if (mime === 'application/vnd.ms-powerpoint') return '.ppt';
  if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return '.pptx';
  return '.bin';
}

function publicBase() {
  return (
    process.env.PUBLIC_MEDIA_BASE_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    'https://api-messenger.oracle-plus.online'
  ).replace(/\/+$/, '');
}

@Injectable()
export class MediaService {
  async saveDataUrl(input: { dataUrl: string; name?: string; mime?: string; kind?: string }, userId: string) {
    const match = String(input.dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) throw new BadRequestException('Média invalide.');

    const mime = String(input.mime || match[1] || 'application/octet-stream').toLowerCase();
    if (!SAFE_MIME.has(mime)) throw new BadRequestException('Type de fichier non autorisé.');

    const base64 = match[2].replace(/\s/g, '');
    const byteEstimate = Math.floor((base64.length * 3) / 4);
    if (byteEstimate <= 0) throw new BadRequestException('Fichier vide.');
    if (byteEstimate > MEDIA_UPLOAD_MAX_BYTES) throw new BadRequestException('Fichier trop lourd.');

    const buffer = Buffer.from(base64, 'base64');
    return this.saveBuffer({
      buffer,
      name: input.name,
      mime,
      kind: input.kind,
    }, userId);
  }

  async saveBuffer(input: { buffer: Buffer; name?: string; mime?: string; kind?: string }, userId: string) {
    const mime = String(input.mime || 'application/octet-stream').toLowerCase();
    if (!SAFE_MIME.has(mime)) throw new BadRequestException('Type de fichier non autorisé.');
    if (!input.buffer?.length) throw new BadRequestException('Fichier vide.');
    if (input.buffer.length > MEDIA_UPLOAD_MAX_BYTES) throw new BadRequestException('Fichier trop lourd.');
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    const relDir = `${yyyy}/${mm}/${safeUser}`;
    const absDir = join(DEFAULT_UPLOAD_ROOT, relDir);
    await mkdir(absDir, { recursive: true });

    const ext = extensionFor(mime, input.name);
    const filename = `${randomUUID()}${ext}`;
    const absPath = join(absDir, filename);
    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    await writeFile(absPath, input.buffer);

    const path = `/uploads/${relDir}/${filename}`;
    return {
      url: `${publicBase()}${path}`,
      path,
      mime,
      size: input.buffer.length,
      checksum,
      name: input.name || filename,
      kind: input.kind || 'file',
    };
  }
}
