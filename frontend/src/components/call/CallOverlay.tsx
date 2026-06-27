'use client';
import { useEffect, useRef } from 'react';
import type { CallState, CallInfo } from '../../hooks/useWebRTC';

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
}

function VideoEl({ stream, muted = false, style }: { stream: MediaStream | null; muted?: boolean; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} style={{ width:'100%', height:'100%', objectFit:'cover', background:'#000', ...style }} />;
}

const Btn = ({ onClick, color, children, label }: { onClick:()=>void; color:string; children:React.ReactNode; label:string }) => (
  <button onClick={onClick} title={label} style={{ width:60, height:60, borderRadius:'50%', background:color, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, boxShadow:'0 2px 8px rgba(0,0,0,.3)', flexShrink:0 }}>
    {children}
  </button>
);

export function CallOverlay({ callState, callInfo, localStream, remoteStreams, isMuted, isCamOff, callerName, onAnswer, onEnd, onToggleMute, onToggleCamera }: Props) {
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
      {/* Vidéos distantes */}
      {isVideo && remoteList.length > 0 && (
        <div style={{ position:'absolute', inset:0, display:'grid', gridTemplateColumns: remoteList.length > 1 ? '1fr 1fr' : '1fr', gap:2 }}>
          {remoteList.map(([uid, stream]) => (
            <VideoEl key={uid} stream={stream} style={{ borderRadius:0 }} />
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
        <h2 style={{ color:'#fff', fontSize:22, fontWeight:700, margin:'0 0 8px' }}>{callerName ?? 'Appel'}</h2>
        <p style={{ color:'rgba(255,255,255,.7)', fontSize:15, margin:0 }}>
          {callState === 'calling'  ? 'Appel en cours…' :
           callState === 'incoming' ? `Appel ${isVideo ? 'vidéo' : 'audio'} entrant` :
           callState === 'connected' ? '🟢 Connecté' : ''}
        </p>
        {callInfo && callInfo.participants.length > 1 && (
          <p style={{ color:'rgba(255,255,255,.5)', fontSize:13, marginTop:4 }}>
            {callInfo.participants.length} participants
          </p>
        )}
      </div>

      {/* Boutons */}
      <div style={{ zIndex:10, display:'flex', gap:20, alignItems:'center' }}>
        {callState === 'incoming' ? (
          <>
            <Btn onClick={() => onAnswer(false)} color="#ef4444" label="Refuser">📵</Btn>
            <Btn onClick={() => onAnswer(true)} color="#22c55e" label="Répondre">📞</Btn>
          </>
        ) : (
          <>
            <Btn onClick={onToggleMute} color={isMuted ? '#ef4444' : 'rgba(255,255,255,.2)'} label={isMuted ? 'Activer micro' : 'Couper micro'}>
              {isMuted ? '🔇' : '🎤'}
            </Btn>
            {isVideo && (
              <Btn onClick={onToggleCamera} color={isCamOff ? '#ef4444' : 'rgba(255,255,255,.2)'} label={isCamOff ? 'Activer caméra' : 'Couper caméra'}>
                {isCamOff ? '📷' : '📹'}
              </Btn>
            )}
            <Btn onClick={onEnd} color="#ef4444" label="Raccrocher">📵</Btn>
          </>
        )}
      </div>
    </div>
  );
}
