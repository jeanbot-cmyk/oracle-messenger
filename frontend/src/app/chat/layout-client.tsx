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
    startCall, answerCall, endCall, toggleMute, toggleCamera, switchCamera,
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
    const updateViewport = () => {
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const top = vv?.offsetTop ?? 0;
      document.documentElement.style.setProperty('--om-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--om-viewport-top', `${top}px`);
    };
    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission !== 'granted') {
      const t = setTimeout(() => setShowNotifBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const callerConv = conversations.find(c => c.id === callInfo?.conversationId);
  const callerName = callInfo?.callerName
    ?? (callerConv?.type === 'group' ? callerConv.name : callerConv?.participants?.[0]?.name)
    ?? 'Inconnu';

  return (
    <div className="chat-app-shell" style={{ display:'flex', flexDirection:'column', height:'var(--om-viewport-height, 100dvh)', minHeight:0, overflow:'hidden', background:'var(--bg-app)' }}>

      {/* Bannière notifs */}
      {showNotifBanner && permission !== 'granted' && (
        <div style={{ background:'var(--header-bg)', color:'#fff', padding:'calc(10px + env(safe-area-inset-top, 0px)) 16px 10px', display:'flex', alignItems:'center', gap:10, flexShrink:0, fontSize:13, borderBottom:'1px solid rgba(255,255,255,0.12)' }}>
          <span style={{ fontSize:16 }}>🔔</span>
          <span style={{ flex:1 }}>
            {permission === 'denied'
              ? 'Notifications bloquées. Active-les dans les réglages du navigateur pour recevoir messages et appels.'
              : 'Active les notifications pour recevoir messages et appels même si l’app est en arrière-plan.'}
          </span>
          {permission !== 'denied' && (
          <button onClick={async () => { const ok = await requestPermission(); if (ok) setShowNotifBanner(false); }}
            style={{ background:'#fff', color:'var(--header-bg)', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontWeight:800, fontSize:12 }}>
            Activer
          </button>
          )}
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
        onSwitchCamera={switchCamera}
      />
    </div>
  );
}
