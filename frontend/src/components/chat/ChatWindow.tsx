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

function attachmentUrl(content?: string) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') return parsed.url.trim();
  } catch {}
  return trimmed;
}

function messagePreview(message?: Message | null) {
  if (!message) return '';
  if (message.isDeleted) return 'Message supprimé';
  const src = attachmentUrl(message.content);
  if (message.type === 'image' || src.startsWith('data:image')) return 'Photo';
  if (message.type === 'video' || src.startsWith('data:video')) return 'Vidéo';
  if (message.type === 'audio' || src.startsWith('data:audio')) return 'Audio';
  if (message.type === 'file' || message.type === 'document' || src.startsWith('data:')) return 'Fichier';
  return message.content;
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

const CONTACT_CACHE_KEYS = ['oracle-contacts', 'oracle-manual-contacts'];
const HIDDEN_MESSAGES_PREFIX = 'oracle-messenger-hidden-messages:';
const PROBABLE_DIAL_CODES = [
  '225', '237', '221', '223', '226', '224', '228', '229', '227',
  '243', '242', '241', '233', '234', '212', '213', '216',
  '33', '32', '41', '1', '44',
];

function readStoredContactPhones() {
  const phones = new Set<string>();
  for (const key of CONTACT_CACHE_KEYS) {
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
    const hasExplicitCountryCode = phone.trim().startsWith('+') || phone.trim().startsWith('00');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) continue;
    const localWithoutLeadingZero = digits.replace(/^0+/, '');
    variants.add(`+${digits}`);
    variants.add(digits);
    variants.add(digits.slice(-8));
    if (digits.length >= 9) variants.add(digits.slice(-9));
    if (!hasExplicitCountryCode) {
      for (const dial of PROBABLE_DIAL_CODES) {
        variants.add(`+${dial}${digits}`);
        variants.add(`${dial}${digits}`);
        if (localWithoutLeadingZero.length >= 8) {
          variants.add(`+${dial}${localWithoutLeadingZero}`);
          variants.add(`${dial}${localWithoutLeadingZero}`);
        }
      }
    }
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
          aria-label="Fermer les emojis"
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

  const { activeConvId, conversations, messages, typingUsers, typingNames: typingNamesStore, onlineUsers, setConversations, setMessages, markRead, loadLocalMessages } = useChatStore();
  const { joinConversation, sendTyping, sendMessage, deleteMessage: deleteSocketMessage, editMessage: editSocketMessage, markRead: emitRead } = useSocket();

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
  const initialScrollPending = useRef(false);
  const isNearBottomRef = useRef(true);
  const prevConvRef = useRef<string | null>(null);
  const prevMsgCountRef = useRef(0);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const firstMessageRef = useRef<HTMLDivElement | null>(null);

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
  const other = conv?.participants?.[0];
  const isOnline = other && onlineUsers.has(other.id);
  const searchNeedle = messageSearch.trim().toLowerCase();
  const searchMatches = searchNeedle
    ? convMessages.filter(msg =>
        !msg.isDeleted &&
        msg.type === 'text' &&
        (msg.content ?? '').toLowerCase().includes(searchNeedle)
      )
    : [];
  const activeSearchMessage = searchMatches[activeSearchIndex]?.id ?? '';
  const selectedMessages = convMessages.filter(msg => selectedMessageIds.includes(msg.id) && !msg.isDeleted);
  const selectionMode = selectedMessageIds.length > 0;

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
    api.messages.list(activeConvId, token).then(msgs => { setMessages(activeConvId, msgs); markRead(activeConvId); emitRead(activeConvId); }).catch(() => {});
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
        const phones = readStoredContactPhones();
        const hashes = await phoneHashesForForward(phones);
        if (hashes.length) {
          const matched = await api.users.matchByPhoneHashes(hashes, token).catch(() => []);
          matched.forEach((user: User) => {
            if (user.id && user.id !== userId) byId.set(user.id, user);
          });
        }
        const searched = await api.users.search('', token).catch(() => []);
        searched.forEach((user: User) => {
          if (user.id && user.id !== userId) byId.set(user.id, user);
        });
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
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
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
        if (isNearBottomRef.current) {
          scrollMessagesToBottom('smooth');
        } else {
          setShowJumpToLatest(true);
        }
      }
    });
  }, [convMessages.length, activeConvId]);

  useLayoutEffect(() => {
    const el = messagesViewportRef.current;
    const first = firstMessageRef.current;
    if (!el || !first || convMessages.length === 0) return;
    const available = Math.max(0, el.clientHeight - first.offsetHeight - 18);
    el.style.setProperty('--om-top-spacer', `${Math.min(available, Math.floor(el.clientHeight * 0.22))}px`);
  }, [convMessages.length, activeConvId]);

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
    if (dayDiff === 0) return "Aujourd'hui";
    if (dayDiff === 1) return 'Hier';
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
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

  async function handleSend() {
    const content = input.trim();
    if (!content || !activeConvId || sending) return;
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
    setSending(false);
  }

  async function uploadMediaForMessage(dataUrl: string, type: 'image' | 'video' | 'audio' | 'file', meta?: { name?: string; size?: number; mime?: string }) {
    if (!token) throw new Error('Session expirée');
    const uploaded = await api.media.upload(token, {
      dataUrl,
      name: meta?.name,
      mime: meta?.mime,
      kind: type,
    });
    if (type === 'file') {
      return JSON.stringify({
        url: uploaded.url,
        name: meta?.name || uploaded.name,
        size: meta?.size ?? uploaded.size,
        mime: meta?.mime || uploaded.mime,
      });
    }
    return uploaded.url;
  }

  function startConversationCall(type: 'audio' | 'video') {
    if (!conv || !onStartCall) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Ce navigateur ne permet pas les appels. Utilisez Chrome Android ou Safari iPhone à jour.');
      return;
    }
    const ids = conv.type === 'group'
      ? allParticipants.map((p: any) => p.id)
      : other ? [other.id] : [];
    if (!ids.length) {
      alert('Aucun destinataire disponible pour cet appel.');
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
    const maxBytes = 18 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert('Fichier trop lourd. Limite actuelle : 18 Mo.');
      e.target.value = '';
      return;
    }
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result as string;
      const type = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
      setMediaUploading(true);
      setCallNotice('Envoi du média...');
      try {
        const content = await uploadMediaForMessage(b64, type, {
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
        });
        sendMessage(activeConvId, content, type);
      } catch {
        alert('Impossible d’envoyer ce média. Vérifiez la connexion puis réessayez.');
      } finally {
        setMediaUploading(false);
        setCallNotice('');
      }
    };
    reader.readAsDataURL(file);
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
      alert('Microphone non disponible — vérifiez les permissions');
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
    setCallNotice('Envoi du vocal...');
    try {
      const content = await uploadMediaForMessage(voiceDraft.dataUrl, 'audio', {
        name: `vocal-${Date.now()}.webm`,
        mime: voiceDraft.dataUrl.match(/^data:([^;,]+)/)?.[1] || 'audio/webm',
      });
      sendMessage(activeConvId, content, 'audio');
      setVoiceDraft(null);
    } catch {
      alert('Impossible d’envoyer le vocal. Vérifiez la connexion puis réessayez.');
    } finally {
      setMediaUploading(false);
      setCallNotice('');
    }
  }

  function discardVoiceDraft() {
    setVoiceDraft(null);
  }

  const name = conv?.type === 'group' ? conv.name : other?.name ?? 'Inconnu';
  const avatar = conv?.type === 'group' ? conv.avatar : other?.avatar;
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
      subtitle: item.lastMessage ? messagePreview(item.lastMessage) : item.type === 'group' ? 'Groupe Oracle Messenger' : 'Conversation Oracle Messenger',
      conversationId: item.id,
    })),
    ...forwardUsers
      .filter(user => !existingForwardUserIds.has(user.id))
      .map(user => ({
        key: `user:${user.id}`,
        kind: 'user' as const,
        label: user.name || user.username || 'Contact Oracle',
        avatar: user.avatar,
        subtitle: user.phone ? `Contact Oracle · ${user.phone}` : user.username ? `@${user.username}` : 'Contact Oracle Messenger',
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
    if (item.type === 'group') return item.name || 'Groupe sans nom';
    const participant = item.participants.find(p => p.id !== userId) ?? item.participants[0];
    return participant?.name || item.name || 'Contact';
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

  function deleteSelectedMessages() {
    if (!activeConvId || selectedMessages.length === 0) return;
    const count = selectedMessages.length;
    const ok = window.confirm(`Effacer ${count} message${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''} ?`);
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
    showNotice(`${count} message${count > 1 ? 's effacés' : ' effacé'}.`);
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
      const messageLabel = forwardMessages.length > 1 ? `${forwardMessages.length} messages transférés` : 'Message transféré';
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
      <div className="om-chat-header" style={{ display:'flex', alignItems:'center', gap:9, padding:'calc(7px + env(safe-area-inset-top, 0px)) 10px 7px', minHeight:'calc(58px + env(safe-area-inset-top, 0px))', background:'var(--header-bg)', borderBottom:'1px solid rgba(0,0,0,0.08)', flexShrink:0, position:'sticky', top:0, zIndex:30 }}>
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
          <div className="om-chat-avatar" style={{ width:40, height:40, borderRadius:'50%', background:'#F8FAFC', border:'1.5px solid rgba(255,255,255,0.72)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
            {avatar ? <img src={avatar} alt={name??''} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} /> : (
              <span style={{ fontWeight:800, color:'var(--header-bg)', fontSize:18 }}>{(name??'?')[0].toUpperCase()}</span>
            )}
          </div>
          {isOnline && <span style={{ position:'absolute', bottom:1, right:1, width:11, height:11, background:'var(--online-dot)', borderRadius:'50%', border:'2px solid var(--header-bg)' }} />}
        </button>
        <button onClick={() => setProfileModal(true)}
          style={{ flex:1, border:'none', background:'transparent', cursor:'pointer', textAlign:'left', padding:0, minWidth:0 }}>
          <p className="om-chat-title" style={{ fontWeight:800, fontSize:16, lineHeight:1.08, color:'#FFFFFF', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:0 }}>{name}</p>
          <p className="om-chat-subtitle" style={{ fontSize:12, lineHeight:1.15, color: typingNames.length > 0 ? '#DDEFEA' : isOnline ? '#34D399' : 'rgba(255,255,255,0.62)', margin:'3px 0 0', fontWeight:600 }}>
            {typingNames.length > 0
              ? typingNames.length === 1
                ? `${typingNames[0]} est en train d'écrire…`
                : `${typingNames.slice(0,-1).join(', ')} et ${typingNames[typingNames.length-1]} écrivent…`
              : isOnline ? t(lang,'chat.online') : t(lang,'chat.offline')}
          </p>
        </button>
        {/* Boutons appel */}
        {onStartCall && conv && (
          <>
            <button
              onClick={() => startConversationCall('audio')}
              className="om-chat-action"
              style={{ width:30, height:30, minHeight:30, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background:'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }} title="Appel audio">
              <svg width="17" height="17" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
            </button>
            <button
              onClick={() => startConversationCall('video')}
              className="om-chat-action"
              style={{ width:30, height:30, minHeight:30, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background:'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }} title="Appel vidéo">
              <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
              </svg>
            </button>
          </>
        )}
        <button
          onClick={() => setShowMessageSearch(v => !v)}
          className="om-chat-action"
          style={{ width:30, height:30, minHeight:30, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background: showMessageSearch ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }}
          title="Rechercher dans la conversation"
        >
          <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      {selectionMode && (
        <div style={{ flexShrink:0, background:'#FFFFFF', borderBottom:'1px solid rgba(15,23,42,0.08)', padding:'8px 10px', display:'flex', alignItems:'center', gap:8, boxShadow:'0 4px 14px rgba(16,42,42,0.05)', zIndex:25 }}>
          <button
            onClick={clearMessageSelection}
            aria-label="Annuler la sélection"
            style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'none', background:'var(--bg-input)', color:'var(--text-primary)', cursor:'pointer', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
          >
            ×
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:15.5, lineHeight:1.16, fontWeight:900, color:'var(--text-primary)' }}>
              {selectedMessages.length} message{selectedMessages.length > 1 ? 's' : ''} sélectionné{selectedMessages.length > 1 ? 's' : ''}
            </p>
            <p style={{ margin:'2px 0 0', fontSize:12.2, lineHeight:1.2, fontWeight:700, color:'var(--text-muted)' }}>
              Touchez d’autres messages pour ajouter ou retirer.
            </p>
          </div>
          <button
            onClick={deleteSelectedMessages}
            disabled={selectedMessages.length === 0}
            title="Effacer"
            aria-label="Effacer les messages sélectionnés"
            style={{ width:38, height:38, minHeight:38, borderRadius:'50%', border:'none', background:selectedMessages.length ? 'rgba(220,38,38,0.10)' : 'rgba(16,42,42,0.10)', color:selectedMessages.length ? '#dc2626' : 'var(--text-muted)', cursor:selectedMessages.length ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
          >
            <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14M10 10v7m4-7v7" />
            </svg>
          </button>
          <button
            onClick={openSelectedForwardSheet}
            disabled={selectedMessages.length === 0}
            title="Transférer"
            style={{ width:38, height:38, minHeight:38, borderRadius:'50%', border:'none', background:selectedMessages.length ? 'var(--header-bg)' : 'rgba(16,42,42,0.14)', color:selectedMessages.length ? '#fff' : 'var(--text-muted)', cursor:selectedMessages.length ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:selectedMessages.length ? '0 6px 18px rgba(16,42,42,0.18)' : 'none' }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6l6 6-6 6" />
            </svg>
          </button>
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
              placeholder="Rechercher un message"
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
            title="Résultat précédent"
          >
            ↑
          </button>
          <button
            onClick={() => setActiveSearchIndex(i => searchMatches.length ? (i + 1) % searchMatches.length : 0)}
            disabled={!searchMatches.length}
            style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'1px solid var(--border)', background:'#fff', color:'var(--text-primary)', opacity: searchMatches.length ? 1 : 0.4, cursor: searchMatches.length ? 'pointer' : 'default' }}
            title="Résultat suivant"
          >
            ↓
          </button>
          <button
            onClick={() => { setShowMessageSearch(false); setMessageSearch(''); }}
            style={{ width:34, height:34, minHeight:34, borderRadius:'50%', border:'none', background:'transparent', color:'var(--text-muted)', cursor:'pointer', fontSize:18 }}
            title="Fermer"
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

      {/* Messages */}
      <div
        className="om-messages-viewport"
        ref={messagesViewportRef}
        onScroll={handleMessagesScroll}
        style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', padding:'8px 10px 10px', WebkitOverflowScrolling:'touch', background:'var(--bg-app)', position:'relative' } as React.CSSProperties}
      >
        <div className="om-messages-inner" style={{ display:'flex', flexDirection:'column', gap:2 }}>
          <div className="om-messages-top-spacer" />
          {convMessages.map((msg, index) => (
            <div
              key={msg.id}
              ref={el => {
                messageRefs.current[msg.id] = el;
                if (index === 0) firstMessageRef.current = el;
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
                onReply={setReplyTo}
                onDelete={handleDelete}
                onEdit={setEditMsg}
                onForward={openForwardSheet}
                onSelect={toggleMessageSelection}
                selectionMode={selectionMode}
                selected={selectedMessageIds.includes(msg.id)}
                onMediaLoad={() => {
                  if (isNearBottomRef.current) requestAnimationFrame(() => scrollMessagesToBottom('auto'));
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
          Nouveaux messages
        </button>
      )}

      {/* Reply/Edit bar */}
      {!selectionMode && (replyTo || editMsg) && (
        <div style={{ padding:'9px 12px', borderTop:'1px solid var(--border)', background:'var(--bg-surface)', display:'flex', alignItems:'center', gap:10, boxShadow:'0 -6px 18px rgba(16,42,42,0.05)', flexShrink:0 }}>
          <div style={{ flex:1, minWidth:0, borderLeft:'4px solid var(--accent)', padding:'7px 10px', borderRadius:12, background:'var(--bg-input)' }}>
            <p style={{ fontSize:12, color:'var(--accent-text)', fontWeight:850, margin:0, lineHeight:1.2 }}>
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

      {/* Input — toujours visible, safe-area iOS */}
      {!selectionMode && (
      <div className="chat-composer-safe om-chat-composer" style={{ position:'relative', padding:'6px 8px', paddingBottom:'max(7px, env(safe-area-inset-bottom))', background:'#F0F2F5', borderTop:'1px solid #D7DBDF', flexShrink:0 }}>
        {/* Emoji picker */}
        {showEmoji && (
          <EmojiPicker
            onSelect={e => insertTextAtCursor(e)}
            onClose={() => setShowEmoji(false)}
          />
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
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Enregistrement…</span>
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
                  <div style={{ position:'absolute', bottom:50, left:0, zIndex:50, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16, boxShadow:'0 4px 24px rgba(0,0,0,.15)', overflow:'hidden', minWidth:180 }}>
                    <button onClick={() => { setShowAttachMenu(false); setShowCamera(true); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>📷</span> Caméra
                    </button>
                    <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.setAttribute('accept','image/*,video/*'); fileInputRef.current?.click(); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>🖼️</span> Photo / Vidéo
                    </button>
                    <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.setAttribute('accept','.pdf,.doc,.docx,.xls,.xlsx,*/*'); fileInputRef.current?.click(); }}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--text-primary)' }}>
                      <span style={{ fontSize:20 }}>📄</span> Document
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Textarea + emoji button */}
            <div className="om-composer-input-shell" style={{ flex:1, background:'var(--bg-surface)', borderRadius:23, padding:'7px 12px', minHeight:42, display:'flex', alignItems:'center', gap:7, border:'1px solid var(--border)' }}>
              <textarea ref={textareaRef} value={input} onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                onPaste={handlePaste}
                placeholder={t(lang,'chat.placeholder')} rows={1}
                className="om-composer-textarea"
                style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:16, color:'var(--text-primary)', resize:'none', maxHeight:108, lineHeight:1.28, padding:'1px 0', minHeight:22, WebkitUserSelect:'text', userSelect:'text', touchAction:'auto' }}
                onFocus={() => setTimeout(() => { if (isNearBottomRef.current) scrollMessagesToBottom('smooth'); }, 120)}
                onInput={e => resizeTextarea(e.target as HTMLTextAreaElement)}
              />
              <button onClick={pasteFromClipboard}
                className="om-composer-paste"
                title="Coller"
                style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', flexShrink:0, fontSize:19, lineHeight:1, padding:0 }}>
                📋
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
            aria-label="Transférer les messages"
          >
            <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <button
                onClick={closeForwardSheet}
                disabled={forwarding}
                aria-label="Fermer"
                style={{ width:38, height:38, minHeight:38, borderRadius:'50%', border:'none', background:'var(--bg-input)', color:'var(--text-primary)', cursor: forwarding ? 'default' : 'pointer', fontSize:22, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
              >
                ×
              </button>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, color:'var(--text-primary)', fontSize:18, fontWeight:900, lineHeight:1.12 }}>Transférer à</p>
                <p style={{ margin:'3px 0 0', color:'var(--text-muted)', fontSize:12.5, fontWeight:750 }}>{forwardTargets.length}/50 contacts sélectionnés</p>
              </div>
              <button
                onClick={forwardSelectedMessages}
                disabled={forwardTargets.length === 0 || forwarding}
                style={{ border:'none', borderRadius:999, background: forwardTargets.length === 0 || forwarding ? 'rgba(16,42,42,0.14)' : 'var(--header-bg)', color: forwardTargets.length === 0 || forwarding ? 'var(--text-muted)' : '#fff', padding:'10px 16px', fontSize:14, fontWeight:900, cursor: forwardTargets.length === 0 || forwarding ? 'default' : 'pointer', flexShrink:0 }}
              >
                {forwarding ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>

            <div style={{ margin:'12px 16px 8px', padding:'10px 12px', borderRadius:14, background:'#EAF4F1', border:'1px solid rgba(16,42,42,0.12)', color:'var(--text-primary)', flexShrink:0 }}>
              <p style={{ margin:'0 0 3px', fontSize:12, color:'var(--text-muted)', fontWeight:850 }}>
                {forwardMessages.length} message{forwardMessages.length > 1 ? 's' : ''} à transférer
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
                placeholder="Rechercher un contact ou une conversation"
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
                    Aucun contact Oracle Messenger trouvé pour ce transfert.
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
                title={avatar ? 'Agrandir la photo' : undefined}
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
              {other?.username && <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 4px' }}>@{other.username}</p>}
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, background: isOnline ? 'rgba(52,211,153,0.12)' : 'rgba(100,116,139,0.10)', borderRadius:20, padding:'4px 14px', marginBottom:20 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: isOnline ? '#25D366' : 'var(--text-muted)' }}/>
                <span style={{ fontSize:13, color: isOnline ? '#16A34A' : 'var(--text-muted)', fontWeight:700 }}>{isOnline ? 'En ligne' : 'Hors ligne'}</span>
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
            setCallNotice('Envoi du média...');
            try {
              const content = await uploadMediaForMessage(dataUrl, type, {
                name: `${type}-${Date.now()}.${type === 'image' ? 'jpg' : 'webm'}`,
                mime: dataUrl.match(/^data:([^;,]+)/)?.[1],
              });
              sendMessage(activeConvId, content, type);
            } catch {
              alert('Impossible d’envoyer ce média. Vérifiez la connexion puis réessayez.');
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
          onClose={() => setAvatarLightbox(false)}
        />
      )}
    </div>
  );
}
