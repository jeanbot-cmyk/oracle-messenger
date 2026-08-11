'use client';
import { useEffect, useRef, useState } from 'react';
import type { CallState, CallInfo } from '../../hooks/useWebRTC';
import { startRingtone, stopRingtone, startOutgoingCallTone, stopOutgoingCallTone, playCallConnected, playCallEnded } from '../../lib/sounds';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';
import { notify } from '../../lib/feedback';

interface Props {
  callState: CallState;
  callInfo: CallInfo | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  addableParticipants?: Array<{ id: string; name: string; avatar?: string }>;
  isMuted: boolean;
  isCamOff: boolean;
  callerName?: string;
  callerAvatar?: string;
  onAnswer: (accepted: boolean) => void;
  onEnd: () => void;
  onAddParticipants?: (ids: string[]) => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera?: () => void;
  onStartScreenShare?: () => void;
}

function VideoEl({ stream, muted = false, style }: { stream: MediaStream | null; muted?: boolean; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.muted = muted;
    video.defaultPlaybackRate = 1;
    video.playbackRate = 1;
    video.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} style={{ width:'100%', height:'100%', objectFit:'cover', background:'#000', ...style }} />;
}

function AudioEl({ stream, speakerOn }: { stream: MediaStream | null; speakerOn: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio || !stream) return;
    if (audio.srcObject !== stream) audio.srcObject = stream;
    audio.muted = false;
    audio.volume = 1;
    audio.defaultPlaybackRate = 1;
    audio.playbackRate = 1;
    (audio as any).preservesPitch = true;
    (audio as any).webkitPreservesPitch = true;
    const play = () => audio.play().catch(() => {});
    play();
    const timer = setInterval(play, 1200);
    return () => clearInterval(timer);
  }, [stream]);
  useEffect(() => {
    const audio = ref.current as (HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> }) | null;
    if (!audio?.setSinkId) return;
    // Android WebView ne garantit pas les sorties "communications".
    // On tente seulement la sortie par défaut en mode haut-parleur et on ignore
    // l'échec pour éviter les erreurs visibles pendant l'appel.
    if (!speakerOn) return;
    audio.setSinkId('default').catch(() => {});
  }, [speakerOn]);
  return <audio ref={ref} autoPlay playsInline style={{ position:'absolute', width:1, height:1, opacity:0, pointerEvents:'none' }} />;
}

function streamHasEnabledVideo(stream: MediaStream | null) {
  return Boolean(stream?.getVideoTracks().some(track => track.readyState === 'live' && track.enabled));
}

function AvatarFallback({ name, avatar, small = false, label }: { name?: string; avatar?: string; small?: boolean; label?: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(145deg, #071716, #123C36)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: small ? 5 : 10,
        color: '#fff',
      }}
    >
      <div
        style={{
          width: small ? 48 : 104,
          height: small ? 48 : 104,
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'rgba(255,255,255,.14)',
          border: '1px solid rgba(255,255,255,.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: small ? 22 : 46,
          fontWeight: 880,
        }}
      >
        {avatar ? <img src={avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (name ?? '?').slice(0, 1).toUpperCase()}
      </div>
      {label && <div style={{ fontSize: small ? 11 : 14, fontWeight: 760, opacity: .78, textAlign:'center', padding:'0 8px' }}>{label}</div>}
    </div>
  );
}

function callAndroidAudio(method: 'setCallAudioRoute' | 'clearCallAudioRoute', value?: boolean) {
  try {
    const bridge = (window as any).OracleAndroid;
    const fn = bridge?.[method];
    if (typeof fn !== 'function') return false;
    if (typeof value === 'boolean') fn.call(bridge, value);
    else fn.call(bridge);
    return true;
  } catch {
    return false;
  }
}

const IconBtn = ({ onClick, color, children, label }: { onClick:()=>void; color:string; children:React.ReactNode; label:string }) => (
  <button onClick={onClick} title={label} aria-label={label} style={{ width:60, height:60, borderRadius:'50%', background:color, color:'#fff', border:'1px solid rgba(255,255,255,.16)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 12px 34px rgba(0,0,0,.34)', flexShrink:0, backdropFilter:'blur(12px)' }}>
    {children}
  </button>
);

function SlideToAnswer({ onAnswer, label }: { onAnswer: () => void; label: string }) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const answered = useRef(false);
  const maxDrag = 92;

  function commitAnswer() {
    if (answered.current) return;
    answered.current = true;
    setDragY(-maxDrag);
    window.setTimeout(onAnswer, 120);
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    answered.current = false;
    startY.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    const next = Math.min(maxDrag, Math.max(0, startY.current - event.clientY));
    setDragY(-next);
    if (next >= 72) commitAnswer();
  }

  function reset() {
    setDragging(false);
    if (!answered.current) setDragY(0);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
      <div style={{ width:92, height:168, borderRadius:999, background:'rgba(255,255,255,.10)', border:'1px solid rgba(255,255,255,.16)', display:'flex', alignItems:'flex-end', justifyContent:'center', padding:8, boxShadow:'inset 0 0 0 1px rgba(255,255,255,.04)', touchAction:'none' }}>
        <button
          type="button"
          aria-label={label}
          title={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={reset}
          onPointerCancel={reset}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              commitAnswer();
            }
          }}
          style={{
            width:72,
            height:72,
            borderRadius:'50%',
            border:'none',
            background:'#22C55E',
            color:'#fff',
            cursor:'grab',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            boxShadow:'0 16px 34px rgba(34,197,94,.32)',
            transform:`translateY(${dragY}px)`,
            transition: dragging ? 'none' : 'transform .24s ease',
          }}
        >
          <svg width="31" height="31" fill="currentColor" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
        </button>
      </div>
      <div style={{ color:'rgba(255,255,255,.78)', fontSize:13, fontWeight:820, lineHeight:1.2, textAlign:'center' }}>
        Glisser vers le haut
      </div>
    </div>
  );
}

function CallControl({ label, children, onClick, danger = false, active = false, disabled = false }: { label: string; children: React.ReactNode; onClick: () => void; danger?: boolean; active?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        minHeight: 'clamp(82px, 12dvh, 106px)',
        border: 'none',
        background: 'transparent',
        color: disabled ? 'rgba(255,255,255,.34)' : '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? .62 : 1,
        padding: '4px 2px',
        minWidth: 0,
      }}
    >
      <span
        style={{
          width: 'clamp(52px, 14vw, 68px)',
          height: 'clamp(52px, 14vw, 68px)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: danger ? '#E80046' : active ? 'rgba(255,255,255,.24)' : 'rgba(255,255,255,.09)',
          color: '#fff',
          boxShadow: danger ? '0 12px 26px rgba(232,0,70,.28)' : 'inset 0 0 0 1px rgba(255,255,255,.05)',
        }}
      >
        {children}
      </span>
      <span style={{ fontSize: 'clamp(11.5px, 3.25vw, 13.5px)', fontWeight: 720, lineHeight: 1.12, textAlign: 'center', maxWidth: 104, overflowWrap:'anywhere' }}>{label}</span>
    </button>
  );
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function CallOverlay({ callState, callInfo, localStream, remoteStreams, addableParticipants = [], isMuted, isCamOff, callerName, callerAvatar, onAnswer, onEnd, onAddParticipants, onToggleMute, onToggleCamera, onSwitchCamera, onStartScreenShare }: Props) {
  const { lang } = useSettings();
  const [duration, setDuration] = useState(0);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([]);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimer = useRef<number | null>(null);
  const previousCallState = useRef<CallState>('idle');
  const unsupported = (message: string) => {
    notify(message, 'error');
  };
  async function toggleSpeaker() {
    setSpeakerOn(value => {
      const next = !value;
      callAndroidAudio('setCallAudioRoute', next);
      return next;
    });
  }

  useEffect(() => {
    const inActiveCall = callState === 'connecting' || callState === 'connected';
    if (inActiveCall) {
      callAndroidAudio('setCallAudioRoute', speakerOn);
      return;
    }
    callAndroidAudio('clearCallAudioRoute');
  }, [callState, speakerOn]);

  useEffect(() => () => {
    callAndroidAudio('clearCallAudioRoute');
  }, []);
  // Sonneries selon l'état de l'appel.
  // Important : seul le destinataire doit sonner/vibrer. L'appelant ne reçoit
  // qu'un retour discret, sinon son téléphone se comporte comme un appel entrant.
  useEffect(() => {
    const previous = previousCallState.current;
    if (callState === 'incoming') {
      stopOutgoingCallTone();
      startRingtone();
    } else if (callState === 'calling') {
      stopRingtone();
      startOutgoingCallTone();
    } else if (callState === 'connecting') {
      stopRingtone();
      stopOutgoingCallTone();
    } else if (callState === 'connected') {
      stopRingtone();
      stopOutgoingCallTone();
      playCallConnected();
    } else if (callState === 'ended' || callState === 'idle') {
      stopRingtone();
      stopOutgoingCallTone();
      if (callState === 'ended' && previous !== 'idle' && previous !== 'ended') playCallEnded();
    }
    previousCallState.current = callState;
    return () => {
      stopRingtone();
      stopOutgoingCallTone();
    };
  }, [callState]);

  useEffect(() => {
    setDuration(0);
    if (callState !== 'connected') return;
    const timer = window.setInterval(() => setDuration(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  function revealControls() {
    setControlsVisible(true);
    if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    if (callInfo?.type === 'video' && callState === 'connected' && !showAddSheet) {
      hideControlsTimer.current = window.setTimeout(() => setControlsVisible(false), 3200);
    }
  }

  useEffect(() => {
    if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    setControlsVisible(true);
    if (callInfo?.type === 'video' && callState === 'connected' && !showAddSheet) {
      hideControlsTimer.current = window.setTimeout(() => setControlsVisible(false), 3200);
    }
    return () => {
      if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    };
  }, [callInfo?.type, callState, showAddSheet]);

  if (callState === 'idle' || callState === 'ended') return null;

  const isVideo = callInfo?.type === 'video';
  const remoteList = Array.from(remoteStreams.entries());
  const canAddParticipants = Boolean(onAddParticipants && addableParticipants.length > 0);
  const callStatus =
    callState === 'calling'  ? (isVideo ? 'Appel vidéo...' : t(lang, 'call.calling')) :
    callState === 'incoming' ? t(lang, isVideo ? 'call.incomingVideo' : 'call.incomingAudio') :
    callState === 'connecting' ? 'Connexion...' :
    callState === 'connected' ? `${t(lang, 'call.connected')} · ${formatDuration(duration)}` : '';
  const networkLabel =
    callState === 'connected'
      ? (remoteList.length > 0 ? 'Réseau stable' : 'Connexion média active')
      : callState === 'connecting'
        ? 'Connexion média...'
        : 'Réseau en attente';

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: isVideo ? '#000' : '#071716',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    height: '100dvh',
    minHeight: 0,
    padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(12px + env(safe-area-inset-bottom, 0px))',
    overflow: 'hidden',
  };

  return (
    <div style={overlay} onPointerDown={isVideo ? revealControls : undefined} onMouseMove={isVideo ? revealControls : undefined}>
      {!isVideo && callerAvatar && (
        <>
          <img
            src={callerAvatar}
            alt=""
            aria-hidden="true"
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', filter:'blur(34px)', transform:'scale(1.14)', opacity:.36 }}
          />
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(2,6,6,.78), rgba(5,20,18,.48) 45%, rgba(2,6,6,.92))' }} />
        </>
      )}
      {!isVideo && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            opacity: .26,
            backgroundImage:
              'radial-gradient(circle at 24px 28px, rgba(255,255,255,.12) 0 2px, transparent 2.5px), radial-gradient(circle at 84px 74px, rgba(217,183,91,.16) 0 2px, transparent 2.5px), linear-gradient(45deg, transparent 0 48px, rgba(255,255,255,.08) 48px 49px, transparent 49px 96px)',
            backgroundSize: '104px 104px, 118px 118px, 96px 96px',
          }}
        />
      )}
      {/* Audio distant unique : les vidéos distantes sont muettes pour éviter
          les doubles lectures et l'écho sur Android. */}
      {remoteList.map(([uid, stream]) => (
        <AudioEl key={`audio-${uid}`} stream={stream} speakerOn={speakerOn} />
      ))}

      {/* Vidéos distantes */}
      {isVideo && remoteList.length > 0 && (
        <div style={{ position:'absolute', inset:0, display:'grid', gridTemplateColumns: remoteList.length > 1 ? '1fr 1fr' : '1fr', gap:2 }}>
          {remoteList.map(([uid, stream]) => (
            streamHasEnabledVideo(stream)
              ? <VideoEl key={uid} stream={stream} muted style={{ borderRadius:0 }} />
              : <AvatarFallback key={uid} name={callerName} avatar={callerAvatar} label="Caméra distante désactivée" />
          ))}
        </div>
      )}

      {/* Vidéo locale (miniature) */}
      {isVideo && (localStream || callState === 'calling' || callState === 'connecting') && (
        <div style={{ position:'absolute', bottom: controlsVisible ? 'calc(154px + env(safe-area-inset-bottom, 0px))' : 'calc(18px + env(safe-area-inset-bottom, 0px))', right:16, width:100, height:140, borderRadius:12, overflow:'hidden', border:'2px solid rgba(255,255,255,.3)', zIndex:10, transition:'bottom .22s ease, opacity .22s ease', opacity: controlsVisible ? 1 : .76 }}>
          {!isCamOff && streamHasEnabledVideo(localStream)
            ? <VideoEl stream={localStream} muted style={{ borderRadius:0 }} />
            : <AvatarFallback name="Moi" small label={localStream ? 'Caméra coupée' : 'Caméra en préparation'} />}
        </div>
      )}

      {/* Info appel */}
      <div style={{ textAlign:'center', zIndex:10, width:'100%', maxWidth:520, marginTop:isVideo ? 10 : 0, display:'flex', flexDirection:'column', alignItems:'center', minHeight:0, flex:'1 1 auto', justifyContent:'center', paddingBottom:10, opacity: isVideo && callState === 'connected' && !controlsVisible ? .08 : 1, transition:'opacity .22s ease', pointerEvents: isVideo && callState === 'connected' && !controlsVisible ? 'none' : 'auto' }}>
        <div style={{ width:'100%', minHeight:52, display:'grid', gridTemplateColumns:'52px 1fr 52px', alignItems:'center', gap:8, marginBottom:isVideo ? 8 : 'clamp(14px, 6dvh, 68px)' }}>
          <button
            type="button"
            onClick={onEnd}
            aria-label={t(lang, 'call.hangup')}
            style={{ width:52, height:52, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.08)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
          >
            <svg width="27" height="27" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
          <div style={{ minWidth:0 }}>
            <h2 style={{ color:'#fff', fontSize:24, fontWeight:850, margin:'0 0 4px', letterSpacing:0, lineHeight:1.12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{callerName ?? t(lang, 'call.call')}</h2>
            <p style={{ color:'rgba(255,255,255,.58)', fontSize:15, margin:0, fontWeight:650, lineHeight:1.2 }}>
              <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24" style={{ verticalAlign:'-1px', marginRight:5 }}><path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 016 0v3H9z"/></svg>
              Chiffré de bout en bout
            </p>
          </div>
          <button
            type="button"
            aria-label={t(lang, 'call.participants')}
            style={{ width:52, height:52, borderRadius:'50%', border:'none', background:'rgba(255,255,255,.08)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'default' }}
          >
            <svg width="27" height="27" fill="currentColor" viewBox="0 0 24 24"><path d="M15 12a4 4 0 10-8 0 4 4 0 008 0zm-4 5c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4zm7-8V6h-3V4h3V1h2v3h3v2h-3v3h-2z"/></svg>
          </button>
        </div>
        <div style={{
          width: isVideo ? 96 : 'min(52vw, 210px, 28dvh)',
          height: isVideo ? 96 : 'min(52vw, 210px, 28dvh)',
          borderRadius: '50%',
          background:'rgba(255,255,255,.13)',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          margin:'0 auto clamp(10px, 2dvh, 16px)',
          overflow:'hidden',
          border:'2px solid rgba(255,255,255,.22)',
          boxShadow:'0 22px 70px rgba(0,0,0,.42)',
          animation: callState === 'calling' || callState === 'incoming' ? 'omCallPulse 1.8s ease-in-out infinite' : undefined,
        }}>
          {callerAvatar ? (
            <img src={callerAvatar} alt={callerName ?? ''} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', imageRendering:'auto' }} />
          ) : (
            <span style={{ color:'#fff', fontSize:isVideo ? 38 : 68, fontWeight:850 }}>{(callerName ?? '?').slice(0,1).toUpperCase()}</span>
          )}
        </div>
        <p style={{ color:'rgba(255,255,255,.82)', fontSize:15, margin:0, fontWeight:760 }}>
          {callStatus}
        </p>
        <div style={{ marginTop:10, display:'inline-flex', alignItems:'center', gap:7, borderRadius:999, padding:'7px 11px', background:'rgba(255,255,255,.10)', color:'rgba(255,255,255,.78)', fontSize:12, fontWeight:820 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background: callState === 'connected' ? '#22C55E' : '#FACC15', boxShadow: callState === 'connected' ? '0 0 0 4px rgba(34,197,94,.14)' : '0 0 0 4px rgba(250,204,21,.12)' }} />
          {networkLabel}
        </div>
        {(callState === 'calling' || callState === 'incoming') && (
          <p style={{ color:'rgba(255,255,255,.58)', fontSize:12, lineHeight:1.35, margin:'8px auto 0', maxWidth:280 }}>
            {t(lang, 'call.keepOpen')}
          </p>
        )}
        {callInfo && callInfo.participants.length > 1 && (
          <p style={{ color:'rgba(255,255,255,.5)', fontSize:13, marginTop:4 }}>
            {callInfo.participants.length} {t(lang, 'call.participants')}
          </p>
        )}
      </div>

      {/* Boutons */}
      {isVideo && callState === 'connected' && !controlsVisible && (
        <div aria-hidden="true" style={{ position:'absolute', left:'50%', bottom:'calc(14px + env(safe-area-inset-bottom, 0px))', transform:'translateX(-50%)', width:44, height:5, borderRadius:999, background:'rgba(255,255,255,.42)', zIndex:11 }} />
      )}
      <div style={{ zIndex:10, width:'100%', maxWidth:520, marginBottom:0, flex:'0 0 auto', opacity: isVideo && callState === 'connected' && !controlsVisible ? 0 : 1, transform: isVideo && callState === 'connected' && !controlsVisible ? 'translateY(22px)' : 'translateY(0)', pointerEvents: isVideo && callState === 'connected' && !controlsVisible ? 'none' : 'auto', transition:'opacity .22s ease, transform .22s ease' }}>
        {callState === 'incoming' ? (
          <div style={{ display:'flex', flexDirection:'column', gap:18, alignItems:'center', justifyContent:'center', padding:'12px 0 6px' }}>
            <SlideToAnswer onAnswer={() => { stopRingtone(); stopOutgoingCallTone(); onAnswer(true); }} label={t(lang, 'call.answer')} />
            <IconBtn onClick={() => { stopRingtone(); stopOutgoingCallTone(); onAnswer(false); }} color="#EF4444" label={t(lang, 'call.reject')}>
              <svg width="27" height="27" fill="currentColor" viewBox="0 0 24 24"><path d="M21 15.5c0 .6-.4 1-1 1h-3.5c-.6 0-1-.4-1-1 0-.8-.1-1.6-.3-2.3-.1-.3 0-.7.3-.9l2.2-2.2A15.3 15.3 0 006.3 10l2.2 2.2c.2.2.4.6.3.9-.2.7-.3 1.5-.3 2.3 0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1C3 8.6 7 5 12 5s9 3.6 9 10.5z"/></svg>
            </IconBtn>
            <div style={{ color:'rgba(255,255,255,.62)', fontSize:12, fontWeight:760 }}>Refuser</div>
          </div>
        ) : (
          <div className="om-call-controls-panel" style={{ background:'rgba(4,14,14,.88)', border:'1px solid rgba(255,255,255,.08)', borderRadius:28, padding:'10px 10px 12px', boxShadow:'0 18px 56px rgba(0,0,0,.34)', display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:'0 2px', backdropFilter:'blur(18px)', maxHeight:'calc(44dvh - env(safe-area-inset-bottom, 0px))', overflowY:'auto', overscrollBehavior:'contain', scrollbarWidth:'none' }}>
            <CallControl onClick={toggleSpeaker} label="Haut-parleur" active={speakerOn}>
              <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zm-2.5-9v2.1a7 7 0 010 13.8V21a9 9 0 000-18z"/></svg>
            </CallControl>
            <CallControl onClick={onToggleCamera} label="Vidéo" active={isVideo && !isCamOff} disabled={!isVideo}>
              <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7a3 3 0 013-3h8a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7zm15 3.2l3.2-2A.5.5 0 0122 8.6v6.8a.5.5 0 01-.8.4L18 13.8v-3.6z"/></svg>
            </CallControl>
            <CallControl onClick={onToggleMute} label={isMuted ? t(lang, 'call.unmute') : 'Désactiver le micro'} active={isMuted}>
              {isMuted
                ? <svg width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 9v2a3 3 0 01-5.1 2.1M9 9V5a3 3 0 016 0M5 5l14 14M5 11a7 7 0 007 7m0 0v3m-4 0h8"/></svg>
                : <svg width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3zM5 11a7 7 0 0014 0M12 18v3m-4 0h8"/></svg>}
            </CallControl>
            <CallControl onClick={() => {
              if (!canAddParticipants) {
                unsupported('Aucun autre participant disponible dans cette conversation. Pour ajouter quelqu’un, démarrez ou utilisez un appel de groupe.');
                return;
              }
              setSelectedAddIds([]);
              setShowAddSheet(true);
            }} label="Ajouter">
              <svg width="30" height="30" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </CallControl>
            <CallControl onClick={isVideo && onSwitchCamera ? onSwitchCamera : onStartScreenShare ?? (() => unsupported('Le partage d’écran n’est pas disponible sur ce téléphone ou ce navigateur.'))} label={isVideo ? t(lang, 'call.switchCamera') : 'Partager'} active={isVideo && !isCamOff}>
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M5 14v5h14v-5"/></svg>
            </CallControl>
            {isVideo && (
              <CallControl onClick={onStartScreenShare ?? (() => unsupported('Le partage d’écran n’est pas disponible sur ce téléphone ou ce navigateur.'))} label="Partager">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v10H4zM9 20h6m-3-5v5"/></svg>
              </CallControl>
            )}
            <CallControl onClick={onEnd} label="Terminer" danger>
              <svg width="27" height="27" fill="currentColor" viewBox="0 0 24 24"><path d="M21 15.5c0 .6-.4 1-1 1h-3.5c-.6 0-1-.4-1-1 0-.8-.1-1.6-.3-2.3-.1-.3 0-.7.3-.9l2.2-2.2A15.3 15.3 0 006.3 10l2.2 2.2c.2.2.4.6.3.9-.2.7-.3 1.5-.3 2.3 0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1C3 8.6 7 5 12 5s9 3.6 9 10.5z"/></svg>
            </CallControl>
          </div>
        )}
      </div>
      {showAddSheet && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.42)',
            padding: '18px',
          }}
          onClick={() => setShowAddSheet(false)}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(100%, 430px)',
              maxHeight: '70dvh',
              borderRadius: 26,
              overflow: 'hidden',
              background: '#071716',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 28px 80px rgba(0,0,0,.42)',
              color: '#fff',
            }}
          >
            <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ fontSize: 18, fontWeight: 860 }}>Ajouter à l'appel</div>
              <div style={{ marginTop: 4, color: 'rgba(255,255,255,.62)', fontSize: 13 }}>Inviter un participant de cette conversation.</div>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '42dvh' }}>
              {addableParticipants.map(participant => {
                const selected = selectedAddIds.includes(participant.id);
                return (
                  <button
                    key={participant.id}
                    type="button"
                    onClick={() => setSelectedAddIds(prev => selected ? prev.filter(id => id !== participant.id) : [...prev, participant.id])}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: selected ? 'rgba(34,197,94,.14)' : 'transparent',
                      color: '#fff',
                      display: 'grid',
                      gridTemplateColumns: '46px 1fr 28px',
                      gap: 12,
                      alignItems: 'center',
                      padding: '12px 18px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 850 }}>
                      {participant.avatar ? <img src={participant.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : participant.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span style={{ minWidth: 0, fontSize: 15, fontWeight: 780, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{participant.name}</span>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', border: selected ? 'none' : '2px solid rgba(255,255,255,.28)', background: selected ? '#22C55E' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.6" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.2 4.2L19 7"/></svg>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '14px 18px 18px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
              <button type="button" onClick={() => setShowAddSheet(false)} style={{ flex: 1, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.08)', color: '#fff', borderRadius: 16, padding: '12px 14px', fontWeight: 820 }}>
                Annuler
              </button>
              <button
                type="button"
                disabled={!selectedAddIds.length}
                onClick={() => {
                  if (!selectedAddIds.length) return;
                  onAddParticipants?.(selectedAddIds);
                  setShowAddSheet(false);
                  setSelectedAddIds([]);
                }}
                style={{ flex: 1, border: 'none', background: selectedAddIds.length ? '#22C55E' : 'rgba(255,255,255,.12)', color: '#fff', borderRadius: 16, padding: '12px 14px', fontWeight: 860, opacity: selectedAddIds.length ? 1 : .55 }}
              >
                Inviter
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes omCallPulse{0%,100%{transform:scale(1);box-shadow:0 22px 70px rgba(0,0,0,.42),0 0 0 0 rgba(34,197,94,.22)}50%{transform:scale(1.035);box-shadow:0 22px 70px rgba(0,0,0,.42),0 0 0 18px rgba(34,197,94,0)}}
        .om-call-controls-panel::-webkit-scrollbar{display:none}
        @media (max-height: 720px){
          .om-call-controls-panel{border-radius:24px!important;padding:8px!important;max-height:46dvh!important}
        }
        @media (max-width: 360px){
          .om-call-controls-panel{grid-template-columns:repeat(3,minmax(0,1fr))!important}
        }
      `}</style>
    </div>
  );
}
