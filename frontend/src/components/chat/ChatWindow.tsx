'use client';
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useChatStore } from '../../store/chat';
import { useSocket } from '../../hooks/useSocket';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { api } from '../../lib/api';
import { MessageBubble } from './MessageBubble';
import { MediaLightbox } from '../ui/MediaLightbox';
import { CameraCapture } from '../ui/CameraCapture';
import type { Conversation, Message, User } from '../../types';
import { normalizeSearchValue } from '../../lib/search';
import { confirmAction, notify } from '../../lib/feedback';

// ── Emoji picker léger (sans dépendance externe) ─────────────────────────────
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'] },
  { label: '👋', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸'] },
  { label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫'] },
  { label: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'] },
  { label: '🍎', emojis: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','☕','🍵','🫖','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽️','🥢','🧂'] },
  { label: '⚽', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰','🧩'] },
  { label: '🚗', emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🛥️','🛳️','⛴️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🪐','🌍','🌎','🌏','🌐','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🎠','🛝','🎡','🎢','💈','🎪'] },
];

function parseAttachmentPayload(content?: string) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') return parsed;
  } catch {}
  return null;
}

function attachmentUrl(content?: string) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) return '';
  const parsed = parseAttachmentPayload(trimmed);
  if (parsed?.url) return String(parsed.url).trim();
  return trimmed;
}

function messagePreview(message?: Message | null) {
  const lang = useSettings.getState().lang;
  if (!message) return '';
  if (message.isDeleted) return t(lang, 'chat.deleted');
  const src = attachmentUrl(message.content);
  if (message.type === 'image' || src.startsWith('data:image')) return t(lang, 'common.photo');
  if (message.type === 'video' || src.startsWith('data:video')) return t(lang, 'common.video');
  if (message.type === 'audio' || src.startsWith('data:audio')) return t(lang, 'common.audio');
  if (message.type === 'file' || message.type === 'document' || src.startsWith('data:')) return t(lang, 'common.file');
  return message.content;
}

function withCount(template: string, count: number) {
  return template.replace('{count}', String(count)).replaceAll('{plural}', count > 1 ? 's' : '');
}

interface LocalForwardContact { name?: string; phones?: string[]; emails?: string[]; avatar?: string | null }

type ForwardTarget = {
  key: string;
  kind: 'conversation' | 'user';
  label: string;
  avatar?: string;
  subtitle: string;
  conversationId?: string;
  userId?: string;
};

const CONTACT_CACHE_BASE_KEYS = ['oracle-contacts', 'oracle-manual-contacts'];
const HIDDEN_MESSAGES_PREFIX = 'oracle-messenger-hidden-messages:';
const BUSINESS_ASSISTANT_PREFIX = 'oracle-business-assistant:';

function VerifiedSeal({ size = 20 }: { size?: number }) {
  const px = `${size}px`;
  return (
    <span title="Compte officiel certifié" style={{ width:px, minWidth:px, maxWidth:px, height:px, minHeight:px, maxHeight:px, display:'inline-flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto', lineHeight:0, aspectRatio:'1 / 1', overflow:'visible' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ width:px, minWidth:px, maxWidth:px, height:px, minHeight:px, maxHeight:px, display:'block', flex:'0 0 auto', aspectRatio:'1 / 1', filter:'drop-shadow(0 1px 2px rgba(15,23,42,.22))' }}>
        <path
          fill="#1D9BF0"
          d="M12 1.15l1.55 1.72 2.18-.79.92 2.12 2.31.06.06 2.31 2.12.92-.79 2.18L22.07 12l-1.72 1.55.79 2.18-2.12.92-.06 2.31-2.31.06-.92 2.12-2.18-.79L12 22.07l-1.55-1.72-2.18.79-.92-2.12-2.31-.06-.06-2.31-2.12-.92.79-2.18L1.93 12l1.72-1.55-.79-2.18 2.12-.92.06-2.31 2.31-.06.92-2.12 2.18.79L12 1.15z"
        />
        <path d="M7.1 12.25l3.05 3.05 6.75-6.85" fill="none" stroke="#fff" strokeWidth="2.55" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function setNativeSecureProfile(enabled: boolean) {
  try {
    const bridge = (window as any).OracleAndroid;
    const fn = bridge?.setSecureProfileViewer;
    if (typeof fn === 'function') fn.call(bridge, enabled);
  } catch {}
}

function readStoredContactPhones(userId: string) {
  const phones = new Set<string>();
  if (!userId) return [];
  for (const baseKey of CONTACT_CACHE_BASE_KEYS) {
    const key = `${baseKey}:${userId}`;
    try {
      const contacts: LocalForwardContact[] = JSON.parse(localStorage.getItem(key) ?? '[]');
      contacts.forEach(contact => (contact.phones ?? []).forEach(phone => {
        if (phone?.trim()) phones.add(phone.trim());
      }));
    } catch {}
  }
  return [...phones];
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function phoneHashesForForward(phones: string[]) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return [];
  const variants = new Set<string>();
  for (const phone of phones) {
    const raw = phone.trim();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) continue;
    const localWithoutLeadingZero = digits.replace(/^0+/, '');
    if (raw.startsWith('+')) variants.add(`+${digits}`);
    if (raw.startsWith('00')) variants.add(`+${digits.slice(2)}`);
    variants.add(digits);
    variants.add(digits.slice(-8));
    if (digits.length >= 9) variants.add(digits.slice(-9));
    if (localWithoutLeadingZero.length >= 8) variants.add(localWithoutLeadingZero.slice(-8));
    if (localWithoutLeadingZero.length >= 9) variants.add(localWithoutLeadingZero.slice(-9));
  }
  return Promise.all([...variants].map(value => sha256(value)));
}

function readHiddenMessageIds(conversationId: string) {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = localStorage.getItem(`${HIDDEN_MESSAGES_PREFIX}${conversationId}`);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function writeHiddenMessageIds(conversationId: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${HIDDEN_MESSAGES_PREFIX}${conversationId}`, JSON.stringify([...ids]));
  } catch {}
}

type BusinessStatus = 'nouveau' | 'chaud' | 'froid' | 'payé' | 'vip' | 'relancer';

interface BusinessClientCard {
  conversationId: string;
  status: BusinessStatus;
  value: number;
  notes: string;
  reminderAt: string;
  interests: string;
  updatedAt: string;
}

const BUSINESS_STATUS_META: Record<BusinessStatus, { label: string; bg: string; color: string }> = {
  nouveau: { label: 'Nouveau', bg: '#EAF4F1', color: '#0F766E' },
  chaud: { label: 'Chaud', bg: '#FEF3C7', color: '#B45309' },
  froid: { label: 'Froid', bg: '#E0F2FE', color: '#0369A1' },
  payé: { label: 'Payé', bg: '#DCFCE7', color: '#15803D' },
  vip: { label: 'VIP', bg: '#F5E8FF', color: '#7E22CE' },
  relancer: { label: 'Relancer', bg: '#FFE4E6', color: '#BE123C' },
};

function emptyBusinessCard(conversationId: string): BusinessClientCard {
  return {
    conversationId,
    status: 'nouveau',
    value: 0,
    notes: '',
    reminderAt: '',
    interests: '',
    updatedAt: new Date().toISOString(),
  };
}

function readBusinessCards(userId: string) {
  if (typeof window === 'undefined' || !userId) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(`${BUSINESS_ASSISTANT_PREFIX}${userId}`) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, BusinessClientCard> : {};
  } catch {
    return {};
  }
}

function writeBusinessCards(userId: string, cards: Record<string, BusinessClientCard>) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.setItem(`${BUSINESS_ASSISTANT_PREFIX}${userId}`, JSON.stringify(cards));
  } catch {}
}

function messageTextForAssistant(message: Message) {
  if (message.isDeleted || message.type !== 'text') return '';
  return (message.content ?? '').trim();
}

function summarizeConversationForBusiness(messages: Message[], contactName: string) {
  const textMessages = messages
    .map(messageTextForAssistant)
    .filter(Boolean)
    .slice(-12);
  if (!textMessages.length) return `Résumé ${contactName} : aucun message texte exploitable pour le moment.`;
  const latest = textMessages.slice(-4).join(' / ');
  return `Résumé ${contactName} : derniers points à retenir - ${latest}`;
}

function professionalReplyDraft(contactName: string, card: BusinessClientCard) {
  const status = BUSINESS_STATUS_META[card.status].label.toLowerCase();
  const interest = card.interests.trim();
  const paymentLine = card.value > 0 ? ` Le montant prévu est de ${card.value.toLocaleString('fr-FR')} €. ` : ' ';
  return `Bonjour ${contactName}, merci pour votre message. Je reviens vers vous avec une réponse claire concernant ${interest || 'votre demande'}.${paymentLine}Je reste disponible pour avancer avec vous.`;
}

function followUpDraft(contactName: string, card: BusinessClientCard) {
  const interest = card.interests.trim();
  return `Bonjour ${contactName}, je me permets de vous relancer concernant ${interest || 'notre échange'}. Dites-moi si vous souhaitez continuer, je peux vous accompagner étape par étape.`;
}

function paymentDraft(contactName: string, card: BusinessClientCard) {
  const amount = card.value > 0 ? ` de ${card.value.toLocaleString('fr-FR')} €` : '';
  return `Bonjour ${contactName}, voici le rappel de paiement${amount}. Dès confirmation, je vous envoie la suite des informations.`;
}

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState(0);
  const [search, setSearch] = useState('');
  const filtered = search
    ? EMOJI_CATEGORIES.flatMap(c => c.emojis).filter(e => e.includes(search))
    : EMOJI_CATEGORIES[cat].emojis;
  return (
    <div
      className="om-emoji-picker"
      style={{ position:'absolute', bottom:'100%', left:0, right:0, background:'#fff', borderRadius:'16px 16px 0 0', boxShadow:'0 -4px 24px rgba(0,0,0,0.15)', zIndex:200, height:'min(42dvh, 330px)', maxHeight:'calc(100dvh - 170px)', display:'flex', flexDirection:'column', overflow:'hidden', overscrollBehavior:'contain' }}
    >
      {/* Search */}
      <div style={{ padding:'10px 12px 6px', borderBottom:'1px solid var(--bg-input)', flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un emoji…"
          style={{ flex:1, minWidth:0, border:'1px solid var(--border)', borderRadius:20, padding:'8px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
        <button
          onClick={onClose}
          aria-label={t(useSettings.getState().lang, 'common.close')}
          style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'1px solid var(--border)', background:'#F8FAFC', color:'var(--text-primary)', fontSize:20, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
        >
          ×
        </button>
      </div>
      {/* Category tabs */}
      {!search && (
        <div style={{ display:'flex', overflowX:'auto', padding:'6px 8px', gap:4, borderBottom:'1px solid var(--bg-input)', flexShrink:0 }}>
          {EMOJI_CATEGORIES.map((c, i) => (
            <button key={i} onClick={() => setCat(i)}
              style={{ border:'none', background: cat===i ? '#e8f5f3' : 'transparent', borderRadius:8, padding:'4px 8px', fontSize:18, cursor:'pointer', flexShrink:0 }}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {/* Grid */}
      <div style={{ overflowY:'auto', padding:'8px 10px 12px', display:'grid', gridTemplateColumns:'repeat(8, minmax(0, 1fr))', gap:4, flex:1, minHeight:0, overscrollBehavior:'contain', WebkitOverflowScrolling:'touch' }}>
        {filtered.map((e, i) => (
          <button key={i} type="button" onClick={() => onSelect(e)}
            style={{ border:'none', background:'transparent', fontSize:24, cursor:'pointer', padding:'6px 0', borderRadius:8, lineHeight:1, minWidth:0, aspectRatio:'1 / 1', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ChatWindowProps {
  onStartCall?: (conversationId: string, targetUserIds: string[], type: 'audio' | 'video') => void;
  onBack?: () => void; // mobile: back to conversation list
}

export function ChatWindow({ onStartCall, onBack }: ChatWindowProps) {
  const { data: session } = useSession();
  const token = session?.user?.backendToken ?? '';
  const userId = session?.user?.id ?? '';
  const { lang } = useSettings();

  const { activeConvId, conversations, messages, typingUsers, typingNames: typingNamesStore, onlineUsers, setConversations, setMessages, markRead, loadLocalMessages, removeConversation, blockedUserIds, blockUser, unblockUser } = useChatStore();
  const { joinConversation, sendTyping, sendMessage, deleteMessage: deleteSocketMessage, editMessage: editSocketMessage, markRead: emitRead, reactToMessage, confirmMediaSavedForMessages } = useSocket();

  const [input, setInput]         = useState('');
  const [replyTo, setReplyTo]     = useState<Message | null>(null);
  const [editMsg, setEditMsg]     = useState<Message | null>(null);
  const [sending, setSending]     = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [profileModal, setProfileModal]     = useState(false);
  const [avatarLightbox, setAvatarLightbox] = useState(false);
  const [showCamera, setShowCamera]         = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAiComposer, setShowAiComposer] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiComposerError, setAiComposerError] = useState('');
  const [callNotice, setCallNotice] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [forwardTargets, setForwardTargets] = useState<string[]>([]);
  const [forwardUsers, setForwardUsers] = useState<User[]>([]);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwarding, setForwarding] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(new Set());
  const [showBusinessAssistant, setShowBusinessAssistant] = useState(false);
  const [businessCards, setBusinessCards] = useState<Record<string, BusinessClientCard>>({});
  // Audio recording
  const [recording, setRecording]   = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [voiceDraft, setVoiceDraft] = useState<{ dataUrl: string; seconds: number } | null>(null);
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const audioChunks  = useRef<Blob[]>([]);
  const recTimer     = useRef<NodeJS.Timeout | null>(null);
  const recSecondsRef = useRef(0);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!profileModal) {
      setNativeSecureProfile(false);
      return;
    }
    setNativeSecureProfile(true);
    return () => setNativeSecureProfile(false);
  }, [profileModal]);

  const initialScrollPending = useRef(false);
  const isNearBottomRef = useRef(true);
  const prevConvRef = useRef<string | null>(null);
  const prevMsgCountRef = useRef(0);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const conv = conversations.find(c => c.id === activeConvId);
  const rawConvMessages = activeConvId
    ? [...(messages[activeConvId] ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];
  const convMessages = rawConvMessages.filter(message => !hiddenMessageIds.has(message.id));
  const typingIds = activeConvId ? (typingUsers[activeConvId] ?? []) : [];
  const storedNames = activeConvId ? (typingNamesStore[activeConvId] ?? {}) : {};
  // Resolve typing user IDs to names: prefer participant list, fallback to server-sent name
  const allParticipants = conv?.participants ?? [];
  const typingNames = typingIds
    .filter(id => id !== userId)
    .map(id => allParticipants.find(p => p.id === id)?.name ?? storedNames[id] ?? 'Quelqu\'un');
  const isOfficialConversation = Boolean((conv as any)?.isOfficial || conv?.type === 'official');
  const other = conv?.participants?.[0];
  const isBlockedDirect = Boolean(!isOfficialConversation && conv?.type !== 'group' && other?.id && blockedUserIds.has(other.id));
  const isOnline = !isOfficialConversation && other && onlineUsers.has(other.id);
  const searchNeedle = normalizeSearchValue(messageSearch);
  const searchMatches = searchNeedle
    ? convMessages.filter(msg =>
        !msg.isDeleted &&
        msg.type === 'text' &&
        normalizeSearchValue(msg.content).includes(searchNeedle)
      )
    : [];
  const activeSearchMessage = searchMatches[activeSearchIndex]?.id ?? '';
  const selectedMessages = convMessages.filter(msg => selectedMessageIds.includes(msg.id) && !msg.isDeleted);
  const selectionMode = selectedMessageIds.length > 0;
  const selectedTextMessages = selectedMessages.filter(message => message.type === 'text' && (message.content ?? '').trim());
  const canEditSelected = selectedMessages.length === 1 && selectedMessages[0]?.senderId === userId && selectedMessages[0]?.type === 'text';
  const businessCard = activeConvId ? (businessCards[activeConvId] ?? emptyBusinessCard(activeConvId)) : null;
  const mediaSummary = convMessages.reduce(
    (acc, message) => {
      if (message.isDeleted) return acc;
      if (message.type === 'image') acc.images += 1;
      else if (message.type === 'video') acc.videos += 1;
      else if (message.type === 'audio' || message.type === 'voice') acc.audios += 1;
      else if (message.type === 'file' || message.type === 'document') acc.documents += 1;
      return acc;
    },
    { images: 0, videos: 0, audios: 0, documents: 0 },
  );

  useEffect(() => {
    if (!userId) return;
    setBusinessCards(readBusinessCards(userId));
  }, [userId]);

  function updateBusinessCard(patch: Partial<BusinessClientCard>) {
    if (!activeConvId || !userId) return;
    setBusinessCards(current => {
      const previous = current[activeConvId] ?? emptyBusinessCard(activeConvId);
      const next = {
        ...previous,
        ...patch,
        conversationId: activeConvId,
        updatedAt: new Date().toISOString(),
      };
      const updated = { ...current, [activeConvId]: next };
      writeBusinessCards(userId, updated);
      return updated;
    });
  }

  useEffect(() => {
    if (!activeConvId || !isOfficialConversation || !conv?.officialExpiresAt || (conv.unreadCount ?? 0) > 0) return;
    const expiresAt = new Date(conv.officialExpiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      removeConversation(activeConvId);
      return;
    }
    const timer = window.setTimeout(() => removeConversation(activeConvId), delay);
    return () => window.clearTimeout(timer);
  }, [activeConvId, isOfficialConversation, conv?.officialExpiresAt, conv?.unreadCount, removeConversation]);

  useEffect(() => {
    setReplyTo(null);
    setEditMsg(null);
    setShowMessageSearch(false);
    setMessageSearch('');
    setActiveSearchIndex(0);
    setSelectedMessageIds([]);
    setForwardMessages([]);
    setForwardTargets([]);
    setForwardSearch('');
    setHiddenMessageIds(activeConvId ? readHiddenMessageIds(activeConvId) : new Set());
    if (!activeConvId || !token) return;
    initialScrollPending.current = true;
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    loadLocalMessages(activeConvId);
    joinConversation(activeConvId);
    emitRead(activeConvId);
    api.messages.list(activeConvId, token)
      .then(msgs => {
        setMessages(activeConvId, msgs);
        confirmMediaSavedForMessages(msgs);
        markRead(activeConvId);
        emitRead(activeConvId);
      })
      .catch(error => {
        if (String(error?.message || error).includes('404')) removeConversation(activeConvId);
      });
  }, [activeConvId, token]);

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [messageSearch, activeConvId]);

  useEffect(() => {
    if (!activeSearchMessage) return;
    messageRefs.current[activeSearchMessage]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeSearchMessage]);

  useEffect(() => {
    if (forwardMessages.length === 0 || !token) return;
    let cancelled = false;
    async function loadForwardUsers() {
      const byId = new Map<string, User>();
      try {
        const phones = readStoredContactPhones(userId);
        const hashes = await phoneHashesForForward(phones);
        if (hashes.length) {
          const matched = await api.users.matchByPhoneHashes(hashes, token).catch(() => []);
          matched.forEach((user: User) => {
            if (user.id && user.id !== userId) byId.set(user.id, user);
          });
        }
      } catch {}
      if (!cancelled) setForwardUsers([...byId.values()]);
    }
    loadForwardUsers();
    return () => { cancelled = true; };
  }, [forwardMessages.length, token, userId]);

  function isNearBottom(el: HTMLDivElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function scrollMessagesToBottom(behavior: ScrollBehavior = 'auto') {
    const el = messagesViewportRef.current;
    if (!el) return;
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTo({ top, behavior });
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }

  function scheduleScrollToBottom(behavior: ScrollBehavior = 'auto', delay = 0) {
    window.setTimeout(() => {
      requestAnimationFrame(() => scrollMessagesToBottom(behavior));
    }, delay);
  }

  function handleMessagesScroll() {
    const el = messagesViewportRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    isNearBottomRef.current = near;
    if (near) setShowJumpToLatest(false);
  }

  useLayoutEffect(() => {
    if (!activeConvId) return;
    const count = convMessages.length;
    const convChanged = prevConvRef.current !== activeConvId;
    const previousCount = convChanged ? 0 : prevMsgCountRef.current;
    const shouldInitialScroll = convChanged || initialScrollPending.current;
    prevConvRef.current = activeConvId;
    prevMsgCountRef.current = count;

    requestAnimationFrame(() => {
      if (shouldInitialScroll) {
        scrollMessagesToBottom('auto');
        if (count > 0) initialScrollPending.current = false;
        return;
      }
      if (count > previousCount) {
        scrollMessagesToBottom('smooth');
      }
    });
  }, [convMessages.length, activeConvId]);

  useLayoutEffect(() => {
    if (!activeConvId || convMessages.length === 0) return;
    scheduleScrollToBottom('auto', 40);
  }, [activeConvId, convMessages[convMessages.length - 1]?.id, convMessages[convMessages.length - 1]?.updatedAt, convMessages[convMessages.length - 1]?.status]);

  useEffect(() => {
    if (!activeConvId) return;
    const viewport = window.visualViewport;
    const handleResize = () => scheduleScrollToBottom('auto', 80);
    window.addEventListener('resize', handleResize);
    viewport?.addEventListener('resize', handleResize);
    viewport?.addEventListener('scroll', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      viewport?.removeEventListener('resize', handleResize);
      viewport?.removeEventListener('scroll', handleResize);
    };
  }, [activeConvId]);

  useEffect(() => {
    if (!activeConvId || convMessages.length === 0) return;
    const last = convMessages[convMessages.length - 1];
    if (last.senderId !== userId) {
      markRead(activeConvId);
      emitRead(activeConvId, last.id);
    }
  }, [activeConvId, convMessages.length, userId]);

  function formatDateSeparator(dateValue: string) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.round((startToday - startDate) / 86400000);
    if (dayDiff === 0) return t(lang, 'common.today');
    if (dayDiff === 1) return t(lang, 'common.yesterday');
    return date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : undefined, { weekday: 'long', day: '2-digit', month: 'long', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }

  function shouldShowDateSeparator(current: Message, previous?: Message) {
    if (!previous) return true;
    const currentDate = new Date(current.createdAt);
    const previousDate = new Date(previous.createdAt);
    return currentDate.toDateString() !== previousDate.toDateString();
  }

  function handleInputChange(val: string) {
    setInput(val);
    if (!activeConvId) return;
    sendTyping(activeConvId, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTyping(activeConvId, false), 2000);
  }

  function resizeTextarea(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  function insertTextAtCursor(text: string) {
    if (!text) return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const next = `${input.slice(0, start)}${text}${input.slice(end)}`;
    handleInputChange(next);
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) return;
      const cursor = start + text.length;
      target.focus();
      target.setSelectionRange(cursor, cursor);
      resizeTextarea(target);
    });
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    e.preventDefault();
    insertTextAtCursor(text);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard?.readText?.();
      if (!text) {
        setCallNotice('Aucun texte trouvé dans le presse-papiers.');
        setTimeout(() => setCallNotice(''), 2500);
        return;
      }
      insertTextAtCursor(text);
    } catch {
      setCallNotice('Appuie longuement dans la zone de message puis choisis Coller.');
      setTimeout(() => setCallNotice(''), 3500);
    }
  }

  function latestIncomingText() {
    return [...convMessages]
      .reverse()
      .find(message => message.senderId !== userId && message.type === 'text' && !message.isDeleted && (message.content ?? '').trim())
      ?.content
      ?.trim() ?? '';
  }

  async function generateAiReplyDraft() {
    if (!token) {
      setAiComposerError('Connexion requise pour utiliser l’IA.');
      return;
    }
    const incoming = latestIncomingText() || input.trim();
    if (!incoming) {
      setAiComposerError('Aucun message texte à analyser. Écrivez une demande ou attendez un message client.');
      return;
    }
    setAiGenerating(true);
    setAiComposerError('');
    try {
      const data = await api.aiAuto.test(token, incoming, 'conversation');
      setInput(data.response);
      setShowAiComposer(false);
      showNotice('Réponse IA préparée. Vérifiez avant d’envoyer.');
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        resizeTextarea(textareaRef.current);
      });
    } catch (error: any) {
      const message = error?.message || 'Réponse IA indisponible.';
      setAiComposerError(message);
      if (message.includes('5 messages IA gratuits') || message.includes('Paystack')) {
        showNotice('Crédit IA terminé. Ouverture du paiement Gemini.', 2200);
        window.setTimeout(() => { window.location.href = '/tools?tab=ai'; }, 900);
      }
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || !activeConvId || sending) return;
    if (isBlockedDirect) {
      notify('Ce contact est bloqué. Débloquez-le pour envoyer un message.', 'info');
      return;
    }
    setInput('');
    setShowEmoji(false);
    setSending(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    sendTyping(activeConvId, false);
    if (editMsg) {
      editSocketMessage(editMsg.id, content);
      setEditMsg(null);
    } else {
      sendMessage(activeConvId, content, 'text', replyTo?.id, replyTo);
      setReplyTo(null);
    }
    scheduleScrollToBottom('smooth', 30);
    setSending(false);
  }

  function shareMyOracleContact() {
    if (!activeConvId) return;
    const sessionUser = session?.user as any;
    const username = String(sessionUser?.username || '').trim();
    const payload = {
      name: String(sessionUser?.name || 'Contact Oracle Messenger').trim(),
      phone: String(sessionUser?.phone || '').trim(),
      email: String(sessionUser?.email || '').trim(),
      username,
      avatar: String(sessionUser?.image || '').trim(),
      url: username ? `/u/${encodeURIComponent(username)}` : '/profile',
    };
    sendMessage(activeConvId, JSON.stringify(payload), 'contact');
    scheduleScrollToBottom('smooth', 30);
    showNotice('Contact Oracle Messenger partagé.');
  }

  async function uploadMediaForMessage(
    dataUrl: string,
    type: 'image' | 'video' | 'audio' | 'file',
    meta?: { name?: string; size?: number; mime?: string; width?: number; height?: number; duration?: number; thumbnail?: string; waveform?: number[] },
  ) {
    if (!token) throw new Error('Session expirée');
    const uploaded = await api.media.upload(token, {
      dataUrl,
      name: meta?.name,
      mime: meta?.mime,
      kind: type,
    });
    return JSON.stringify({
      url: uploaded.url,
      name: meta?.name || uploaded.name,
      size: meta?.size ?? uploaded.size,
      mime: meta?.mime || uploaded.mime,
      width: meta?.width,
      height: meta?.height,
      duration: meta?.duration,
      thumbnail: meta?.thumbnail && meta.thumbnail.length < 12_000 ? meta.thumbnail : undefined,
      waveform: meta?.waveform,
    });
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function imageToElement(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function imageThumbnail(dataUrl: string, maxSide = 220) {
    const img = await imageToElement(dataUrl);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.58);
  }

  function mediaElementMetadata(file: File): Promise<{ duration?: number; width?: number; height?: number; thumbnail?: string }> {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      const el = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
      el.preload = 'metadata';
      el.muted = true;
      const done = (value: { duration?: number; width?: number; height?: number; thumbnail?: string }) => {
        URL.revokeObjectURL(url);
        resolve(value);
      };
      el.onerror = () => done({});
      el.onloadedmetadata = () => {
        const duration = Number.isFinite(el.duration) ? Math.max(1, Math.round(el.duration)) : undefined;
        if (!isVideo) return done({ duration });
        const video = el as HTMLVideoElement;
        const capture = () => {
          try {
            const width = video.videoWidth || undefined;
            const height = video.videoHeight || undefined;
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 240 / Math.max(width || 1, height || 1));
            canvas.width = Math.max(1, Math.round((width || 1) * scale));
            canvas.height = Math.max(1, Math.round((height || 1) * scale));
            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
            done({ duration, width, height, thumbnail: canvas.toDataURL('image/jpeg', 0.55) });
          } catch {
            done({ duration, width: video.videoWidth || undefined, height: video.videoHeight || undefined });
          }
        };
        video.onseeked = capture;
        try {
          video.currentTime = Math.min(0.25, Math.max(0, (duration || 1) / 4));
        } catch {
          capture();
        }
      };
      el.src = url;
    });
  }

  function simpleWaveform(seed: string, bars = 36) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: bars }, (_, index) => {
      hash = (hash * 1664525 + 1013904223 + index) >>> 0;
      return 18 + (hash % 78);
    });
  }

  async function prepareImageForUpload(file: File) {
    if (file.type === 'image/gif') {
      const dataUrl = await readFileAsDataUrl(file);
      return { dataUrl, mime: file.type, size: file.size, thumbnail: dataUrl.length < 12_000 ? dataUrl : undefined };
    }

    const source = await readFileAsDataUrl(file);
    const img = await imageToElement(source);
    const maxSide = 2560;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    if (scale >= 1 && file.size <= 2.5 * 1024 * 1024) {
      return {
        dataUrl: source,
        mime: file.type || 'image/jpeg',
        size: file.size,
        width,
        height,
        thumbnail: await imageThumbnail(source).catch(() => undefined),
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl: source, mime: file.type || 'image/jpeg', size: file.size, width, height };
    ctx.drawImage(img, 0, 0, width, height);

    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const quality = mime === 'image/jpeg' ? 0.9 : undefined;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));
    if (!blob) return { dataUrl: source, mime: file.type || 'image/jpeg', size: file.size, width, height };
    const dataUrl = await readFileAsDataUrl(new File([blob], file.name, { type: mime }));
    return { dataUrl, mime, size: blob.size, width, height, thumbnail: await imageThumbnail(dataUrl).catch(() => undefined) };
  }

  function startConversationCall(type: 'audio' | 'video') {
    if (!conv || !onStartCall) return;
    if (isBlockedDirect) {
      notify('Ce contact est bloqué. Débloquez-le pour lancer un appel.', 'info');
      return;
    }
    if (isOfficialConversation) {
      notify('Le compte système ne peut pas être appelé.', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      notify('Ce navigateur ne permet pas les appels. Utilisez Chrome Android ou Safari iPhone à jour.', 'error');
      return;
    }
    const ids = conv.type === 'group'
      ? allParticipants.map((p: any) => p.id)
      : other ? [other.id] : [];
    if (!ids.length) {
      notify('Aucun destinataire disponible pour cet appel.', 'error');
      return;
    }
    setCallNotice('Garde l’application ouverte pendant l’appel. En veille, le téléphone peut seulement afficher une notification.');
    setTimeout(() => setCallNotice(''), 6500);
    onStartCall(conv.id, ids, type);
  }

  async function handleDelete(msgId: string) {
    if (!activeConvId) return;
    deleteSocketMessage(activeConvId, msgId);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConvId) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const maxBytes = (isImage ? 32 : 18) * 1024 * 1024;
    if (file.size > maxBytes) {
      notify(isImage ? 'Image trop lourde. Limite actuelle : 32 Mo avant compression.' : 'Fichier trop lourd. Limite actuelle : 18 Mo.', 'error');
      e.target.value = '';
      return;
    }
    (async () => {
      const type = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
      setMediaUploading(true);
      setCallNotice(t(lang, 'common.sending'));
      try {
        const prepared = isImage
          ? await prepareImageForUpload(file)
          : { dataUrl: await readFileAsDataUrl(file), mime: file.type || 'application/octet-stream', size: file.size };
        const mediaMeta: { duration?: number; width?: number; height?: number; thumbnail?: string } = !isImage && (isVideo || isAudio)
          ? await mediaElementMetadata(file).catch(() => ({}))
          : {};
        const content = await uploadMediaForMessage(prepared.dataUrl, type, {
          name: file.name,
          size: prepared.size,
          mime: prepared.mime,
          width: (prepared as any).width ?? mediaMeta.width,
          height: (prepared as any).height ?? mediaMeta.height,
          duration: mediaMeta.duration,
          thumbnail: (prepared as any).thumbnail ?? mediaMeta.thumbnail,
          waveform: isAudio ? simpleWaveform(`${file.name}:${file.size}:${file.lastModified}`) : undefined,
        });
        sendMessage(activeConvId, content, type);
      } catch {
        notify('Impossible d’envoyer ce média. Vérifiez la connexion puis réessayez.', 'error');
      } finally {
        setMediaUploading(false);
        setCallNotice('');
      }
    })();
    e.target.value = '';
  }

  // ── Audio recording ────────────────────────────────────────────────────────
  async function startRecording() {
    if (!activeConvId || recording || voiceDraft) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      const ua = navigator.userAgent;
      const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
      const mimeCandidates = isSafari
        ? ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
        : ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
      const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) ?? '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {});
      audioChunks.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const safeMime = (mr.mimeType || 'audio/webm').split(';')[0] || 'audio/webm';
        const blob = new Blob(audioChunks.current, { type: safeMime });
        const reader = new FileReader();
        const seconds = Math.max(1, recSecondsRef.current);
        reader.onload = () => setVoiceDraft({ dataUrl: reader.result as string, seconds });
        reader.readAsDataURL(blob);
        setRecording(false);
        setRecSeconds(0);
        recSecondsRef.current = 0;
        if (recTimer.current) clearInterval(recTimer.current);
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recSecondsRef.current = 0;
      recTimer.current = setInterval(() => {
        recSecondsRef.current += 1;
        setRecSeconds(recSecondsRef.current);
      }, 1000);
    } catch {
      notify('Microphone non disponible. Vérifiez les permissions.', 'error');
    }
  }

  function stopRecording() {
    mediaRecRef.current?.stop();
    if (recTimer.current) clearInterval(recTimer.current);
  }

  function cancelRecording() {
    if (mediaRecRef.current) {
      mediaRecRef.current.onstop = null;
      mediaRecRef.current.stop();
      mediaRecRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    if (recTimer.current) clearInterval(recTimer.current);
    setRecording(false);
    setRecSeconds(0);
    recSecondsRef.current = 0;
  }

  async function sendVoiceDraft() {
    if (!activeConvId || !voiceDraft) return;
    setMediaUploading(true);
    setCallNotice(t(lang, 'common.sending'));
    try {
      const content = await uploadMediaForMessage(voiceDraft.dataUrl, 'audio', {
        name: `vocal-${Date.now()}.webm`,
        mime: voiceDraft.dataUrl.match(/^data:([^;,]+)/)?.[1] || 'audio/webm',
        duration: voiceDraft.seconds,
        waveform: simpleWaveform(`${voiceDraft.dataUrl.length}:${voiceDraft.seconds}`),
      });
      sendMessage(activeConvId, content, 'audio');
      setVoiceDraft(null);
    } catch {
      notify('Impossible d’envoyer le vocal. Vérifiez la connexion puis réessayez.', 'error');
    } finally {
      setMediaUploading(false);
      setCallNotice('');
    }
  }

  function discardVoiceDraft() {
    setVoiceDraft(null);
  }

  const name = isOfficialConversation ? (conv?.name ?? 'Oracle Messenger') : conv?.type === 'group' ? conv.name : other?.name ?? t(lang, 'common.unknown');
  const businessContactName = name || t(lang, 'common.contact');
  const avatar = isOfficialConversation ? '/icons/oracle-system-avatar.svg' : conv?.type === 'group' ? conv.avatar : other?.avatar;
  const forwardConversations = conversations
    .filter(item => item.id !== activeConvId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const existingForwardUserIds = new Set(
    conversations
      .filter(item => item.type === 'direct')
      .map(item => item.participants.find(p => p.id !== userId)?.id)
      .filter(Boolean) as string[]
  );
  const forwardTargetList: ForwardTarget[] = [
    ...forwardConversations.map(item => ({
      key: `conversation:${item.id}`,
      kind: 'conversation' as const,
      label: conversationLabel(item),
      avatar: conversationAvatar(item),
      subtitle: item.lastMessage ? messagePreview(item.lastMessage) : item.type === 'group' ? t(lang, 'chat.groupOracle') : t(lang, 'chat.conversationOracle'),
      conversationId: item.id,
    })),
    ...forwardUsers
      .filter(user => !existingForwardUserIds.has(user.id))
      .map(user => ({
        key: `user:${user.id}`,
        kind: 'user' as const,
        label: user.name || user.username || t(lang, 'chat.contactOracle'),
        avatar: user.avatar,
        subtitle: user.phone ? `${t(lang, 'chat.contactOracle')} · ${user.phone}` : user.username ? `@${user.username}` : t(lang, 'chat.contactOracle'),
        userId: user.id,
      })),
  ];
  const forwardSearchNeedle = forwardSearch.trim().toLowerCase();
  const filteredForwardTargets = forwardSearchNeedle
    ? forwardTargetList.filter(target =>
        target.label.toLowerCase().includes(forwardSearchNeedle) ||
        target.subtitle.toLowerCase().includes(forwardSearchNeedle)
      )
    : forwardTargetList;

  function conversationLabel(item: Conversation) {
    if (item.type === 'group') return item.name || t(lang, 'chat.unnamedGroup');
    const participant = item.participants.find(p => p.id !== userId) ?? item.participants[0];
    return participant?.name || item.name || t(lang, 'common.contact');
  }

  function conversationAvatar(item: Conversation) {
    if (item.type === 'group') return item.avatar;
    const participant = item.participants.find(p => p.id !== userId) ?? item.participants[0];
    return participant?.avatar;
  }

  function showNotice(text: string, duration = 2600) {
    setCallNotice(text);
    setTimeout(() => setCallNotice(''), duration);
  }

  function toggleMessageSelection(message: Message) {
    if (message.isDeleted) return;
    setShowEmoji(false);
    setReplyTo(null);
    setEditMsg(null);
    setSelectedMessageIds(current => {
      if (current.includes(message.id)) return current.filter(id => id !== message.id);
      return [...current, message.id];
    });
  }

  function clearMessageSelection() {
    setSelectedMessageIds([]);
  }

  async function deleteSelectedMessages() {
    if (!activeConvId || selectedMessages.length === 0) return;
    const count = selectedMessages.length;
    const ok = await confirmAction(`${withCount(t(lang, 'chat.selectCount'), count)} ?`, 'Supprimer');
    if (!ok) return;
    const ids = selectedMessages.map(message => message.id);
    const nextHidden = new Set(hiddenMessageIds);
    ids.forEach(id => nextHidden.add(id));
    setHiddenMessageIds(nextHidden);
    writeHiddenMessageIds(activeConvId, nextHidden);

    selectedMessages
      .filter(message => message.senderId === userId)
      .forEach(message => deleteSocketMessage(activeConvId, message.id));

    setSelectedMessageIds([]);
    setReplyTo(null);
    setEditMsg(null);
    showNotice(withCount(t(lang, 'chat.messagesDeleted'), count));
  }

  function replyToSelectedMessage() {
    if (selectedMessages.length !== 1) return;
    setReplyTo(selectedMessages[0]);
    setEditMsg(null);
    setSelectedMessageIds([]);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function editSelectedMessage() {
    if (!canEditSelected) return;
    setEditMsg(selectedMessages[0]);
    setReplyTo(null);
    setInput(selectedMessages[0].content ?? '');
    setSelectedMessageIds([]);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      resizeTextarea(textareaRef.current as HTMLTextAreaElement);
    });
  }

  async function copySelectedMessages() {
    if (selectedTextMessages.length === 0) return;
    const text = selectedTextMessages.map(message => message.content).join('\n\n');
    try {
      await navigator.clipboard?.writeText(text);
      setSelectedMessageIds([]);
      showNotice(withCount(t(lang, 'chat.messagesCopied'), selectedTextMessages.length));
    } catch {
      showNotice(t(lang, 'chat.copyImpossible'));
    }
  }

  function openForwardSheet(message: Message) {
    if (message.isDeleted) return;
    setForwardMessages([message]);
    setForwardTargets([]);
    setForwardSearch('');
  }

  function openSelectedForwardSheet() {
    if (selectedMessages.length === 0) return;
    setForwardMessages(selectedMessages);
    setForwardTargets([]);
    setForwardSearch('');
  }

  function closeForwardSheet() {
    if (forwarding) return;
    setForwardMessages([]);
    setForwardTargets([]);
    setForwardSearch('');
  }

  function toggleForwardTarget(targetKey: string) {
    if (!forwardTargets.includes(targetKey) && forwardTargets.length >= 50) {
      showNotice('Maximum 50 contacts pour un transfert.');
      return;
    }
    setForwardTargets(current => {
      if (current.includes(targetKey)) {
        return current.filter(id => id !== targetKey);
      }
      return [...current, targetKey];
    });
  }

  async function forwardSelectedMessages() {
    if (forwardMessages.length === 0 || forwarding || forwardTargets.length === 0) return;
    const targets = forwardTargets.slice(0, 50);
    setForwarding(true);
    try {
      for (const targetKey of targets) {
        const target = forwardTargetList.find(item => item.key === targetKey);
        if (!target) continue;
        let conversationId = target.conversationId;
        if (!conversationId && target.userId && token) {
          const created = await api.conversations.create(target.userId, token);
          conversationId = created?.id;
          if (conversationId) {
            const normalized = {
              ...created,
              participants: Array.isArray(created.participants)
                ? created.participants
                : forwardUsers.find(user => user.id === target.userId)
                  ? [forwardUsers.find(user => user.id === target.userId) as User]
                  : [],
              unreadCount: created.unreadCount ?? 0,
              lastMessage: created.lastMessage ?? null,
            };
            const existing = useChatStore.getState().conversations;
            if (!existing.find(item => item.id === conversationId)) {
              setConversations([normalized, ...existing]);
            }
          }
        }
        if (!conversationId) continue;
        forwardMessages.forEach(message => {
          sendMessage(conversationId, message.content, message.type);
        });
      }
      const messageLabel = forwardMessages.length > 1 ? withCount(t(lang, 'chat.forwardedMany'), forwardMessages.length) : t(lang, 'chat.forwarded');
      showNotice(`${messageLabel} à ${targets.length} contact${targets.length > 1 ? 's' : ''}.`);
      setForwardMessages([]);
      setForwardTargets([]);
      setSelectedMessageIds([]);
      setForwardSearch('');
    } finally {
      setForwarding(false);
    }
  }

  if (!activeConvId || !conv) return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-elevated)', color:'var(--text-muted)', gap:16 }}>
      <div style={{ width:80, height:80, borderRadius:'50%', background:'var(--bg-input)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <p style={{ fontSize:14 }}>{t(lang,'chat.select')}</p>
    </div>
  );

  return (
    <div className="om-chat-window" style={{ flex:1, display:'flex', flexDirection:'column', height:'100%', minHeight:0, background:'var(--bg-elevated)', overflow:'hidden', position:'relative' }}>
      {/* Header */}
      <div className="om-chat-header" style={{ display:'flex', alignItems:'center', gap:9, padding:'calc(6px + env(safe-area-inset-top, 0px)) 10px 6px', minHeight:'calc(56px + env(safe-area-inset-top, 0px))', background:'var(--header-bg)', borderBottom:'1px solid rgba(0,0,0,0.08)', flexShrink:0, position:'sticky', top:0, zIndex:30 }}>
        {/* Back button — mobile only */}
        {onBack && (
          <button onClick={onBack}
            style={{ width:32, height:32, minHeight:32, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'#F8FAFC', flexShrink:0 }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
        )}
        {/* Avatar : simple clic → photo plein écran si disponible, sinon profil */}
        <button
          onClick={() => avatar ? setAvatarLightbox(true) : setProfileModal(true)}
          style={{ position:'relative', border:'none', background:'transparent', padding:0, cursor:'pointer', flexShrink:0 }}>
          <div className="om-chat-avatar" style={{ width:42, height:42, borderRadius:'50%', background:'#F8FAFC', border:'1.5px solid rgba(255,255,255,0.72)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
            {avatar ? <img src={avatar} alt={name??''} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} /> : (
              <span style={{ fontWeight:800, color:'var(--header-bg)', fontSize:18 }}>{(name??'?')[0].toUpperCase()}</span>
            )}
          </div>
          {isOnline && <span style={{ position:'absolute', bottom:1, right:1, width:11, height:11, background:'var(--online-dot)', borderRadius:'50%', border:'2px solid var(--header-bg)' }} />}
        </button>
        <button onClick={() => setProfileModal(true)}
          style={{ flex:1, border:'none', background:'transparent', cursor:'pointer', textAlign:'left', padding:0, minWidth:0 }}>
          <p className="om-chat-title" style={{ fontWeight:800, fontSize:16, lineHeight:1.08, color:'#FFFFFF', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:0, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ order:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
            {isOfficialConversation && (
              <span style={{ order:1, flex:'0 0 auto', display:'inline-flex', alignItems:'center' }}>
                <VerifiedSeal size={21} />
              </span>
            )}
          </p>
          <p className="om-chat-subtitle" style={{ fontSize:12, lineHeight:1.15, color: typingNames.length > 0 ? '#DDEFEA' : isOnline ? '#34D399' : 'rgba(255,255,255,0.62)', margin:'3px 0 0', fontWeight:600 }}>
            {isOfficialConversation
              ? 'Compte officiel certifié'
              : typingNames.length > 0
              ? typingNames.length === 1
                ? `${typingNames[0]} est en train d'écrire…`
                : `${typingNames.slice(0,-1).join(', ')} et ${typingNames[typingNames.length-1]} écrivent…`
              : isOnline ? t(lang,'chat.online') : t(lang,'chat.offline')}
          </p>
        </button>
        {/* Boutons appel */}
        {onStartCall && conv && !isOfficialConversation && (
          <>
            <button
              onClick={() => startConversationCall('audio')}
              className="om-chat-action"
              style={{ width:36, height:36, minHeight:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background:'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }} title={t(lang, 'chat.audioCall')}>
              <svg width="17" height="17" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
            </button>
            <button
              onClick={() => startConversationCall('video')}
              className="om-chat-action"
              style={{ width:36, height:36, minHeight:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background:'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }} title={t(lang, 'chat.videoCall')}>
              <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
              </svg>
            </button>
          </>
        )}
        {!isOfficialConversation && (
          <button
            onClick={() => setShowBusinessAssistant(v => !v)}
            className="om-chat-action"
            style={{ width:36, height:36, minHeight:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background: showBusinessAssistant ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }}
            title="Business Assistant"
            aria-label="Business Assistant"
          >
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V6a3 3 0 116 0v1m-9 4h12M5 7h14a2 2 0 012 2v8a3 3 0 01-3 3H6a3 3 0 01-3-3V9a2 2 0 012-2z"/>
            </svg>
          </button>
        )}
        <button
          onClick={() => setShowMessageSearch(v => !v)}
          className="om-chat-action"
          style={{ width:36, height:36, minHeight:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background: showMessageSearch ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }}
          title={t(lang, 'chat.searchInConversation')}
        >
          <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      {selectionMode && (
        <div className="om-selection-toolbar" style={{ flexShrink:0, background:'#F8FBF9', borderBottom:'1px solid rgba(16,42,42,0.08)', padding:'5px 8px', minHeight:48, display:'flex', alignItems:'center', gap:8, boxShadow:'0 1px 8px rgba(16,42,42,0.05)', zIndex:25 }}>
          <button
            onClick={clearMessageSelection}
            aria-label="Annuler la sélection"
            style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'none', background:'rgba(16,42,42,0.07)', color:'var(--header-bg)', cursor:'pointer', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, lineHeight:1 }}
          >
            ×
          </button>
          <div className="om-selection-copy" style={{ flex:'1 1 auto', minWidth:0 }}>
            <p style={{ margin:0, fontSize:15, lineHeight:1.16, fontWeight:900, color:'var(--header-bg)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {selectedMessages.length} sélectionné{selectedMessages.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="om-selection-actions" style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4, overflowX:'auto', flex:'0 0 auto', minWidth:0, paddingBottom:1 }}>
            <button
              onClick={replyToSelectedMessage}
              disabled={selectedMessages.length !== 1}
              title={t(lang, 'chat.reply')}
              aria-label={t(lang, 'chat.reply')}
              style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'none', background:selectedMessages.length === 1 ? '#FFFFFF' : 'rgba(16,42,42,0.05)', color:selectedMessages.length === 1 ? 'var(--header-bg)' : 'rgba(100,116,139,0.62)', cursor:selectedMessages.length === 1 ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto', boxShadow:selectedMessages.length === 1 ? '0 1px 4px rgba(15,23,42,0.07)' : 'none' }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 9V5l-7 7 7 7v-4c5.2 0 8.5 1.7 11 5-1-5.2-4.2-10-11-11z" />
              </svg>
            </button>
            <button
              onClick={copySelectedMessages}
              disabled={selectedTextMessages.length === 0}
              title={t(lang, 'chat.copy')}
              aria-label={t(lang, 'chat.copy')}
              style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'none', background:selectedTextMessages.length ? '#FFFFFF' : 'rgba(16,42,42,0.05)', color:selectedTextMessages.length ? 'var(--header-bg)' : 'rgba(100,116,139,0.62)', cursor:selectedTextMessages.length ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto', boxShadow:selectedTextMessages.length ? '0 1px 4px rgba(15,23,42,0.07)' : 'none' }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            <button
              onClick={editSelectedMessage}
              disabled={!canEditSelected}
              title={t(lang, 'chat.edit')}
              aria-label={t(lang, 'chat.edit')}
              style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'none', background:canEditSelected ? '#FFFFFF' : 'rgba(16,42,42,0.05)', color:canEditSelected ? 'var(--header-bg)' : 'rgba(100,116,139,0.62)', cursor:canEditSelected ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto', boxShadow:canEditSelected ? '0 1px 4px rgba(15,23,42,0.07)' : 'none' }}
            >
              <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
            <button
              onClick={deleteSelectedMessages}
              disabled={selectedMessages.length === 0}
              title={t(lang, 'chat.erase')}
              aria-label={t(lang, 'chat.erase')}
              style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'none', background:selectedMessages.length ? '#FFFFFF' : 'rgba(16,42,42,0.05)', color:selectedMessages.length ? '#dc2626' : 'rgba(100,116,139,0.62)', cursor:selectedMessages.length ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto', boxShadow:selectedMessages.length ? '0 1px 4px rgba(15,23,42,0.07)' : 'none' }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14M10 10v7m4-7v7" />
              </svg>
            </button>
            <button
              onClick={openSelectedForwardSheet}
              disabled={selectedMessages.length === 0}
              title={t(lang, 'chat.forward')}
              aria-label={t(lang, 'chat.forward')}
              style={{ width:36, height:36, minHeight:36, borderRadius:'50%', border:'none', background:selectedMessages.length ? 'var(--header-bg)' : 'rgba(16,42,42,0.10)', color:selectedMessages.length ? '#fff' : 'rgba(100,116,139,0.62)', cursor:selectedMessages.length ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto', boxShadow:selectedMessages.length ? '0 4px 12px rgba(16,42,42,0.17)' : 'none' }}
            >
              <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {showMessageSearch && !selectionMode && (
        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid var(--border)', padding:'8px 10px', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:8, background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:999, padding:'8px 12px' }}>
            <svg width="16" height="16" fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              value={messageSearch}
              onChange={e => setMessageSearch(e.target.value)}
              autoFocus
              placeholder={t(lang, 'chat.searchMessage')}
              style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--text-primary)' }}
            />
            {messageSearch && (
              <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:750, whiteSpace:'nowrap' }}>
                {searchMatches.length ? `${activeSearchIndex + 1}/${searchMatches.length}` : '0'}
              </span>
            )}
          </div>
          <button
            onClick={() => setActiveSearchIndex(i => searchMatches.length ? (i - 1 + searchMatches.length) % searchMatches.length : 0)}
            disabled={!searchMatches.length}
            style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', opacity: searchMatches.length ? 1 : 0.4, cursor: searchMatches.length ? 'pointer' : 'default' }}
            title={t(lang, 'chat.previousResult')}
          >
            ↑
          </button>
          <button
            onClick={() => setActiveSearchIndex(i => searchMatches.length ? (i + 1) % searchMatches.length : 0)}
            disabled={!searchMatches.length}
            style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', opacity: searchMatches.length ? 1 : 0.4, cursor: searchMatches.length ? 'pointer' : 'default' }}
            title={t(lang, 'chat.nextResult')}
          >
            ↓
          </button>
          <button
            onClick={() => { setShowMessageSearch(false); setMessageSearch(''); }}
            style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'none', background:'transparent', color:'var(--text-muted)', cursor:'pointer', fontSize:18 }}
            title={t(lang, 'common.close')}
          >
            ×
          </button>
        </div>
      )}

      {callNotice && (
        <div style={{ flexShrink:0, background:'#EAF4F1', borderBottom:'1px solid rgba(16,42,42,0.12)', color:'#102A2A', padding:'9px 14px', fontSize:12, lineHeight:1.4, fontWeight:750 }}>
          {callNotice}
        </div>
      )}

      {showBusinessAssistant && businessCard && !isOfficialConversation && (
        <div style={{ flexShrink:0, background:'#F8FBFA', borderBottom:'1px solid rgba(16,42,42,0.12)', padding:'10px 10px 12px', boxShadow:'0 8px 22px rgba(16,42,42,0.08)', zIndex:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ margin:0, fontSize:13, fontWeight:950, color:'#102A2A', letterSpacing:0 }}>O Messenger Business Assistant</p>
              <p style={{ margin:'2px 0 0', fontSize:11.5, fontWeight:700, color:'var(--text-muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                Fiche client intelligente pour {businessContactName}
              </p>
            </div>
            <button
              onClick={() => setShowBusinessAssistant(false)}
              style={{ width:30, height:30, minHeight:30, borderRadius:'50%', border:'1px solid var(--border)', background:'#fff', color:'var(--text-secondary)', cursor:'pointer', fontSize:18, lineHeight:1 }}
              aria-label="Fermer Business Assistant"
            >
              ×
            </button>
          </div>

          <div className="om-business-assistant-strip" style={{ display:'flex', gap:7, overflowX:'auto', paddingBottom:8, WebkitOverflowScrolling:'touch' }}>
            {(Object.keys(BUSINESS_STATUS_META) as BusinessStatus[]).map(status => {
              const meta = BUSINESS_STATUS_META[status];
              const active = businessCard.status === status;
              return (
                <button
                  key={status}
                  onClick={() => updateBusinessCard({ status })}
                  style={{ flex:'0 0 auto', border:'1px solid var(--border)', borderRadius:999, padding:'7px 11px', background:active ? meta.bg : '#fff', color:active ? meta.color : 'var(--text-secondary)', fontSize:12, fontWeight:900, cursor:'pointer' }}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 1fr) minmax(0, 1fr)', gap:8, marginBottom:8 }}>
            <label style={{ minWidth:0 }}>
              <span style={{ display:'block', fontSize:11, fontWeight:900, color:'var(--text-muted)', marginBottom:4 }}>Valeur estimée</span>
              <input
                inputMode="decimal"
                value={businessCard.value || ''}
                onChange={event => updateBusinessCard({ value: Number(event.target.value.replace(',', '.')) || 0 })}
                placeholder="0"
                style={{ width:'100%', minWidth:0, boxSizing:'border-box', border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', borderRadius:12, padding:'9px 10px', fontSize:13, fontWeight:800, outline:'none' }}
              />
            </label>
            <label style={{ minWidth:0 }}>
              <span style={{ display:'block', fontSize:11, fontWeight:900, color:'var(--text-muted)', marginBottom:4 }}>Prochaine relance</span>
              <input
                type="date"
                value={businessCard.reminderAt}
                onChange={event => updateBusinessCard({ reminderAt: event.target.value })}
                style={{ width:'100%', minWidth:0, boxSizing:'border-box', border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', borderRadius:12, padding:'9px 10px', fontSize:13, fontWeight:800, outline:'none' }}
              />
            </label>
          </div>

          <input
            value={businessCard.interests}
            onChange={event => updateBusinessCard({ interests: event.target.value })}
            placeholder="Besoin, produit, service ou intérêt du client"
            style={{ width:'100%', boxSizing:'border-box', border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', borderRadius:12, padding:'9px 10px', fontSize:13, fontWeight:700, outline:'none', marginBottom:8 }}
          />

          <textarea
            value={businessCard.notes}
            onChange={event => updateBusinessCard({ notes: event.target.value })}
            rows={2}
            placeholder="Notes internes : contexte, objection, promesse, prochaine action..."
            style={{ width:'100%', boxSizing:'border-box', border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', borderRadius:12, padding:'9px 10px', fontSize:13, lineHeight:1.35, fontWeight:650, outline:'none', resize:'none', marginBottom:8 }}
          />

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:7, marginBottom:8 }}>
            {[
              ['Photos', mediaSummary.images],
              ['Vidéos', mediaSummary.videos],
              ['Vocaux', mediaSummary.audios],
              ['Docs', mediaSummary.documents],
            ].map(([label, count]) => (
              <div key={label} style={{ border:'1px solid var(--border)', background:'#fff', borderRadius:12, padding:'8px 6px', textAlign:'center' }}>
                <p style={{ margin:0, fontSize:15, fontWeight:950, color:'#102A2A', lineHeight:1 }}>{count}</p>
                <p style={{ margin:'4px 0 0', fontSize:10.5, fontWeight:800, color:'var(--text-muted)', lineHeight:1 }}>{label}</p>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:7 }}>
            <button
              onClick={() => {
                insertTextAtCursor(summarizeConversationForBusiness(convMessages, businessContactName));
                showNotice('Résumé préparé dans la zone de message.');
              }}
              style={{ border:'none', background:'#102A2A', color:'#fff', borderRadius:12, padding:'10px 8px', fontSize:12, fontWeight:900, cursor:'pointer' }}
            >
              Résumer
            </button>
            <button
              onClick={() => {
                insertTextAtCursor(professionalReplyDraft(businessContactName, businessCard));
                showNotice('Réponse professionnelle préparée.');
              }}
              style={{ border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', borderRadius:12, padding:'10px 8px', fontSize:12, fontWeight:900, cursor:'pointer' }}
            >
              Réponse pro
            </button>
            <button
              onClick={() => {
                insertTextAtCursor(followUpDraft(businessContactName, businessCard));
                updateBusinessCard({ status: 'relancer' });
                showNotice('Message de relance préparé.');
              }}
              style={{ border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', borderRadius:12, padding:'10px 8px', fontSize:12, fontWeight:900, cursor:'pointer' }}
            >
              Relancer
            </button>
            <button
              onClick={() => {
                insertTextAtCursor(paymentDraft(businessContactName, businessCard));
                showNotice('Message paiement préparé.');
              }}
              style={{ border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', borderRadius:12, padding:'10px 8px', fontSize:12, fontWeight:900, cursor:'pointer' }}
            >
              Paiement
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        className="om-messages-viewport"
        ref={messagesViewportRef}
        onScroll={handleMessagesScroll}
        style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', padding:'7px 10px 9px', WebkitOverflowScrolling:'touch', background:'var(--bg-app)', position:'relative' } as React.CSSProperties}
      >
        <div className="om-messages-inner" style={{ display:'flex', flexDirection:'column', gap:2 }}>
          <div className="om-messages-top-spacer" />
          {convMessages.map((msg, index) => (
            <div
              key={msg.id}
              ref={el => {
                messageRefs.current[msg.id] = el;
              }}
              style={msg.id === activeSearchMessage ? { borderRadius:12, boxShadow:'0 0 0 2px rgba(15,118,110,0.28)', background:'rgba(15,118,110,0.08)', transition:'box-shadow .2s ease, background .2s ease' } : undefined}
            >
              {shouldShowDateSeparator(msg, convMessages[index - 1]) && (
                <div className="om-date-separator">
                  {formatDateSeparator(msg.createdAt)}
                </div>
              )}
              <MessageBubble
                message={msg}
                isOwn={msg.senderId === userId}
                currentUserId={userId}
                currentUserAvatar={String((session?.user as any)?.image || '')}
                currentUserName={String((session?.user as any)?.name || '')}
                onReply={setReplyTo}
                onDelete={handleDelete}
                onEdit={setEditMsg}
                onForward={openForwardSheet}
                onSelect={toggleMessageSelection}
                onReact={reactToMessage}
                selectionMode={selectionMode}
                selected={selectedMessageIds.includes(msg.id)}
                onCallMessageClick={!isOfficialConversation ? startConversationCall : undefined}
                onMediaLoad={() => {
                  requestAnimationFrame(() => scrollMessagesToBottom('auto'));
                }}
              />
            </div>
          ))}
          {typingNames.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div className="bubble-in" style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:4 }}>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  <div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/>
                </div>
                {conv?.type === 'group' && (
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {typingNames.length === 1 ? typingNames[0] : `${typingNames.length} personnes`}
                  </span>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {showJumpToLatest && (
        <button
          onClick={() => scrollMessagesToBottom('smooth')}
          style={{ position:'absolute', right:16, bottom:92, zIndex:40, border:'none', borderRadius:999, background:'var(--header-bg)', color:'#fff', padding:'10px 14px', fontSize:13, fontWeight:800, boxShadow:'0 8px 24px rgba(0,0,0,.22)', cursor:'pointer' }}
        >
          {t(lang, 'chat.newMessages')}
        </button>
      )}

      {/* Reply/Edit bar */}
      {!selectionMode && (replyTo || editMsg) && (
        <div style={{ padding:'9px 12px', borderTop:'1px solid var(--border)', background:'var(--bg-surface)', display:'flex', alignItems:'center', gap:10, boxShadow:'0 -6px 18px rgba(16,42,42,0.05)', flexShrink:0 }}>
          <div style={{ flex:1, minWidth:0, borderLeft:'4px solid var(--accent)', padding:'7px 10px', borderRadius:12, background:'var(--bg-input)' }}>
            <p style={{ fontSize:12, color:'var(--brand)', fontWeight:850, margin:0, lineHeight:1.2 }}>
              {editMsg ? t(lang,'chat.edit.msg') : `${t(lang,'chat.reply.to')} ${replyTo?.sender?.name}`}
            </p>
            <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'2px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.25 }}>{messagePreview(editMsg ?? replyTo)}</p>
          </div>
          <button
            onClick={() => { setReplyTo(null); setEditMsg(null); }}
            style={{ border:'1px solid var(--border)', background:'#FFFFFF', cursor:'pointer', color:'var(--text-primary)', fontSize:13, fontWeight:850, borderRadius:999, padding:'0 13px', height:38, minHeight:38, flexShrink:0, boxShadow:'var(--shadow)' }}
          >
            Annuler
          </button>
        </div>
      )}

      {isOfficialConversation && !selectionMode && (
        <div style={{ padding:'12px 14px max(12px, env(safe-area-inset-bottom))', background:'#EAF4F1', borderTop:'1px solid rgba(16,42,42,0.14)', color:'#102A2A', flexShrink:0 }}>
          <p style={{ margin:0, fontSize:13.5, fontWeight:850, lineHeight:1.45, textAlign:'center' }}>
            Conversation officielle O.messenger. Les réponses sont désactivées pour ce canal.
          </p>
        </div>
      )}

      {isBlockedDirect && !selectionMode && other?.id && (
        <div style={{ padding:'12px 14px max(12px, env(safe-area-inset-bottom))', background:'#FEF2F2', borderTop:'1px solid rgba(180,35,24,0.18)', color:'#7A271A', flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:13.5, fontWeight:900, lineHeight:1.35 }}>
              Contact bloqué
            </p>
            <p style={{ margin:'2px 0 0', fontSize:12.5, fontWeight:650, lineHeight:1.35 }}>
              Débloquez ce contact pour envoyer des messages ou lancer des appels.
            </p>
          </div>
          <button
            onClick={() => unblockUser(other.id)}
            style={{ border:'none', background:'#B42318', color:'#fff', cursor:'pointer', borderRadius:999, padding:'9px 13px', fontSize:12.5, fontWeight:900, flexShrink:0 }}
          >
            Débloquer
          </button>
        </div>
      )}

      {/* Input — toujours visible, safe-area iOS */}
      {!selectionMode && !isOfficialConversation && !isBlockedDirect && (
      <div className="chat-composer-safe om-chat-composer" style={{ position:'relative', padding:'5px 8px', paddingBottom:'max(6px, env(safe-area-inset-bottom))', background:'#F0F2F5', borderTop:'1px solid #D7DBDF', flexShrink:0 }}>
        {/* Emoji picker */}
        {showEmoji && (
          <EmojiPicker
            onSelect={e => insertTextAtCursor(e)}
            onClose={() => setShowEmoji(false)}
          />
        )}

        {showAiComposer && (
          <>
            <div style={{ position:'fixed', inset:0, zIndex:38 }} onClick={() => setShowAiComposer(false)} />
            <div
              className="om-slide-up"
              style={{ position:'absolute', right:52, bottom:'calc(56px + env(safe-area-inset-bottom, 0px))', zIndex:55, width:'min(310px, calc(100vw - 28px))', background:'#fff', border:'1px solid var(--border)', borderRadius:18, boxShadow:'var(--shadow-premium)', padding:14 }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#102A2A,#1D9BF0)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900 }}>✦</div>
                <div style={{ minWidth:0 }}>
                  <p style={{ margin:0, fontSize:14, fontWeight:950, color:'var(--text-primary)' }}>Gemini IA</p>
                  <p style={{ margin:'2px 0 0', fontSize:11.5, color:'var(--text-muted)', fontWeight:700 }}>Prépare un brouillon, sans l’envoyer.</p>
                </div>
              </div>
              <button
                onClick={generateAiReplyDraft}
                disabled={aiGenerating}
                style={{ width:'100%', border:'none', borderRadius:12, background:'var(--brand)', color:'#fff', padding:'12px 14px', fontSize:14, fontWeight:900, cursor:aiGenerating ? 'default' : 'pointer', opacity:aiGenerating ? .72 : 1 }}
              >
                {aiGenerating ? 'Préparation...' : 'Répondre avec l’IA'}
              </button>
              <button
                onClick={() => {
                  setShowAiComposer(false);
                  window.location.href = '/tools?tab=ai';
                }}
                style={{ marginTop:8, width:'100%', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg-input)', color:'var(--text-primary)', padding:'10px 12px', fontSize:13, fontWeight:850, cursor:'pointer' }}
              >
                Ouvrir Outils / IA
              </button>
              {aiComposerError && (
                <p style={{ margin:'10px 0 0', borderRadius:10, background:'#FEF2F2', color:'#B42318', padding:'9px 10px', fontSize:12.5, lineHeight:1.35, fontWeight:750 }}>
                  {aiComposerError}
                </p>
              )}
            </div>
          </>
        )}

        {/* Recording UI */}
        {recording ? (
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 4px' }}>
            <button onClick={cancelRecording}
              style={{ width:42, height:42, borderRadius:'50%', border:'none', background:'#fee2e2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="20" height="20" fill="#ef4444" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, background:'var(--bg-surface)', borderRadius:24, padding:'10px 16px', border:'1px solid #ef4444' }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:'#ef4444', animation:'pulse 1s infinite' }}/>
              <span style={{ fontSize:15, color:'var(--text-primary)', fontWeight:600 }}>
                {String(Math.floor(recSeconds/60)).padStart(2,'0')}:{String(recSeconds%60).padStart(2,'0')}
              </span>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>{t(lang, 'chat.recording')}</span>
            </div>
            <button onClick={stopRecording}
              style={{ width:42, height:42, borderRadius:'50%', border:'none', background:'var(--accent)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          </div>
        ) : voiceDraft ? (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 4px' }}>
            <button onClick={discardVoiceDraft}
              style={{ width:42, height:42, borderRadius:'50%', border:'none', background:'#FEE2E2', color:'#DC2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
            <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:10, background:'var(--bg-surface)', borderRadius:24, padding:'6px 10px', border:'1px solid var(--border)' }}>
              <audio src={voiceDraft.dataUrl} controls preload="metadata" style={{ width:'100%', height:34 }} />
              <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:700, whiteSpace:'nowrap' }}>
                {String(Math.floor(voiceDraft.seconds / 60)).padStart(2,'0')}:{String(voiceDraft.seconds % 60).padStart(2,'0')}
              </span>
            </div>
            <button onClick={sendVoiceDraft} disabled={mediaUploading}
              style={{ width:42, height:42, borderRadius:'50%', border:'none', background:'var(--header-bg)', color:'#fff', cursor:mediaUploading ? 'default' : 'pointer', opacity: mediaUploading ? 0.65 : 1, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="om-composer-row" style={{ display:'flex', alignItems:'flex-end', gap:7 }}>
            {/* Attachement : fichier + caméra */}
            <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} style={{ display:'none' }}/>
            <div style={{ position:'relative', flexShrink:0 }}>
              <button onClick={() => { if (mediaUploading) return; setShowEmoji(false); setShowAttachMenu(v => !v); }}
                className="om-composer-icon-btn"
                style={{ width:42, height:42, minHeight:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--bg-surface)', cursor:mediaUploading ? 'default' : 'pointer', opacity: mediaUploading ? 0.6 : 1, color:'var(--text-secondary)', flexShrink:0 }}>
                <svg width="21" height="21" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                </svg>
              </button>
              {showAttachMenu && (
                <>
                  <div style={{ position:'fixed', inset:0, zIndex:40 }} onClick={() => setShowAttachMenu(false)} />
                  <div className="om-attachment-menu om-slide-up" style={{ position:'absolute', bottom:50, left:0, zIndex:50, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:20, boxShadow:'var(--shadow-premium)', overflow:'hidden', minWidth:220, backdropFilter:'blur(14px) saturate(1.04)' }}>
                    <button onClick={() => { setShowAttachMenu(false); setShowCamera(true); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>📷</span> {t(lang, 'chat.camera')}
                    </button>
                    <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.setAttribute('accept','image/*,video/*'); fileInputRef.current?.click(); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>🖼️</span> {t(lang, 'chat.photoVideo')}
                    </button>
                    <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.setAttribute('accept','.pdf,.doc,.docx,.xls,.xlsx,*/*'); fileInputRef.current?.click(); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>📄</span> {t(lang, 'common.document')}
                    </button>
                    <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.setAttribute('accept','audio/*'); fileInputRef.current?.click(); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>🎧</span> Audio
                    </button>
                    <button onClick={() => { setShowAttachMenu(false); shareMyOracleContact(); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>👤</span> Contact
                    </button>
                    <button onClick={() => {
                      setShowAttachMenu(false);
                      if (!navigator.geolocation) {
                        showNotice('Localisation indisponible sur cet appareil.');
                        return;
                      }
                      navigator.geolocation.getCurrentPosition(
                        pos => {
                          if (!activeConvId) return;
                          const url = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
                          sendMessage(activeConvId, url, 'text');
                        },
                        () => showNotice('Autorisation localisation refusée ou indisponible.')
                      );
                    }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>📍</span> Localisation
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Textarea + emoji button */}
            <div className="om-composer-input-shell" style={{ flex:1, background:'var(--bg-surface)', borderRadius:23, padding:'6px 11px', minHeight:42, display:'flex', alignItems:'center', gap:7, border:'1px solid var(--border)' }}>
              <textarea ref={textareaRef} value={input} onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                onPaste={handlePaste}
                placeholder={t(lang,'chat.placeholder')} rows={1}
                className="om-composer-textarea"
                style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:15.8, color:'var(--text-primary)', resize:'none', maxHeight:108, lineHeight:1.28, padding:'1px 0', minHeight:22, WebkitUserSelect:'text', userSelect:'text', touchAction:'auto' }}
                onFocus={() => setTimeout(() => { if (isNearBottomRef.current) scrollMessagesToBottom('smooth'); }, 120)}
                onInput={e => resizeTextarea(e.target as HTMLTextAreaElement)}
              />
              <button
                onClick={() => {
                  setShowEmoji(false);
                  setAiComposerError('');
                  setShowAiComposer(v => !v);
                }}
                className="om-composer-ai"
                title="Gemini IA"
                aria-label="Gemini IA"
                style={{
                  width:40,
                  height:42,
                  minHeight:42,
                  border:'none',
                  borderRadius:14,
                  background:showAiComposer ? 'linear-gradient(135deg,rgba(29,155,240,.18),rgba(16,42,42,.10))' : 'rgba(29,155,240,.08)',
                  cursor:'pointer',
                  color:showAiComposer ? '#0B63CE' : '#1D9BF0',
                  flexShrink:0,
                  padding:'3px 0 4px',
                  display:'flex',
                  flexDirection:'column',
                  alignItems:'center',
                  justifyContent:'center',
                  gap:1,
                  boxShadow:showAiComposer ? '0 0 0 3px rgba(29,155,240,.12), 0 5px 16px rgba(29,155,240,.18)' : '0 0 0 2px rgba(29,155,240,.08)',
                  animation:'omAiPulse 2.6s ease-in-out infinite',
                }}>
                <span style={{ fontSize:10, lineHeight:1, fontWeight:950, letterSpacing:.2, color:'#0F172A' }}>IA</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2.8l1.7 4.7 4.7 1.7-4.7 1.7-1.7 4.7-1.7-4.7-4.7-1.7 4.7-1.7L12 2.8z" fill="currentColor"/>
                  <path d="M18.3 13.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z" fill="currentColor" opacity=".72"/>
                </svg>
              </button>
              {/* Emoji button */}
              <button onClick={() => setShowEmoji(v => !v)}
                className="om-composer-emoji"
                style={{ border:'none', background:'transparent', cursor:'pointer', color: showEmoji ? 'var(--accent)' : 'var(--text-muted)', flexShrink:0, fontSize:22, lineHeight:1, padding:0 }}>
                😊
              </button>
            </div>

            {/* Send ou Micro */}
            {input.trim() ? (
              <button onClick={handleSend} disabled={sending}
                className="om-composer-send"
                style={{ width:42, height:42, minHeight:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--header-bg)', cursor:'pointer', flexShrink:0, transition:'opacity .2s' }}>
                <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            ) : (
              <button onTouchStart={mediaUploading ? undefined : startRecording} onMouseDown={mediaUploading ? undefined : startRecording}
                className="om-composer-send"
                style={{ width:42, height:42, minHeight:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--header-bg)', cursor:mediaUploading ? 'default' : 'pointer', opacity: mediaUploading ? 0.65 : 1, color:'#FFFFFF', flexShrink:0 }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <rect x="9" y="2" width="6" height="12" rx="3"/>
                  <path strokeLinecap="round" d="M5 10a7 7 0 0014 0M12 19v3M8 22h8"/>
                </svg>
              </button>
            )}
          </div>
        )}
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
      )}

      {/* Transfert de message */}
      {forwardMessages.length > 0 && (
        <div
          style={{ position:'fixed', inset:0, zIndex:520, background:'rgba(0,0,0,0.48)', display:'flex', alignItems:'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) closeForwardSheet(); }}
        >
          <div
            style={{ width:'100%', maxHeight:'min(82dvh, 720px)', background:'var(--bg-surface)', borderRadius:'22px 22px 0 0', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 -14px 42px rgba(0,0,0,0.24)' }}
            role="dialog"
            aria-modal="true"
            aria-label={t(lang, 'chat.forwardMessages')}
          >
            <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <button
                onClick={closeForwardSheet}
                disabled={forwarding}
                aria-label={t(lang, 'common.close')}
                style={{ width:38, height:38, minHeight:38, borderRadius:'50%', border:'none', background:'var(--bg-input)', color:'var(--text-primary)', cursor: forwarding ? 'default' : 'pointer', fontSize:22, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
              >
                ×
              </button>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, color:'var(--text-primary)', fontSize:18, fontWeight:900, lineHeight:1.12 }}>{t(lang, 'chat.forward')}</p>
                <p style={{ margin:'3px 0 0', color:'var(--text-muted)', fontSize:12.5, fontWeight:750 }}>{t(lang, 'chat.selectedContacts').replace('{count}', String(forwardTargets.length))}</p>
              </div>
              <button
                onClick={forwardSelectedMessages}
                disabled={forwardTargets.length === 0 || forwarding}
                style={{ border:'none', borderRadius:999, background: forwardTargets.length === 0 || forwarding ? 'rgba(16,42,42,0.14)' : 'var(--header-bg)', color: forwardTargets.length === 0 || forwarding ? 'var(--text-muted)' : '#fff', padding:'10px 16px', fontSize:14, fontWeight:900, cursor: forwardTargets.length === 0 || forwarding ? 'default' : 'pointer', flexShrink:0 }}
              >
                {forwarding ? t(lang, 'common.sending') : t(lang, 'common.send')}
              </button>
            </div>

            <div style={{ margin:'12px 16px 8px', padding:'10px 12px', borderRadius:14, background:'#EAF4F1', border:'1px solid rgba(16,42,42,0.12)', color:'var(--text-primary)', flexShrink:0 }}>
              <p style={{ margin:'0 0 3px', fontSize:12, color:'var(--text-muted)', fontWeight:850 }}>
                {withCount(t(lang, 'chat.forwardCount'), forwardMessages.length)}
              </p>
              <p style={{ margin:0, fontSize:14, lineHeight:1.35, fontWeight:750, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {forwardMessages.length === 1
                  ? messagePreview(forwardMessages[0])
                  : forwardMessages.slice(0, 3).map(messagePreview).join(' · ') + (forwardMessages.length > 3 ? ` · +${forwardMessages.length - 3}` : '')}
              </p>
            </div>

            <div style={{ margin:'0 16px 8px', flexShrink:0, display:'flex', alignItems:'center', gap:8, background:'var(--bg-input)', border:'1px solid var(--border)', borderRadius:999, padding:'9px 13px' }}>
              <svg width="16" height="16" fill="none" stroke="var(--text-muted)" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={forwardSearch}
                onChange={event => setForwardSearch(event.target.value)}
                placeholder={t(lang, 'chat.searchContact')}
                style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', color:'var(--text-primary)', fontSize:14 }}
              />
              {forwardSearch && (
                <button
                  onClick={() => setForwardSearch('')}
                  aria-label="Effacer la recherche"
                  style={{ border:'none', background:'transparent', color:'var(--text-muted)', cursor:'pointer', fontSize:16, padding:0, lineHeight:1 }}
                >
                  ×
                </button>
              )}
            </div>

            <div style={{ overflowY:'auto', padding:'4px 10px 12px', WebkitOverflowScrolling:'touch', flex:1, minHeight:0 }}>
              {filteredForwardTargets.length === 0 ? (
                <div style={{ padding:'26px 18px 34px', textAlign:'center', color:'var(--text-muted)' }}>
                  <p style={{ margin:0, fontSize:15, lineHeight:1.45, fontWeight:750 }}>
                    {t(lang, 'chat.noMessageSelected')}
                  </p>
                </div>
              ) : (
                filteredForwardTargets.map(target => {
                  const selected = forwardTargets.includes(target.key);
                  return (
                    <button
                      key={target.key}
                      type="button"
                      onClick={() => toggleForwardTarget(target.key)}
                      style={{ width:'100%', border:'none', background:selected ? 'rgba(15,118,110,0.10)' : 'transparent', borderRadius:16, padding:'9px 8px', display:'flex', alignItems:'center', gap:11, cursor:'pointer', textAlign:'left', transition:'background .18s ease' }}
                    >
                      <div style={{ width:46, height:46, borderRadius:'50%', background:'var(--bg-input)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'1px solid var(--border)' }}>
                        {target.avatar ? (
                          <img src={target.avatar} alt={target.label} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                        ) : (
                          <span style={{ color:'var(--header-bg)', fontSize:18, fontWeight:900 }}>{target.label[0]?.toUpperCase() ?? '?'}</span>
                        )}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ margin:0, color:'var(--text-primary)', fontSize:15.5, fontWeight:850, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {target.label}
                        </p>
                        <p style={{ margin:'3px 0 0', color:'var(--text-muted)', fontSize:13, lineHeight:1.25, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {target.subtitle}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        style={{ width:26, height:26, borderRadius:'50%', border:selected ? 'none' : '2px solid var(--border)', background:selected ? 'var(--header-bg)' : '#fff', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                      >
                        {selected && (
                          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal profil complet */}
      {profileModal && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setProfileModal(false); }}>
          <div style={{ width:'100%', background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', paddingBottom:40, overflow:'hidden' }}>
            {/* Cover + avatar */}
            <div style={{ height:120, background:'var(--header-bg)', borderBottom:'1px solid rgba(255,255,255,0.12)', position:'relative', display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:0 }}>
              <button onClick={() => setProfileModal(false)}
                style={{ position:'absolute', top:12, right:12, width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.3)', cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>
                ✕
              </button>
              <button
                onClick={() => avatar && setAvatarLightbox(true)}
                title={avatar ? t(lang, 'chat.enlargePhoto') : undefined}
                style={{ position:'absolute', bottom:-44, width:88, height:88, borderRadius:'50%', overflow:'hidden', border:'4px solid var(--bg-surface)', background:'var(--accent)', padding:0, cursor: avatar ? 'zoom-in' : 'default' }}
              >
                {avatar
                  ? <img src={avatar} alt={name??''} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:36, fontWeight:800, color:'var(--header-bg)' }}>{(name??'?')[0].toUpperCase()}</span>
                    </div>
                }
              </button>
            </div>
            {/* Infos */}
            <div style={{ paddingTop:56, paddingLeft:24, paddingRight:24, textAlign:'center' }}>
              <p style={{ fontSize:20, fontWeight:800, color:'var(--text-primary)', margin:'0 0 4px' }}>{name}</p>
              {!isOfficialConversation && conv?.type !== 'group' && other?.id && (
                <button
                  onClick={() => {
                    if (isBlockedDirect) {
                      unblockUser(other.id);
                      notify(`${name} est débloqué.`, 'success');
                    } else {
                      blockUser(other.id);
                      notify(`${name} est bloqué sur cet appareil.`, 'success');
                    }
                  }}
                  style={{
                    display:'inline-flex',
                    alignItems:'center',
                    justifyContent:'center',
                    minHeight:30,
                    borderRadius:999,
                    border:isBlockedDirect ? '1px solid rgba(15,118,110,0.18)' : '1px solid rgba(180,35,24,0.16)',
                    background:isBlockedDirect ? '#EAF4F1' : '#FEF2F2',
                    color:isBlockedDirect ? 'var(--brand)' : '#B42318',
                    padding:'6px 14px',
                    margin:'2px 0 8px',
                    fontSize:13,
                    fontWeight:900,
                    cursor:'pointer',
                  }}
                >
                  {isBlockedDirect ? 'Débloquer' : 'Bloquer'}
                </button>
              )}
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, background: isOnline ? 'rgba(52,211,153,0.12)' : 'rgba(100,116,139,0.10)', borderRadius:20, padding:'4px 14px', marginBottom:20 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: isOnline ? '#25D366' : 'var(--text-muted)' }}/>
                <span style={{ fontSize:13, color: isOnline ? '#16A34A' : 'var(--text-muted)', fontWeight:700 }}>{isOnline ? t(lang, 'chat.online') : t(lang, 'chat.offline')}</span>
              </div>
              {other?.phone && (
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderTop:'1px solid var(--border)' }}>
                  <svg width="20" height="20" fill="var(--accent)" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                  <span style={{ fontSize:15, color:'var(--text-primary)' }}>{other.phone}</span>
                </div>
              )}
              {/* Actions */}
              <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:16 }}>
                {onStartCall && other && (
                  <>
                    <button onClick={() => { setProfileModal(false); startConversationCall('audio'); }}
                      style={{ flex:1, background:'var(--header-bg)', color:'#fff', border:'none', borderRadius:14, padding:'14px 0', fontSize:15, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <svg width="18" height="18" fill="#fff" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                      Appel
                    </button>
                    <button onClick={() => { setProfileModal(false); startConversationCall('video'); }}
                      style={{ flex:1, background:'rgba(16,42,42,0.08)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 0', fontSize:15, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <svg width="18" height="18" fill="none" stroke="var(--text-primary)" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
                      Vidéo
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Caméra avant/arrière */}
      {showCamera && (
        <CameraCapture
          mode="both"
          onCapture={async (dataUrl, type) => {
            setShowCamera(false);
            if (!activeConvId) return;
            setMediaUploading(true);
            setCallNotice(t(lang, 'common.sending'));
            try {
              const content = await uploadMediaForMessage(dataUrl, type, {
                name: `${type}-${Date.now()}.${type === 'image' ? 'jpg' : 'webm'}`,
                mime: dataUrl.match(/^data:([^;,]+)/)?.[1],
              });
              sendMessage(activeConvId, content, type);
            } catch {
              notify('Impossible d’envoyer ce média. Vérifiez la connexion puis réessayez.', 'error');
            } finally {
              setMediaUploading(false);
              setCallNotice('');
            }
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Lightbox photo de profil (double-clic sur avatar) */}
      {avatarLightbox && avatar && (
        <MediaLightbox
          src={avatar}
          type="image"
          title={name}
          subtitle="Photo de profil"
          qualityMode="profile"
          profileActions={[
            {
              key: 'message',
              label: 'Message',
              icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.4-4 8-9 8-1.5 0-2.9-.3-4.1-.9L3 20l1.4-3.7A7.2 7.2 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z"/></svg>,
              onClick: () => setAvatarLightbox(false),
            },
            {
              key: 'audio',
              label: 'Appeler',
              icon: <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>,
              disabled: !onStartCall || !other || isOfficialConversation,
              onClick: () => { setAvatarLightbox(false); startConversationCall('audio'); },
            },
            {
              key: 'video',
              label: 'Vidéo',
              icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.6-2.1A1 1 0 0121 8.8v6.4a1 1 0 01-1.4.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>,
              disabled: !onStartCall || !other || isOfficialConversation,
              onClick: () => { setAvatarLightbox(false); startConversationCall('video'); },
            },
            {
              key: 'profile',
              label: 'Profil',
              icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 21a8 8 0 00-16 0M12 13a5 5 0 100-10 5 5 0 000 10z"/></svg>,
              onClick: () => { setAvatarLightbox(false); setProfileModal(true); },
            },
            {
              key: 'favorite',
              label: 'Favori',
              icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3.7l2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.7-5 2.7.9-5.5-4-3.9 5.6-.8L12 3.7z"/></svg>,
              onClick: () => showNotice('Favori enregistré localement.'),
            },
            {
              key: 'share',
              label: 'Partager',
              icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14"/></svg>,
              onClick: () => {
                const text = `${name} - Oracle Messenger`;
                if (navigator.share) navigator.share({ title: name, text }).catch(() => {});
                else navigator.clipboard?.writeText(text).then(() => showNotice('Contact copié.'));
              },
            },
            {
              key: 'more',
              label: 'Plus',
              icon: <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>,
              onClick: () => { setAvatarLightbox(false); setProfileModal(true); },
            },
          ]}
          onClose={() => setAvatarLightbox(false)}
        />
      )}
    </div>
  );
}
