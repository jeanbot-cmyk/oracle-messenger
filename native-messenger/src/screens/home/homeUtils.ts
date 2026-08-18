import { ensureNativeSocket } from '@/services/nativeSocket';
import { BACKEND_URL } from '@/config/env';
import type { Conversation, Message } from '@/types/messenger';

export type Country = { code: string; name: string; dial: string; flag: string };
export type PaystackScope = 'ai' | 'flyer' | 'video' | 'business' | 'conference' | 'conference-book';
export type MediaPayload = {
  url?: string;
  localUri?: string;
  size?: number;
  checksum?: string;
  mime?: string;
  name?: string;
  caption?: string;
  emoji?: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
  albumId?: string;
  albumIndex?: number;
  albumCount?: number;
  waveform?: number[];
  uploadState?: 'uploading' | 'failed' | 'complete';
  uploadProgress?: number;
  uploadError?: string;
};
export type ContactPayload = { name: string; phone?: string; email?: string; username?: string; avatar?: string; url?: string };
export type CallTraceStatus = 'missed' | 'refused' | 'cancelled' | 'ended' | 'unknown';
export type CallTraceMessage = {
  type: 'audio' | 'video';
  status: CallTraceStatus;
  label: string;
  actionLabel: string;
  durationLabel?: string;
};

export const OFFICIAL_CONVERSATION_NAME = 'O.Messenger';
export const OFFICIAL_CONVERSATION_AVATAR = '/icons/oracle-system-avatar.svg';
const OFFICIAL_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const MESSAGE_STATUS_RANK: Record<string, number> = {
  failed: 0,
  error: 0,
  sending: 1,
  pending: 1,
  queued: 1,
  uploading: 1,
  sent: 2,
  delivered: 3,
  received: 3,
  read: 4,
  seen: 4,
};

export function initials(name?: string | null) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

const TEXT_LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{2,5})?(?:\/[^\s<>()]*)?)/gi;

export type TextLinkPart = {
  text: string;
  link: boolean;
};

function trimTrailingLinkPunctuation(value: string) {
  return value.replace(/[.,!?;:)\]}]+$/u, '');
}

export function normalizeTextLinkUrl(rawUrl: string) {
  const cleanUrl = trimTrailingLinkPunctuation(String(rawUrl || '').trim());
  if (/^https?:\/\//i.test(cleanUrl)) return cleanUrl;
  return `https://${cleanUrl.replace(/^www\./i, 'www.')}`;
}

export function splitTextLinks(text: string): TextLinkPart[] {
  const parts: TextLinkPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TEXT_LINK_PATTERN)) {
    const raw = match[0];
    const index = match.index || 0;
    const previous = index > 0 ? text[index - 1] : '';
    const protocolOrWww = /^(https?:\/\/|www\.)/i.test(raw);
    if (!protocolOrWww && /[\w@.-]/.test(previous)) continue;

    const clean = trimTrailingLinkPunctuation(raw);
    if (!clean) continue;
    if (index > cursor) parts.push({ text: text.slice(cursor, index), link: false });
    parts.push({ text: clean, link: true });
    const trailing = raw.slice(clean.length);
    if (trailing) parts.push({ text: trailing, link: false });
    cursor = index + raw.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), link: false });
  if (!parts.length) parts.push({ text, link: false });
  return parts;
}

export function isOfficialConversation(conversation?: Conversation | null) {
  return Boolean(conversation?.isOfficial || conversation?.type === 'official');
}

function dateTime(value?: string | Date | null) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function officialExpirationBelongsToLastMessage(conversation: Conversation) {
  const expiry = dateTime(conversation.officialExpiresAt);
  const lastMessageAt = dateTime(conversation.lastMessage?.createdAt);
  if (expiry === null || lastMessageAt === null) return false;
  const inferredReadAt = expiry - OFFICIAL_MESSAGE_TTL_MS;
  return inferredReadAt >= lastMessageAt;
}

export function normalizeOfficialExpiration(conversation: Conversation) {
  if (!isOfficialConversation(conversation)) return conversation;
  if ((conversation.unreadCount ?? 0) > 0) return { ...conversation, officialExpiresAt: null, isPinned: true };
  if (!conversation.officialExpiresAt) return { ...conversation, isPinned: true };
  if (!officialExpirationBelongsToLastMessage(conversation)) return { ...conversation, officialExpiresAt: null, isPinned: true };
  return { ...conversation, isPinned: true };
}

export function isOfficialExpired(conversation: Conversation) {
  const normalized = normalizeOfficialExpiration(conversation);
  if (!isOfficialConversation(normalized)) return false;
  if ((normalized.unreadCount ?? 0) > 0) return false;
  if (!normalized.officialExpiresAt) return false;
  const expiry = dateTime(normalized.officialExpiresAt);
  return expiry !== null && expiry <= Date.now();
}

export function sortConversations(items: Conversation[]) {
  return [...items].map(normalizeOfficialExpiration).filter(item => !isOfficialExpired(item)).sort((left, right) => {
    const leftPinned = Boolean(left.isPinned);
    const rightPinned = Boolean(right.isPinned);
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
    const leftTime = new Date(left.updatedAt || left.lastMessage?.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.lastMessage?.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

export function markConversationReadLocally(conversation: Conversation) {
  if (!isOfficialConversation(conversation)) return { ...conversation, unreadCount: 0 };
  if (officialExpirationBelongsToLastMessage(conversation)) {
    return {
      ...conversation,
      unreadCount: 0,
      isPinned: true,
      officialState: conversation.officialState ? { ...conversation.officialState, unread: false } : conversation.officialState,
    };
  }
  if (!conversation.lastMessage?.createdAt) return { ...conversation, unreadCount: 0, isPinned: true };
  const openedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OFFICIAL_MESSAGE_TTL_MS).toISOString();
  return {
    ...conversation,
    unreadCount: 0,
    isPinned: true,
    officialOpenedAt: openedAt,
    officialExpiresAt: expiresAt,
    officialState: {
      received: true,
      unread: false,
      opened_at: openedAt,
      expires_at: expiresAt,
      openedAt,
      expiresAt,
    },
  };
}

export function conversationName(conversation: Conversation) {
  if (isOfficialConversation(conversation)) return OFFICIAL_CONVERSATION_NAME;
  return conversation.name || conversation.participants?.[0]?.name || 'Conversation';
}

export function conversationAvatar(conversation?: Conversation | null) {
  if (!conversation) return null;
  if (isOfficialConversation(conversation)) return conversation.avatar || OFFICIAL_CONVERSATION_AVATAR;
  if (conversation.type === 'group' || conversation.type === 'official') return conversation.avatar || null;
  return conversation.participants?.[0]?.avatar || conversation.avatar || null;
}

export function highQualityImageUri(uri?: string | null) {
  const raw = String(uri || '').trim();
  if (!raw) return null;
  if (/^\/uploads\//i.test(raw)) return `${BACKEND_URL}${raw}`;
  return raw
    .replace(/=s\d+(-c)?(?=$|[&#?])/i, '=s1024-c')
    .replace(/\/s\d+(-c)?\//i, '/s1024-c/')
    .replace(/([?&]sz=)\d+/i, '$11024');
}

export function fastAvatarUri(uri?: string | null) {
  const raw = String(uri || '').trim();
  if (!raw) return null;
  if (/^\/uploads\//i.test(raw)) return `${BACKEND_URL}${raw}`;
  return raw
    .replace(/=s\d+(-c)?(?=$|[&#?])/i, '=s160-c')
    .replace(/\/s\d+(-c)?\//i, '/s160-c/')
    .replace(/([?&]sz=)\d+/i, '$1160');
}

export function normalizedMediaUri(uri?: string | null) {
  const raw = String(uri || '').trim();
  if (!raw) return undefined;
  if (/^\/(?:uploads|media|files)\//i.test(raw)) return `${BACKEND_URL}${raw}`;
  return raw;
}

export function messagePreview(message?: Message | null) {
  if (!message) return 'Aucun message';
  if (message.isDeleted) return 'Message supprimé';
  const callTrace = message.type === 'text' ? parseCallTraceMessage(message.content) : null;
  if (callTrace) return ['missed', 'refused', 'cancelled'].includes(callTrace.status) ? `🚫 ${callTrace.label}` : callTrace.label;
  if (message.type === 'system') return message.content || 'Événement de groupe';
  if (message.type === 'text') {
    const payload = parseMediaPayload(message.content);
    if (payload?.url) return mediaPreviewLabel(payload, message.content, 'Fichier');
    return message.content;
  }
  if (message.type === 'contact') {
    const contact = parseContactPayload(message.content);
    return contact.name || contact.username || 'Contact';
  }
  const payload = parseMediaPayload(message.content);
  if (message.type === 'image') return mediaPreviewLabel(payload, message.content, 'Image');
  if (message.type === 'gif') return mediaPreviewLabel(payload, message.content, 'GIF');
  if (message.type === 'sticker') return payload?.emoji || mediaPreviewLabel(payload, message.content, 'Sticker');
  if (message.type === 'video') return mediaPreviewLabel(payload, message.content, 'Vidéo');
  if (message.type === 'audio' || message.type === 'voice') return mediaPreviewLabel(payload, message.content, 'Note vocale');
  return mediaPreviewLabel(payload, message.content, 'Fichier');
}

function mediaPreviewLabel(payload: MediaPayload | null | undefined, rawContent: string | null | undefined, fallback: string) {
  const name = mediaPreviewName(payload, rawContent);
  if (!name) return fallback;
  if (isTechnicalMediaName(name)) return fallback;
  if (fallback !== 'Fichier') return fallback;
  return name;
}

function mediaPreviewName(payload?: MediaPayload | null, rawContent?: string | null) {
  const direct = payload?.name?.trim();
  if (direct) return direct;
  const fromUrl = payload?.url ? basenameFromUri(payload.url) : '';
  if (fromUrl) return fromUrl;
  const raw = String(rawContent || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.includes('/')) return basenameFromUri(raw);
  return raw.startsWith('{') ? '' : raw;
}

export function isTechnicalMediaName(value?: string | null) {
  const clean = String(value || '').trim();
  if (!clean) return true;
  const withoutExt = clean.replace(/\.[a-z0-9]{1,8}$/i, '');
  if (/^[0-9a-f]{16,}$/i.test(withoutExt)) return true;
  if (/^[0-9]{8,}$/.test(withoutExt)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(withoutExt)) return true;
  if (/^(image|media|file|upload|oracle-media|broadcast)-[0-9]+(?:-[a-z0-9]+)?$/i.test(withoutExt)) return true;
  return false;
}

function basenameFromUri(value: string) {
  const clean = value.split('?')[0]?.split('#')[0] || '';
  const last = clean.split('/').filter(Boolean).pop() || '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function parseMediaPayload(content?: string | null): MediaPayload | null {
  if (!content) return null;
  const raw = String(content).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const url = [
      parsed.url,
      parsed.mediaUrl,
      parsed.fileUrl,
      parsed.downloadUrl,
      parsed.localUri,
      parsed.path,
      parsed.uri,
    ].find(value => typeof value === 'string' && value.trim()) as string | undefined;
    const emoji = typeof parsed.emoji === 'string' ? parsed.emoji.trim().slice(0, 12) : '';
    if (!url && !emoji && !parsed.uploadState && !parsed.mime && !parsed.albumId) return null;
    return {
      url: normalizedMediaUri(url),
      localUri: typeof parsed.localUri === 'string' ? parsed.localUri : undefined,
      size: typeof parsed.size === 'number' ? parsed.size : undefined,
      checksum: typeof parsed.checksum === 'string' ? parsed.checksum : undefined,
      mime: typeof parsed.mime === 'string' ? parsed.mime : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      caption: typeof parsed.caption === 'string' ? parsed.caption.trim() : undefined,
      emoji: emoji || undefined,
      thumbnail: typeof parsed.thumbnail === 'string' ? normalizedMediaUri(parsed.thumbnail) : undefined,
      duration: typeof parsed.duration === 'number' ? parsed.duration : undefined,
      width: typeof parsed.width === 'number' ? parsed.width : undefined,
      height: typeof parsed.height === 'number' ? parsed.height : undefined,
      albumId: typeof parsed.albumId === 'string' ? parsed.albumId.trim() : undefined,
      albumIndex: typeof parsed.albumIndex === 'number' ? parsed.albumIndex : undefined,
      albumCount: typeof parsed.albumCount === 'number' ? parsed.albumCount : undefined,
      waveform: Array.isArray(parsed.waveform) ? parsed.waveform.filter((value: unknown): value is number => typeof value === 'number') : undefined,
      uploadState: ['uploading', 'failed', 'complete'].includes(String(parsed.uploadState)) ? parsed.uploadState : undefined,
      uploadProgress: typeof parsed.uploadProgress === 'number' ? Math.max(0, Math.min(100, parsed.uploadProgress)) : undefined,
      uploadError: typeof parsed.uploadError === 'string' ? parsed.uploadError.trim().slice(0, 140) : undefined,
    };
  } catch {
    if (/^(https?:\/\/|file:\/\/|content:\/\/|\/uploads\/)/i.test(raw)) return { url: normalizedMediaUri(raw) };
    return null;
  }
}

export function parseContactPayload(content?: string | null): ContactPayload {
  const raw = String(content || '').trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
        phone: typeof parsed.phone === 'string' ? parsed.phone.trim() : '',
        email: typeof parsed.email === 'string' ? parsed.email.trim() : '',
        username: typeof parsed.username === 'string' ? parsed.username.trim() : '',
        avatar: typeof parsed.avatar === 'string' ? parsed.avatar.trim() : '',
        url: typeof parsed.url === 'string' ? parsed.url.trim() : '',
      };
    }
  } catch {}
  return { name: raw, phone: '', email: '', username: '', avatar: '', url: '' };
}

export function formatBytes(value?: number) {
  if (!value || value <= 0) return 'taille inconnue';
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

export function parseCallTraceMessage(content?: string | null): CallTraceMessage | null {
  const value = String(content ?? '').trim();
  if (!value) return null;
  const withoutIcon = value.replace(/^[^A-Za-zÀ-ÿ0-9]+/u, '').trim();
  if (!/^Appel\s+(audio|vid[ée]o)\b/i.test(withoutIcon)) return null;
  const type = /Appel\s+vid[ée]o/i.test(withoutIcon) ? 'video' : 'audio';
  const status: CallTraceStatus = /manqu/i.test(withoutIcon)
    ? 'missed'
    : /refus/i.test(withoutIcon)
      ? 'refused'
      : /annul/i.test(withoutIcon)
        ? 'cancelled'
        : /termin/i.test(withoutIcon)
          ? 'ended'
          : 'unknown';
  const durationLabel = withoutIcon.includes('·') ? withoutIcon.split('·').slice(1).join('·').trim() : undefined;
  return {
    type,
    status,
    label: withoutIcon,
    actionLabel: type === 'video' ? 'Rappeler en vidéo' : 'Rappeler en audio',
    durationLabel,
  };
}

export function normalizeMessageStatus(status?: string | null) {
  const value = String(status || 'sent').toLowerCase().trim();
  if (value === 'seen') return 'read';
  if (value === 'received') return 'delivered';
  if (['pending', 'sending', 'queued', 'uploading'].includes(value)) return 'sending';
  if (['failed', 'error'].includes(value)) return 'failed';
  if (['sent', 'delivered', 'read'].includes(value)) return value;
  return 'sent';
}

export function mergeMessageStatus(current?: string | null, incoming?: string | null) {
  const currentStatus = normalizeMessageStatus(current);
  const incomingStatus = normalizeMessageStatus(incoming);
  const currentRank = MESSAGE_STATUS_RANK[currentStatus] ?? 0;
  const incomingRank = MESSAGE_STATUS_RANK[incomingStatus] ?? 0;
  return incomingRank >= currentRank ? incomingStatus : currentStatus;
}

function isValidMessageDate(value?: string | null) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function isOptimisticLocalMessage(message: Pick<Message, 'id' | 'clientMessageId'>) {
  return message.id.startsWith('local-') || Boolean(message.clientMessageId?.startsWith('local-'));
}

export function mergeMessageCreatedAt(current: Message, incomingCreatedAt?: string | null): string {
  if (isOptimisticLocalMessage(current) && isValidMessageDate(current.createdAt)) {
    return current.createdAt;
  }
  if (incomingCreatedAt && isValidMessageDate(incomingCreatedAt)) return incomingCreatedAt;
  return isValidMessageDate(current.createdAt) ? current.createdAt : new Date().toISOString();
}

export function mergeMessagePatch(current: Message, patch: Partial<Message>) {
  const next: Message = { ...current, ...patch };
  next.createdAt = mergeMessageCreatedAt(current, patch.createdAt);
  if (patch.status !== undefined) {
    next.status = mergeMessageStatus(current.status, patch.status);
  }
  return next;
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

function waitForSocketReady(socket: ReturnType<typeof ensureNativeSocket>, timeoutMs: number) {
  if (socket.connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Temps réel indisponible.'));
    }, Math.max(1500, timeoutMs));
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      // Socket.IO peut recevoir plusieurs erreurs pendant la reconnexion.
      // On laisse le délai décider pour ne pas échouer trop tôt sur réseau mobile.
    };
    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
    if (!socket.connected) socket.connect();
  });
}

export async function socketAck<T>(socket: ReturnType<typeof ensureNativeSocket>, event: string, payload: unknown, timeoutMs = 15000): Promise<T> {
  await waitForSocketReady(socket, Math.min(8500, Math.max(1500, timeoutMs - 2500)));
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
  if (!reference || !['ai', 'flyer', 'video', 'business', 'conference', 'conference-book'].includes(scope || '')) return null;
  return { scope: scope as PaystackScope, reference };
}

export function parseConferenceDeepLink(url: string): { slug: string } | null {
  const raw = String(url || '').trim();
  let slug = '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'oraclemessenger:') {
      if (parsed.hostname.toLowerCase() === 'conference') {
        slug = parsed.pathname.replace(/^\/+/, '') || parsed.searchParams.get('slug') || '';
      } else {
        const match = parsed.pathname.match(/^\/conference\/([^/?#]+)/i);
        slug = match?.[1]?.trim() || parsed.searchParams.get('slug') || '';
      }
    } else if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      const match = parsed.pathname.match(/^\/conference\/([^/?#]+)/i);
      slug = match?.[1]?.trim() || '';
    } else {
      return null;
    }
  } catch {
    if (raw.startsWith('oraclemessenger://conference')) {
      slug = raw.replace(/^oraclemessenger:\/\/conference\/?/i, '').split(/[?#]/)[0]?.trim();
    } else {
      return null;
    }
  }
  if (!slug) return null;
  return { slug: decodeURIComponent(slug) };
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

function normalizeInviteUsername(value?: string | null) {
  const clean = String(value || '').trim().replace(/^@+/, '');
  if (!clean) return '';
  try {
    return decodeURIComponent(clean).replace(/^@+/, '').replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
  } catch {
    return clean.replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
  }
}

export function parseInviteTarget(input?: string | null): { username: string } | null {
  if (!input) return null;
  let raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith('/')) raw = `https://messenger.oracle-plus.online${raw}`;

  try {
    const parsed = new URL(raw);
    const queryUsername = normalizeInviteUsername(
      parsed.searchParams.get('from') ||
      parsed.searchParams.get('invite') ||
      parsed.searchParams.get('u') ||
      parsed.searchParams.get('username'),
    );
    if (queryUsername) return { username: queryUsername };

    const host = parsed.host.toLowerCase();
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (
      parsed.protocol === 'oraclemessenger:' &&
      (host === 'invite' || host === 'u') &&
      pathParts[0]
    ) {
      const username = normalizeInviteUsername(pathParts[0]);
      return username ? { username } : null;
    }
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      host === 'messenger.oracle-plus.online' &&
      pathParts[0] === 'u' &&
      pathParts[1]
    ) {
      const username = normalizeInviteUsername(pathParts[1]);
      return username ? { username } : null;
    }
  } catch {
    const username = normalizeInviteUsername(raw.replace(/^oraclemessenger:\/\/(invite|u)\/?/i, ''));
    return username ? { username } : null;
  }

  return null;
}
