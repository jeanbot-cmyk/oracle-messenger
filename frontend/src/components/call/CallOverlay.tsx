'use client';
import { useEffect, useRef } from 'react';
import type { CallState, CallInfo } from '../../hooks/useWebRTC';
import { startRingtone, stopRingtone, startOutgoingCallTone, stopOutgoingCallTone, playCallConnected } from '../../lib/sounds';
import { useSettings } from '../../store/settings';
import { t } from '../../lib/i18n';

interface Props {
  callState: CallState;
  callInfo: CallInfo | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  isCamOff: boolean;
  callerName?: string;
  onAnswer: (accepted: boolean) => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera?: () => void;
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

function AudioEl({ stream }: { stream: MediaStream | null }) {
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
  return <audio ref={ref} autoPlay playsInline style={{ position:'absolute', width:1, height:1, opacity:0, pointerEvents:'none' }} />;
}

const Btn = ({ onClick, color, children, label }: { onClick:()=>void; color:string; children:React.ReactNode; label:string }) => (
  <button onClick={onClick} title={label} style={{ width:60, height:60, borderRadius:'50%', background:color, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, boxShadow:'0 2px 8px rgba(0,0,0,.3)', flexShrink:0 }}>
    {children}
  </button>
);

export function CallOverlay({ callState, callInfo, localStream, remoteStreams, isMuted, isCamOff, callerName, onAnswer, onEnd, onToggleMute, onToggleCamera, onSwitchCamera }: Props) {
  const { lang } = useSettings();
  // Sonneries selon l'état de l'appel.
  // Important : seul le destinataire doit sonner/vibrer. L'appelant ne reçoit
  // qu'un retour discret, sinon son téléphone se comporte comme un appel entrant.
  useEffect(() => {
    if (callState === 'incoming') {
      stopOutgoingCallTone();
      startRingtone();
    } else if (callState === 'calling') {
      stopRingtone();
      startOutgoingCallTone();
    } else if (callState === 'connected') {
      stopRingtone();
      stopOutgoingCallTone();
      playCallConnected();
    } else if (callState === 'ended' || callState === 'idle') {
      stopRingtone();
      stopOutgoingCallTone();
    }
    return () => {
      stopRingtone();
      stopOutgoingCallTone();
    };
  }, [callState]);

  if (callState === 'idle' || callState === 'ended') return null;

  const isVideo = callInfo?.type === 'video';
  const remoteList = Array.from(remoteStreams.entries());

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: isVideo ? '#000' : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
    padding: '48px 24px 40px',
  };

  return (
    <div style={overlay}>
      {/* Audio distant unique : les vidéos distantes sont muettes pour éviter
          les doubles lectures et l'écho sur Android. */}
      {remoteList.map(([uid, stream]) => (
        <AudioEl key={`audio-${uid}`} stream={stream} />
      ))}

      {/* Vidéos distantes */}
      {isVideo && remoteList.length > 0 && (
        <div style={{ position:'absolute', inset:0, display:'grid', gridTemplateColumns: remoteList.length > 1 ? '1fr 1fr' : '1fr', gap:2 }}>
          {remoteList.map(([uid, stream]) => (
            <VideoEl key={uid} stream={stream} muted style={{ borderRadius:0 }} />
          ))}
        </div>
      )}

      {/* Vidéo locale (miniature) */}
      {isVideo && localStream && (
        <div style={{ position:'absolute', bottom:120, right:16, width:100, height:140, borderRadius:12, overflow:'hidden', border:'2px solid rgba(255,255,255,.3)', zIndex:10 }}>
          <VideoEl stream={localStream} muted style={{ borderRadius:0 }} />
        </div>
      )}

      {/* Info appel */}
      <div style={{ textAlign:'center', zIndex:10 }}>
        <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:36 }}>
          {isVideo ? '📹' : '📞'}
        </div>
        <h2 style={{ color:'#fff', fontSize:22, fontWeight:700, margin:'0 0 8px' }}>{callerName ?? t(lang, 'call.call')}</h2>
        <p style={{ color:'rgba(255,255,255,.7)', fontSize:15, margin:0 }}>
          {callState === 'calling'  ? t(lang, 'call.calling') :
           callState === 'incoming' ? t(lang, isVideo ? 'call.incomingVideo' : 'call.incomingAudio') :
           callState === 'connected' ? `🟢 ${t(lang, 'call.connected')}` : ''}
        </p>
        {(callState === 'calling' || callState === 'incoming') && (
          <p style={{ color:'rgba(255,255,255,.58)', fontSize:12, lineHeight:1.4, margin:'10px auto 0', maxWidth:280 }}>
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
      <div style={{ zIndex:10, display:'flex', gap:20, alignItems:'center' }}>
        {callState === 'incoming' ? (
          <>
            <Btn onClick={() => onAnswer(false)} color="#ef4444" label={t(lang, 'call.reject')}>📵</Btn>
            <Btn onClick={() => onAnswer(true)} color="#22c55e" label={t(lang, 'call.answer')}>📞</Btn>
          </>
        ) : (
          <>
            <Btn onClick={onToggleMute} color={isMuted ? '#ef4444' : 'rgba(255,255,255,.2)'} label={isMuted ? t(lang, 'call.unmute') : t(lang, 'call.mute')}>
              {isMuted ? '🔇' : '🎤'}
            </Btn>
            {isVideo && (
              <>
                <Btn onClick={onToggleCamera} color={isCamOff ? '#ef4444' : 'rgba(255,255,255,.2)'} label={isCamOff ? t(lang, 'call.cameraOn') : t(lang, 'call.cameraOff')}>
                  {isCamOff ? '📷' : '📹'}
                </Btn>
                {onSwitchCamera && (
                  <Btn onClick={onSwitchCamera} color="rgba(255,255,255,.2)" label={t(lang, 'call.switchCamera')}>
                    🔄
                  </Btn>
                )}
              </>
            )}
            <Btn onClick={onEnd} color="#ef4444" label={t(lang, 'call.hangup')}>📵</Btn>
          </>
        )}
      </div>
    </div>
  );
}
