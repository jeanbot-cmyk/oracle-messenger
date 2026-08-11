import { ensureNativeSocket } from '@/services/nativeSocket';
import type { Conversation, Message } from '@/types/messenger';

export type Country = { code: string; name: string; dial: string; flag: string };
export type PaystackScope = 'ai' | 'flyer' | 'video' | 'business';
export type MediaPayload = { url: string; size?: number; checksum?: string; mime?: string; name?: string };

export function initials(name?: string | null) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

export function conversationName(conversation: Conversation) {
  return conversation.name || conversation.participants?.[0]?.name || 'Conversation';
}

export function messagePreview(message?: Message | null) {
  if (!message) return 'Aucun message';
  if (message.isDeleted) return 'Message supprimé';
  if (message.type === 'text') return message.content;
  const payload = parseMediaPayload(message.content);
  if (message.type === 'image') return payload?.name || 'Image';
  if (message.type === 'video') return payload?.name || 'Vidéo';
  if (message.type === 'audio' || message.type === 'voice') return payload?.name || 'Note vocale';
  return payload?.name || 'Fichier';
}

export function parseMediaPayload(content?: string | null): MediaPayload | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') return null;
    const url = typeof parsed.url === 'string' ? parsed.url : '';
    if (!url) return null;
    return {
      url,
      size: typeof parsed.size === 'number' ? parsed.size : undefined,
      checksum: typeof parsed.checksum === 'string' ? parsed.checksum : undefined,
      mime: typeof parsed.mime === 'string' ? parsed.mime : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
    };
  } catch {
    return null;
  }
}

export function formatBytes(value?: number) {
  if (!value || value <= 0) return 'taille inconnue';
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

export function sortMessages(items: Message[]) {
  return [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export const COUNTRIES: Country[] = [
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225', flag: 'CI' },
  { code: 'CM', name: 'Cameroun', dial: '+237', flag: 'CM' },
  { code: 'SN', name: 'Sénégal', dial: '+221', flag: 'SN' },
  { code: 'ML', name: 'Mali', dial: '+223', flag: 'ML' },
  { code: 'BF', name: 'Burkina Faso', dial: '+226', flag: 'BF' },
  { code: 'GN', name: 'Guinée', dial: '+224', flag: 'GN' },
  { code: 'TG', name: 'Togo', dial: '+228', flag: 'TG' },
  { code: 'BJ', name: 'Bénin', dial: '+229', flag: 'BJ' },
  { code: 'NE', name: 'Niger', dial: '+227', flag: 'NE' },
  { code: 'CD', name: 'Congo RDC', dial: '+243', flag: 'CD' },
  { code: 'CG', name: 'Congo', dial: '+242', flag: 'CG' },
  { code: 'GA', name: 'Gabon', dial: '+241', flag: 'GA' },
  { code: 'GH', name: 'Ghana', dial: '+233', flag: 'GH' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: 'NG' },
  { code: 'MA', name: 'Maroc', dial: '+212', flag: 'MA' },
  { code: 'DZ', name: 'Algérie', dial: '+213', flag: 'DZ' },
  { code: 'TN', name: 'Tunisie', dial: '+216', flag: 'TN' },
  { code: 'FR', name: 'France', dial: '+33', flag: 'FR' },
  { code: 'BE', name: 'Belgique', dial: '+32', flag: 'BE' },
  { code: 'CH', name: 'Suisse', dial: '+41', flag: 'CH' },
  { code: 'US', name: 'États-Unis', dial: '+1', flag: 'US' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: 'CA' },
  { code: 'GB', name: 'Royaume-Uni', dial: '+44', flag: 'GB' },
].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export function normalizeOnboardingPhone(country: Country, rawPhone: string) {
  const digits = rawPhone.replace(/\D/g, '');
  const dialDigits = country.dial.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith(dialDigits) ? `+${digits}` : `${country.dial}${digits}`;
}

export function socketAck<T>(socket: ReturnType<typeof ensureNativeSocket>, event: string, payload: unknown, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error: Error | null, response: T) => {
      if (error) reject(new Error('Temps réel indisponible.'));
      else resolve(response);
    });
  });
}

export function parsePaystackDeepLink(url: string): { scope: PaystackScope; reference: string } | null {
  if (!url.startsWith('oraclemessenger://paystack')) return null;
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const scope = params.get('scope');
  const reference = params.get('reference');
  if (!reference || !['ai', 'flyer', 'video', 'business'].includes(scope || '')) return null;
  return { scope: scope as PaystackScope, reference };
}

export function parseCallActionDeepLink(url: string): { action: 'accept' | 'reject' | 'open'; callId?: string | null; conversationId?: string | null } | null {
  if (!url.startsWith('oraclemessenger://call')) return null;
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const action = params.get('action') || 'open';
  if (!['accept', 'reject', 'open'].includes(action)) return null;
  return {
    action: action as 'accept' | 'reject' | 'open',
    callId: params.get('callId'),
    conversationId: params.get('conversationId') || params.get('conv'),
  };
}

export function parseConversationTarget(input?: string | null): { conversationId: string; callId?: string | null } | null {
  if (!input) return null;
  const raw = input.startsWith('oraclemessenger://') ? input : `oraclemessenger://notification${input.startsWith('/') ? input : `/${input}`}`;
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const conversationId = params.get('conv') || params.get('conversationId');
  if (!conversationId) return null;
  return { conversationId, callId: params.get('call') || params.get('callId') };
}
