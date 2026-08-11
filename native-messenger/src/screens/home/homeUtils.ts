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
  { code: 'DZ', name: 'Algérie', dial: '+213', flag: '🇩🇿' },
  { code: 'AO', name: 'Angola', dial: '+244', flag: '🇦🇴' },
  { code: 'BJ', name: 'Bénin', dial: '+229', flag: '🇧🇯' },
  { code: 'BF', name: 'Burkina Faso', dial: '+226', flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi', dial: '+257', flag: '🇧🇮' },
  { code: 'CM', name: 'Cameroun', dial: '+237', flag: '🇨🇲' },
  { code: 'CV', name: 'Cap-Vert', dial: '+238', flag: '🇨🇻' },
  { code: 'CF', name: 'Centrafrique', dial: '+236', flag: '🇨🇫' },
  { code: 'KM', name: 'Comores', dial: '+269', flag: '🇰🇲' },
  { code: 'CG', name: 'Congo', dial: '+242', flag: '🇨🇬' },
  { code: 'CD', name: 'Congo (RDC)', dial: '+243', flag: '🇨🇩' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '+225', flag: '🇨🇮' },
  { code: 'DJ', name: 'Djibouti', dial: '+253', flag: '🇩🇯' },
  { code: 'EG', name: 'Égypte', dial: '+20', flag: '🇪🇬' },
  { code: 'ER', name: 'Érythrée', dial: '+291', flag: '🇪🇷' },
  { code: 'ET', name: 'Éthiopie', dial: '+251', flag: '🇪🇹' },
  { code: 'GA', name: 'Gabon', dial: '+241', flag: '🇬🇦' },
  { code: 'GM', name: 'Gambie', dial: '+220', flag: '🇬🇲' },
  { code: 'GH', name: 'Ghana', dial: '+233', flag: '🇬🇭' },
  { code: 'GN', name: 'Guinée', dial: '+224', flag: '🇬🇳' },
  { code: 'GQ', name: 'Guinée éq.', dial: '+240', flag: '🇬🇶' },
  { code: 'GW', name: 'Guinée-Bissau', dial: '+245', flag: '🇬🇼' },
  { code: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { code: 'LS', name: 'Lesotho', dial: '+266', flag: '🇱🇸' },
  { code: 'LR', name: 'Libéria', dial: '+231', flag: '🇱🇷' },
  { code: 'LY', name: 'Libye', dial: '+218', flag: '🇱🇾' },
  { code: 'MG', name: 'Madagascar', dial: '+261', flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi', dial: '+265', flag: '🇲🇼' },
  { code: 'ML', name: 'Mali', dial: '+223', flag: '🇲🇱' },
  { code: 'MR', name: 'Mauritanie', dial: '+222', flag: '🇲🇷' },
  { code: 'MU', name: 'Maurice', dial: '+230', flag: '🇲🇺' },
  { code: 'MA', name: 'Maroc', dial: '+212', flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique', dial: '+258', flag: '🇲🇿' },
  { code: 'NA', name: 'Namibie', dial: '+264', flag: '🇳🇦' },
  { code: 'NE', name: 'Niger', dial: '+227', flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { code: 'RW', name: 'Rwanda', dial: '+250', flag: '🇷🇼' },
  { code: 'ST', name: 'São Tomé', dial: '+239', flag: '🇸🇹' },
  { code: 'SN', name: 'Sénégal', dial: '+221', flag: '🇸🇳' },
  { code: 'SL', name: 'Sierra Leone', dial: '+232', flag: '🇸🇱' },
  { code: 'SO', name: 'Somalie', dial: '+252', flag: '🇸🇴' },
  { code: 'ZA', name: 'Afrique du Sud', dial: '+27', flag: '🇿🇦' },
  { code: 'SS', name: 'Soudan du Sud', dial: '+211', flag: '🇸🇸' },
  { code: 'SD', name: 'Soudan', dial: '+249', flag: '🇸🇩' },
  { code: 'SZ', name: 'Eswatini', dial: '+268', flag: '🇸🇿' },
  { code: 'TZ', name: 'Tanzanie', dial: '+255', flag: '🇹🇿' },
  { code: 'TD', name: 'Tchad', dial: '+235', flag: '🇹🇩' },
  { code: 'TG', name: 'Togo', dial: '+228', flag: '🇹🇬' },
  { code: 'TN', name: 'Tunisie', dial: '+216', flag: '🇹🇳' },
  { code: 'UG', name: 'Ouganda', dial: '+256', flag: '🇺🇬' },
  { code: 'ZM', name: 'Zambie', dial: '+260', flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe', dial: '+263', flag: '🇿🇼' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'BE', name: 'Belgique', dial: '+32', flag: '🇧🇪' },
  { code: 'CH', name: 'Suisse', dial: '+41', flag: '🇨🇭' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'US', name: 'États-Unis', dial: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'Royaume-Uni', dial: '+44', flag: '🇬🇧' },
  { code: 'DE', name: 'Allemagne', dial: '+49', flag: '🇩🇪' },
  { code: 'IT', name: 'Italie', dial: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Espagne', dial: '+34', flag: '🇪🇸' },
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { code: 'NL', name: 'Pays-Bas', dial: '+31', flag: '🇳🇱' },
  { code: 'SE', name: 'Suède', dial: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norvège', dial: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Danemark', dial: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finlande', dial: '+358', flag: '🇫🇮' },
  { code: 'PL', name: 'Pologne', dial: '+48', flag: '🇵🇱' },
  { code: 'RO', name: 'Roumanie', dial: '+40', flag: '🇷🇴' },
  { code: 'RU', name: 'Russie', dial: '+7', flag: '🇷🇺' },
  { code: 'UA', name: 'Ukraine', dial: '+380', flag: '🇺🇦' },
  { code: 'TR', name: 'Turquie', dial: '+90', flag: '🇹🇷' },
  { code: 'SA', name: 'Arabie Saoudite', dial: '+966', flag: '🇸🇦' },
  { code: 'AE', name: 'Émirats arabes', dial: '+971', flag: '🇦🇪' },
  { code: 'QA', name: 'Qatar', dial: '+974', flag: '🇶🇦' },
  { code: 'KW', name: 'Koweït', dial: '+965', flag: '🇰🇼' },
  { code: 'LB', name: 'Liban', dial: '+961', flag: '🇱🇧' },
  { code: 'JO', name: 'Jordanie', dial: '+962', flag: '🇯🇴' },
  { code: 'IQ', name: 'Irak', dial: '+964', flag: '🇮🇶' },
  { code: 'IR', name: 'Iran', dial: '+98', flag: '🇮🇷' },
  { code: 'IL', name: 'Israël', dial: '+972', flag: '🇮🇱' },
  { code: 'IN', name: 'Inde', dial: '+91', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', dial: '+92', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', dial: '+880', flag: '🇧🇩' },
  { code: 'LK', name: 'Sri Lanka', dial: '+94', flag: '🇱🇰' },
  { code: 'NP', name: 'Népal', dial: '+977', flag: '🇳🇵' },
  { code: 'CN', name: 'Chine', dial: '+86', flag: '🇨🇳' },
  { code: 'JP', name: 'Japon', dial: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'Corée du Sud', dial: '+82', flag: '🇰🇷' },
  { code: 'TW', name: 'Taïwan', dial: '+886', flag: '🇹🇼' },
  { code: 'VN', name: 'Vietnam', dial: '+84', flag: '🇻🇳' },
  { code: 'TH', name: 'Thaïlande', dial: '+66', flag: '🇹🇭' },
  { code: 'MY', name: 'Malaisie', dial: '+60', flag: '🇲🇾' },
  { code: 'ID', name: 'Indonésie', dial: '+62', flag: '🇮🇩' },
  { code: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭' },
  { code: 'SG', name: 'Singapour', dial: '+65', flag: '🇸🇬' },
  { code: 'AU', name: 'Australie', dial: '+61', flag: '🇦🇺' },
  { code: 'NZ', name: 'Nouvelle-Zél.', dial: '+64', flag: '🇳🇿' },
  { code: 'BR', name: 'Brésil', dial: '+55', flag: '🇧🇷' },
  { code: 'AR', name: 'Argentine', dial: '+54', flag: '🇦🇷' },
  { code: 'CL', name: 'Chili', dial: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombie', dial: '+57', flag: '🇨🇴' },
  { code: 'PE', name: 'Pérou', dial: '+51', flag: '🇵🇪' },
  { code: 'VE', name: 'Venezuela', dial: '+58', flag: '🇻🇪' },
  { code: 'MX', name: 'Mexique', dial: '+52', flag: '🇲🇽' },
  { code: 'HT', name: 'Haïti', dial: '+509', flag: '🇭🇹' },
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
