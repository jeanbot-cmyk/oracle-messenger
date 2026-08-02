'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const token  = session?.user?.backendToken ?? '';
  const userId = session?.user?.id ?? '';
  const { setConversations, setCurrentUser, setActiveConv, conversations } = useChatStore();
  const { requestPermission, permission } = useNotifications();
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  useSocket();

  const {
    callState, callInfo, localStream, remoteStreams,
    isMuted, isCamOff,
    startCall, answerCall, endCall, toggleMute, toggleCamera,
  } = useWebRTC(userId, token);

  useEffect(() => {
    if (!token) return;
    api.users.me(token).then(setCurrentUser).catch(() => {});
    api.conversations.list(token).then(setConversations).catch(() => {});
  }, [token]);

  useEffect(() => {
    const convId = searchParams?.get('conv');
    if (!convId || conversations.length === 0) return;
    if (conversations.some(c => c.id === convId)) setActiveConv(convId);
  }, [searchParams, conversations, setActiveConv]);

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
        <div style={{ background:'#102A2A', color:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, flexShrink:0, fontSize:13, borderBottom:'1px solid rgba(214,178,94,0.22)' }}>
          <span style={{ fontSize:16 }}>🔔</span>
          <span style={{ flex:1 }}>Activez les notifications pour ne rien manquer</span>
          <button onClick={async () => { setShowNotifBanner(false); await requestPermission(); }}
            style={{ background:'#D6B25E', color:'#102A2A', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontWeight:800, fontSize:12 }}>
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
