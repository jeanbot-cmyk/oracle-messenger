'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
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
import Image from 'next/image';

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
      <div style={{ padding:'10px 12px 6px', borderBottom:'1px solid #f0f2f5' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un emoji…"
          style={{ width:'100%', border:'1px solid #e9edef', borderRadius:20, padding:'6px 14px', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
      </div>
      {/* Category tabs */}
      {!search && (
        <div style={{ display:'flex', overflowX:'auto', padding:'6px 8px', gap:4, borderBottom:'1px solid #f0f2f5', flexShrink:0 }}>
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

  const { activeConvId, conversations, messages, typingUsers, typingNames: typingNamesStore, onlineUsers, setMessages, addMessage, deleteMessage, updateMessage, markRead, loadLocalMessages } = useChatStore();
  const { joinConversation, sendTyping, sendMessage } = useSocket();

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
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const audioChunks  = useRef<Blob[]>([]);
  const recTimer     = useRef<NodeJS.Timeout | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conv = conversations.find(c => c.id === activeConvId);
  const convMessages = activeConvId ? (messages[activeConvId] ?? []) : [];
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
    loadLocalMessages(activeConvId);
    joinConversation(activeConvId);
    api.messages.list(activeConvId, token).then(msgs => { setMessages(activeConvId, msgs); markRead(activeConvId); }).catch(() => {});
  }, [activeConvId, token]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [convMessages.length]);

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
      try { await api.messages.edit(editMsg.id, content, token); updateMessage(editMsg.id, { content, isEdited:true }); } catch {}
      setEditMsg(null);
    } else {
      sendMessage(activeConvId, content, 'text');
    }
    setSending(false);
  }

  async function handleDelete(msgId: string) {
    if (!activeConvId) return;
    try { await api.messages.delete(msgId, token); deleteMessage(activeConvId, msgId); } catch {}
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConvId) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      const type = isImage ? 'image' : isVideo ? 'video' : 'file';
      sendMessage(activeConvId, b64, type);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // ── Audio recording ────────────────────────────────────────────────────────
  async function startRecording() {
    if (!activeConvId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1,
        },
      });
      // Choisir le meilleur codec disponible
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
      ].find(m => MediaRecorder.isTypeSupported(m)) ?? '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {});
      audioChunks.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks.current, { type: mr.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => sendMessage(activeConvId!, reader.result as string, 'audio');
        reader.readAsDataURL(blob);
        setRecording(false);
        setRecSeconds(0);
        if (recTimer.current) clearInterval(recTimer.current);
      };
      mr.start(100); // chunk toutes les 100ms pour un envoi plus fluide
      mediaRecRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recTimer.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
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
    <div style={{ flex:1, display:'flex', flexDirection:'column', height:'100dvh', background:'var(--bg-elevated)', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', background:'var(--header-bg)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        {/* Back button — mobile only */}
        {onBack && (
          <button onClick={onBack}
            style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', flexShrink:0 }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
        )}
        {/* Avatar : simple clic → modal profil, double-clic → photo plein écran */}
        <button
          onClick={() => setProfileModal(true)}
          onDoubleClick={e => { e.stopPropagation(); if (avatar) setAvatarLightbox(true); }}
          style={{ position:'relative', border:'none', background:'transparent', padding:0, cursor:'pointer', flexShrink:0 }}>
          <div style={{ width:42, height:42, borderRadius:'50%', background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
            {avatar ? <Image src={avatar} alt={name??''} width={42} height={42} style={{ objectFit:'cover' }} /> : (
              <span style={{ fontWeight:600, color:'#fff', fontSize:18 }}>{(name??'?')[0].toUpperCase()}</span>
            )}
          </div>
          {isOnline && <span style={{ position:'absolute', bottom:1, right:1, width:11, height:11, background:'var(--online-dot)', borderRadius:'50%', border:'2px solid var(--header-bg)' }} />}
        </button>
        <button onClick={() => setProfileModal(true)}
          style={{ flex:1, border:'none', background:'transparent', cursor:'pointer', textAlign:'left', padding:0, minWidth:0 }}>
          <p style={{ fontWeight:700, fontSize:17, color:'var(--text-primary)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</p>
          <p style={{ fontSize:13, color: typingNames.length > 0 ? 'var(--accent)' : isOnline ? '#25D366' : 'var(--text-muted)', margin:0 }}>
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
              style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)' }} title="Appel audio">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
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
              style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)' }} title="Appel vidéo">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
              </svg>
            </button>
          </>
        )}
        <button style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)' }}>
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'12px 16px', display:'flex', flexDirection:'column', gap:4, WebkitOverflowScrolling:'touch' } as React.CSSProperties}>
        {convMessages.map(msg => (
          <MessageBubble key={msg.id} message={msg} isOwn={msg.senderId === userId} onReply={setReplyTo} onDelete={handleDelete} onEdit={setEditMsg} />
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
      <div style={{ position:'relative', padding:'8px 12px', paddingBottom:'max(8px, env(safe-area-inset-bottom))', background:'var(--bg-app)', flexShrink:0 }}>
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
        ) : (
          <div style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
            {/* Attachement : fichier + caméra */}
            <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} style={{ display:'none' }}/>
            <div style={{ position:'relative', flexShrink:0 }}>
              <button onClick={() => { setShowEmoji(false); setShowAttachMenu(v => !v); }}
                style={{ width:42, height:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)' }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.setAttribute('accept','image/*'); fileInputRef.current?.click(); }}
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
            <div style={{ flex:1, background:'var(--bg-surface)', borderRadius:24, padding:'10px 16px', display:'flex', alignItems:'flex-end', gap:8, border:'1px solid var(--border)' }}>
              <textarea value={input} onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={t(lang,'chat.placeholder')} rows={1}
                style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:16, color:'var(--text-primary)', resize:'none', maxHeight:128, lineHeight:1.6 }}
                onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,128)+'px'; }}
              />
              {/* Emoji button */}
              <button onClick={() => setShowEmoji(v => !v)}
                style={{ border:'none', background:'transparent', cursor:'pointer', color: showEmoji ? 'var(--accent)' : 'var(--text-muted)', flexShrink:0, fontSize:22, lineHeight:1, padding:0 }}>
                😊
              </button>
            </div>

            {/* Send ou Micro */}
            {input.trim() ? (
              <button onClick={handleSend} disabled={sending}
                style={{ width:42, height:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--accent)', cursor:'pointer', flexShrink:0, transition:'opacity .2s' }}>
                <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            ) : (
              <button onTouchStart={startRecording} onMouseDown={startRecording}
                style={{ width:42, height:42, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'none', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', flexShrink:0 }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
          <div style={{ width:'100%', background:'#fff', borderRadius:'20px 20px 0 0', paddingBottom:40, overflow:'hidden' }}>
            {/* Cover + avatar */}
            <div style={{ height:120, background:'linear-gradient(135deg,#128C7E,#075E54)', position:'relative', display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:0 }}>
              <button onClick={() => setProfileModal(false)}
                style={{ position:'absolute', top:12, right:12, width:32, height:32, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.3)', cursor:'pointer', color:'#fff', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>
                ✕
              </button>
              <div style={{ position:'absolute', bottom:-44, width:88, height:88, borderRadius:'50%', overflow:'hidden', border:'4px solid #fff', background:'#128C7E' }}>
                {avatar
                  ? <img src={avatar} alt={name??''} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:36, fontWeight:700, color:'#fff' }}>{(name??'?')[0].toUpperCase()}</span>
                    </div>
                }
              </div>
            </div>
            {/* Infos */}
            <div style={{ paddingTop:56, paddingLeft:24, paddingRight:24, textAlign:'center' }}>
              <p style={{ fontSize:20, fontWeight:800, color:'#111b21', margin:'0 0 4px' }}>{name}</p>
              {other?.username && <p style={{ fontSize:13, color:'#8696a0', margin:'0 0 4px' }}>@{other.username}</p>}
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, background: isOnline ? '#e8f5e9' : '#f0f2f5', borderRadius:20, padding:'4px 14px', marginBottom:20 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: isOnline ? '#25D366' : '#8696a0' }}/>
                <span style={{ fontSize:13, color: isOnline ? '#25D366' : '#8696a0', fontWeight:600 }}>{isOnline ? 'En ligne' : 'Hors ligne'}</span>
              </div>
              {other?.phone && (
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderTop:'1px solid #f0f2f5' }}>
                  <svg width="20" height="20" fill="#128C7E" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                  <span style={{ fontSize:15, color:'#111b21' }}>{other.phone}</span>
                </div>
              )}
              {/* Actions */}
              <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:16 }}>
                {onStartCall && other && (
                  <>
                    <button onClick={() => { setProfileModal(false); onStartCall(conv!.id, [other.id], 'audio'); }}
                      style={{ flex:1, background:'#128C7E', color:'#fff', border:'none', borderRadius:14, padding:'14px 0', fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <svg width="18" height="18" fill="#fff" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
                      Appel
                    </button>
                    <button onClick={() => { setProfileModal(false); onStartCall(conv!.id, [other.id], 'video'); }}
                      style={{ flex:1, background:'#f0f2f5', color:'#111b21', border:'none', borderRadius:14, padding:'14px 0', fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <svg width="18" height="18" fill="none" stroke="#111b21" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
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
