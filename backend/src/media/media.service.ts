import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';

const MAX_UPLOAD_BYTES = Number(process.env.MEDIA_UPLOAD_MAX_BYTES || 18 * 1024 * 1024);
const DEFAULT_UPLOAD_ROOT = process.env.MEDIA_UPLOAD_DIR || join(process.cwd(), 'uploads');
const SAFE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function extensionFor(mime: string, originalName = '') {
  const original = extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const allowedByMime: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
    'audio/mpeg': ['.mp3'],
    'audio/mp3': ['.mp3'],
    'audio/mp4': ['.m4a', '.mp4'],
    'audio/aac': ['.aac', '.m4a'],
    'audio/webm': ['.webm'],
    'audio/ogg': ['.ogg'],
    'audio/wav': ['.wav'],
    'application/pdf': ['.pdf'],
    'text/plain': ['.txt'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  };
  const allowed = allowedByMime[mime] ?? [];
  if (original && allowed.includes(original)) return original;
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/quicktime') return '.mov';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return '.mp3';
  if (mime === 'audio/mp4' || mime === 'audio/aac') return '.m4a';
  if (mime === 'audio/webm') return '.webm';
  if (mime === 'audio/ogg') return '.ogg';
  if (mime === 'audio/wav') return '.wav';
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'text/plain') return '.txt';
  if (mime === 'application/msword') return '.doc';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
  if (mime === 'application/vnd.ms-excel') return '.xls';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return '.xlsx';
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
    if (byteEstimate > MAX_UPLOAD_BYTES) throw new BadRequestException('Fichier trop lourd.');

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
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_UPLOAD_BYTES) throw new BadRequestException('Fichier trop lourd.');
    await writeFile(absPath, buffer);

    const path = `/uploads/${relDir}/${filename}`;
    return {
      url: `${publicBase()}${path}`,
      path,
      mime,
      size: buffer.length,
      name: input.name || filename,
      kind: input.kind || 'file',
    };
  }
}
