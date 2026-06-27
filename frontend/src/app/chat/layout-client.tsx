'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CallOverlay } from '../../components/call/CallOverlay';
import { MainLayout } from '../../components/layout/MainLayout';
import { useChatStore } from '../../store/chat';
import { useSocket } from '../../hooks/useSocket';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useNotifications } from '../../hooks/useNotifications';
import { api } from '../../lib/api';

export function ChatLayout() {
  const { data: session } = useSession();
  const router = useRouter();
  const token  = session?.user?.backendToken ?? '';
  const userId = session?.user?.id ?? '';
  const { setConversations, setCurrentUser, conversations } = useChatStore();
  const { requestPermission, permission } = useNotifications();
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  useSocket();

  const {
    callState, callInfo, localStream, remoteStreams,
    isMuted, isCamOff,
    startCall, answerCall, endCall, toggleMute, toggleCamera,
  } = useWebRTC(userId);

  useEffect(() => {
    if (!token) return;
    api.users.me(token).then(setCurrentUser).catch(() => {});
    api.conversations.list(token).then(setConversations).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission === 'default') {
      const t = setTimeout(() => setShowNotifBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const callerConv = conversations.find(c => c.id === callInfo?.conversationId);
  const callerName = callInfo?.callerName
    ?? (callerConv?.type === 'group' ? callerConv.name : callerConv?.participants?.[0]?.name)
    ?? 'Inconnu';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden', background:'var(--bg-app)' }}>

      {/* Bannière notifs */}
      {showNotifBanner && permission === 'default' && (
        <div style={{ background:'#00a884', color:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, flexShrink:0, fontSize:13 }}>
          <span style={{ fontSize:16 }}>🔔</span>
          <span style={{ flex:1 }}>Activez les notifications pour ne rien manquer</span>
          <button onClick={async () => { setShowNotifBanner(false); await requestPermission(); }}
            style={{ background:'#fff', color:'#00a884', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontWeight:700, fontSize:12 }}>
            Activer
          </button>
          <button onClick={() => setShowNotifBanner(false)}
            style={{ background:'transparent', border:'none', color:'rgba(255,255,255,0.8)', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</button>
        </div>
      )}

      <MainLayout onStartCall={startCall} />

      <CallOverlay
        callState={callState}
        callInfo={callInfo}
        localStream={localStream}
        remoteStreams={remoteStreams}
        isMuted={isMuted}
        isCamOff={isCamOff}
        callerName={callerName}
        onAnswer={answerCall}
        onEnd={endCall}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />
    </div>
  );
}
