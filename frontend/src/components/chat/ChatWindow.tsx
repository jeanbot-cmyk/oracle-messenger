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
import type { Message } from '../../types';

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

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState(0);
  const [search, setSearch] = useState('');
  const filtered = search
    ? EMOJI_CATEGORIES.flatMap(c => c.emojis).filter(e => e.includes(search))
    : EMOJI_CATEGORIES[cat].emojis;
  return (
    <div style={{ position:'absolute', bottom:'100%', left:0, right:0, background:'#fff', borderRadius:'16px 16px 0 0', boxShadow:'0 -4px 24px rgba(0,0,0,0.15)', zIndex:200, maxHeight:320, display:'flex', flexDirection:'column' }}>
      {/* Search */}
      <div style={{ padding:'10px 12px 6px', borderBottom:'1px solid var(--bg-input)' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un emoji…"
          style={{ width:'100%', border:'1px solid var(--border)', borderRadius:20, padding:'6px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
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
      <div style={{ overflowY:'auto', padding:'8px', display:'flex', flexWrap:'wrap', gap:2 }}>
        {filtered.map((e, i) => (
          <button key={i} onClick={() => onSelect(e)}
            style={{ border:'none', background:'transparent', fontSize:24, cursor:'pointer', padding:'4px', borderRadius:8, lineHeight:1 }}>
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

  const { activeConvId, conversations, messages, typingUsers, typingNames: typingNamesStore, onlineUsers, setMessages, markRead, loadLocalMessages } = useChatStore();
  const { joinConversation, sendTyping, sendMessage, deleteMessage: deleteSocketMessage, editMessage: editSocketMessage, markRead: emitRead } = useSocket();

  const [input, setInput]         = useState('');
  const [replyTo, setReplyTo]     = useState<Message | null>(null);
  const [editMsg, setEditMsg]     = useState<Message | null>(null);
  const [sending, setSending]     = useState(false);
  const [profileModal, setProfileModal]     = useState(false);
  const [avatarLightbox, setAvatarLightbox] = useState(false);
  const [showCamera, setShowCamera]         = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
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
  const initialScrollPending = useRef(false);
  const isNearBottomRef = useRef(true);
  const prevConvRef = useRef<string | null>(null);
  const prevMsgCountRef = useRef(0);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const conv = conversations.find(c => c.id === activeConvId);
  const convMessages = activeConvId
    ? [...(messages[activeConvId] ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];
  const typingIds = activeConvId ? (typingUsers[activeConvId] ?? []) : [];
  const storedNames = activeConvId ? (typingNamesStore[activeConvId] ?? {}) : {};
  // Resolve typing user IDs to names: prefer participant list, fallback to server-sent name
  const allParticipants = conv?.participants ?? [];
  const typingNames = typingIds
    .filter(id => id !== userId)
    .map(id => allParticipants.find(p => p.id === id)?.name ?? storedNames[id] ?? 'Quelqu\'un');
  const other = conv?.participants?.[0];
  const isOnline = other && onlineUsers.has(other.id);

  useEffect(() => {
    if (!activeConvId || !token) return;
    initialScrollPending.current = true;
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    loadLocalMessages(activeConvId);
    joinConversation(activeConvId);
    emitRead(activeConvId);
    api.messages.list(activeConvId, token).then(msgs => { setMessages(activeConvId, msgs); markRead(activeConvId); emitRead(activeConvId); }).catch(() => {});
  }, [activeConvId, token]);

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

  async function handleSend() {
    const content = input.trim();
    if (!content || !activeConvId || sending) return;
    setInput(''); setSending(true);
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
    reader.onload = () => {
      const b64 = reader.result as string;
      const type = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
      const content = type === 'file'
        ? JSON.stringify({ url: b64, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' })
        : b64;
      sendMessage(activeConvId, content, type);
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
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/aac'];
      const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) ?? '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {});
      audioChunks.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks.current, { type: mr.mimeType || 'audio/webm' });
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

  function sendVoiceDraft() {
    if (!activeConvId || !voiceDraft) return;
    sendMessage(activeConvId, voiceDraft.dataUrl, 'audio');
    setVoiceDraft(null);
  }

  function discardVoiceDraft() {
    setVoiceDraft(null);
  }

  const name = conv?.type === 'group' ? conv.name : other?.name ?? 'Inconnu';
  const avatar = conv?.type === 'group' ? conv.avatar : other?.avatar;

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
      <div className="om-chat-header" style={{ display:'flex', alignItems:'center', gap:10, padding:'calc(6px + env(safe-area-inset-top, 0px)) 12px 6px', minHeight:'calc(58px + env(safe-area-inset-top, 0px))', background:'var(--header-bg)', borderBottom:'1px solid rgba(0,0,0,0.08)', flexShrink:0, position:'sticky', top:0, zIndex:30 }}>
        {/* Back button — mobile only */}
        {onBack && (
          <button onClick={onBack}
            style={{ width:34, height:34, minHeight:34, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'#F8FAFC', flexShrink:0 }}>
            <svg width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
        )}
        {/* Avatar : simple clic → modal profil, double-clic → photo plein écran */}
        <button
          onClick={() => setProfileModal(true)}
          onDoubleClick={e => { e.stopPropagation(); if (avatar) setAvatarLightbox(true); }}
          style={{ position:'relative', border:'none', background:'transparent', padding:0, cursor:'pointer', flexShrink:0 }}>
          <div className="om-chat-avatar" style={{ width:42, height:42, borderRadius:'50%', background:'#F8F2E2', border:'1.5px solid rgba(200,168,90,0.72)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
            {avatar ? <img src={avatar} alt={name??''} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} /> : (
              <span style={{ fontWeight:800, color:'var(--header-bg)', fontSize:18 }}>{(name??'?')[0].toUpperCase()}</span>
            )}
          </div>
          {isOnline && <span style={{ position:'absolute', bottom:1, right:1, width:11, height:11, background:'var(--online-dot)', borderRadius:'50%', border:'2px solid var(--header-bg)' }} />}
        </button>
        <button onClick={() => setProfileModal(true)}
          style={{ flex:1, border:'none', background:'transparent', cursor:'pointer', textAlign:'left', padding:0, minWidth:0 }}>
          <p className="om-chat-title" style={{ fontWeight:800, fontSize:17, lineHeight:1.1, color:'#FFFFFF', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:0 }}>{name}</p>
          <p className="om-chat-subtitle" style={{ fontSize:12, lineHeight:1.15, color: typingNames.length > 0 ? 'var(--accent)' : isOnline ? '#34D399' : 'rgba(255,255,255,0.62)', margin:'3px 0 0', fontWeight:600 }}>
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
              onClick={() => {
                const ids = conv.type === 'group'
                  ? allParticipants.map((p: any) => p.id)
                  : other ? [other.id] : [];
                if (ids.length) onStartCall(conv.id, ids, 'audio');
              }}
              className="om-chat-action"
              style={{ width:34, height:34, minHeight:34, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background:'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }} title="Appel audio">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
            </button>
            <button
              onClick={() => {
                const ids = conv.type === 'group'
                  ? allParticipants.map((p: any) => p.id)
                  : other ? [other.id] : [];
                if (ids.length) onStartCall(conv.id, ids, 'video');
              }}
              className="om-chat-action"
              style={{ width:34, height:34, minHeight:34, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background:'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }} title="Appel vidéo">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
              </svg>
            </button>
          </>
        )}
        <button className="om-chat-action" style={{ width:34, height:34, minHeight:34, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.14)', background:'rgba(255,255,255,0.08)', cursor:'pointer', color:'#F8FAFC' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        className="om-messages-viewport"
        ref={messagesViewportRef}
        onScroll={handleMessagesScroll}
        style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', padding:'8px 10px 10px', WebkitOverflowScrolling:'touch', background:'var(--bg-app)', position:'relative' } as React.CSSProperties}
      >
        <div className="om-messages-inner" style={{ minHeight:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-end', gap:2 }}>
          {convMessages.map((msg, index) => (
            <div key={msg.id}>
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
      {(replyTo || editMsg) && (
        <div style={{ padding:'8px 16px', borderTop:'1px solid var(--border)', background:'var(--bg-surface)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, borderLeft:'3px solid var(--accent)', paddingLeft:10 }}>
            <p style={{ fontSize:12, color:'var(--accent)', fontWeight:600, margin:0 }}>
              {editMsg ? t(lang,'chat.edit.msg') : `${t(lang,'chat.reply.to')} ${replyTo?.sender?.name}`}
            </p>
            <p style={{ fontSize:12, color:'var(--text-muted)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{editMsg?.content ?? replyTo?.content}</p>
          </div>
          <button onClick={() => { setReplyTo(null); setEditMsg(null); }} style={{ border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', fontSize:18 }}>×</button>
        </div>
      )}

      {/* Input — toujours visible, safe-area iOS */}
      <div className="chat-composer-safe om-chat-composer" style={{ position:'relative', padding:'6px 8px', paddingBottom:'max(7px, env(safe-area-inset-bottom))', background:'#F0F2F5', borderTop:'1px solid #D7DBDF', flexShrink:0 }}>
        {/* Emoji picker */}
        {showEmoji && (
          <EmojiPicker
            onSelect={e => { setInput(v => v + e); setShowEmoji(false); }}
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
            <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:10, background:'var(--bg-surface)', borderRadius:24, padding:'6px 10px', border:'1px solid rgba(200,168,90,0.24)' }}>
              <audio src={voiceDraft.dataUrl} controls preload="metadata" style={{ width:'100%', height:34 }} />
              <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:700, whiteSpace:'nowrap' }}>
                {String(Math.floor(voiceDraft.seconds / 60)).padStart(2,'0')}:{String(voiceDraft.seconds % 60).padStart(2,'0')}
              </span>
            </div>
            <button onClick={sendVoiceDraft}
              style={{ width:42, height:42, borderRadius:'50%', border:'none', background:'var(--header-bg)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
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
              <button onClick={() => { setShowEmoji(false); setShowAttachMenu(v => !v); }}
                className="om-composer-icon-btn"
                style={{ width:42, height:42, minHeight:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', flexShrink:0 }}>
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
            <div className="om-composer-input-shell" style={{ flex:1, background:'var(--bg-surface)', borderRadius:23, padding:'7px 12px', minHeight:42, display:'flex', alignItems:'center', gap:7, border:'1px solid rgba(200,168,90,0.20)' }}>
              <textarea value={input} onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={t(lang,'chat.placeholder')} rows={1}
                className="om-composer-textarea"
                style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:16, color:'var(--text-primary)', resize:'none', maxHeight:108, lineHeight:1.28, padding:'1px 0', minHeight:22 }}
                onFocus={() => setTimeout(() => { if (isNearBottomRef.current) scrollMessagesToBottom('smooth'); }, 120)}
                onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,128)+'px'; }}
              />
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
              <button onTouchStart={startRecording} onMouseDown={startRecording}
                className="om-composer-send"
                style={{ width:42, height:42, minHeight:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--header-bg)', cursor:'pointer', color:'#FFFFFF', flexShrink:0 }}>
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

      {/* Modal profil complet */}
      {profileModal && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setProfileModal(false); }}>
          <div style={{ width:'100%', background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', paddingBottom:40, overflow:'hidden' }}>
            {/* Cover + avatar */}
            <div style={{ height:120, background:'var(--header-bg)', borderBottom:'1px solid rgba(200,168,90,0.24)', position:'relative', display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:0 }}>
              <button onClick={() => setProfileModal(false)}
                style={{ position:'absolute', top:12, right:12, width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.3)', cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>
                ✕
              </button>
              <div style={{ position:'absolute', bottom:-44, width:88, height:88, borderRadius:'50%', overflow:'hidden', border:'4px solid var(--bg-surface)', background:'var(--accent)' }}>
                {avatar
                  ? <img src={avatar} alt={name??''} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:36, fontWeight:800, color:'var(--header-bg)' }}>{(name??'?')[0].toUpperCase()}</span>
                    </div>
                }
              </div>
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
                    <button onClick={() => { setProfileModal(false); onStartCall(conv!.id, [other.id], 'audio'); }}
                      style={{ flex:1, background:'var(--accent)', color:'var(--header-bg)', border:'none', borderRadius:14, padding:'14px 0', fontSize:15, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <svg width="18" height="18" fill="var(--header-bg)" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                      Appel
                    </button>
                    <button onClick={() => { setProfileModal(false); onStartCall(conv!.id, [other.id], 'video'); }}
                      style={{ flex:1, background:'rgba(200,168,90,0.12)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 0', fontSize:15, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
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
          onCapture={(dataUrl, type) => {
            setShowCamera(false);
            if (activeConvId) sendMessage(activeConvId, dataUrl, type);
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
