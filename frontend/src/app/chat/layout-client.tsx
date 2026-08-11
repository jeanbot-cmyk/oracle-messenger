'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CallOverlay } from '../../components/call/CallOverlay';
import { MainLayout } from '../../components/layout/MainLayout';
import { useChatStore } from '../../store/chat';
import { useSocket } from '../../hooks/useSocket';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useNotifications } from '../../hooks/useNotifications';
import { api } from '../../lib/api';
import { getConversations } from '../../lib/db';

export function ChatLayout() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token  = session?.user?.backendToken ?? '';
  const userId = session?.user?.id ?? '';
  const { setConversations, setCurrentUser, setActiveConv, conversations } = useChatStore();
  const { requestPermission, permission } = useNotifications();
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const viewportRaf = useRef<number | null>(null);
  const lastViewport = useRef({ height: 0, top: 0 });
  useSocket();

  const {
    callState, callInfo, callError, localStream, remoteStreams,
    isMuted, isCamOff,
    startCall, answerCall, endCall, addParticipants, toggleMute, toggleCamera, switchCamera, startScreenShare,
  } = useWebRTC(userId, token);

  useEffect(() => {
    if (!token) {
      setConversationsLoading(status === 'loading');
      return;
    }
    let cancelled = false;
    setConversationsLoading(true);
    setCurrentUser(session?.user as any);
    api.users.me(token).then(setCurrentUser).catch(() => {});
    getConversations(userId)
      .then(localConversations => {
        if (!cancelled && localConversations.length > 0) setConversations(localConversations);
      })
      .catch(() => {});
    api.conversations.list(token)
      .then(remoteConversations => {
        if (cancelled) return;
        const list = Array.isArray(remoteConversations) ? remoteConversations : [];
        const current = useChatStore.getState().conversations;
        if (list.length > 0 || current.length === 0) {
          setConversations(list);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setConversationsLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, userId, status, session, setCurrentUser, setConversations]);

  useEffect(() => {
    const convId = searchParams?.get('conv');
    if (!convId || conversations.length === 0) return;
    if (conversations.some(c => c.id === convId)) setActiveConv(convId);
  }, [searchParams, conversations, setActiveConv]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyViewport = () => {
      const vv = window.visualViewport;
      const height = Math.round(vv?.height ?? window.innerHeight);
      const rawTop = Math.round(vv?.offsetTop ?? 0);
      const top = Math.abs(rawTop) <= 2 ? 0 : rawTop;
      const previous = lastViewport.current;
      if (Math.abs(previous.height - height) > 1) {
        document.documentElement.style.setProperty('--om-viewport-height', `${height}px`);
        previous.height = height;
      }
      if (Math.abs(previous.top - top) > 1) {
        document.documentElement.style.setProperty('--om-viewport-top', `${top}px`);
        previous.top = top;
      }
    };
    const scheduleViewportUpdate = () => {
      if (viewportRaf.current !== null) return;
      viewportRaf.current = window.requestAnimationFrame(() => {
        viewportRaf.current = null;
        applyViewport();
      });
    };
    applyViewport();
    window.visualViewport?.addEventListener('resize', scheduleViewportUpdate);
    window.visualViewport?.addEventListener('scroll', scheduleViewportUpdate);
    window.addEventListener('resize', scheduleViewportUpdate);
    window.addEventListener('orientationchange', scheduleViewportUpdate);
    return () => {
      if (viewportRaf.current !== null) {
        window.cancelAnimationFrame(viewportRaf.current);
        viewportRaf.current = null;
      }
      window.visualViewport?.removeEventListener('resize', scheduleViewportUpdate);
      window.visualViewport?.removeEventListener('scroll', scheduleViewportUpdate);
      window.removeEventListener('resize', scheduleViewportUpdate);
      window.removeEventListener('orientationchange', scheduleViewportUpdate);
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
  const callerAvatar = callerConv?.type === 'group'
    ? callerConv.avatar
    : callerConv?.participants?.find(p => p.id === callInfo?.callerId)?.avatar
      ?? callerConv?.participants?.find(p => p.id !== userId)?.avatar
      ?? callerConv?.participants?.[0]?.avatar;
  const currentCallParticipantIds = new Set([
    userId,
    callInfo?.callerId ?? '',
    ...(callInfo?.participants ?? []),
    ...Array.from(remoteStreams.keys()),
  ].filter(Boolean));
  const knownCallContacts = new Map<string, { id: string; name: string; avatar?: string }>();
  conversations.forEach(conversation => {
    (conversation.participants ?? []).forEach(participant => {
      if (!participant?.id || currentCallParticipantIds.has(participant.id)) return;
      knownCallContacts.set(participant.id, {
        id: participant.id,
        name: participant.name || participant.username || 'Contact',
        avatar: participant.avatar,
      });
    });
  });
  const addableCallParticipants = Array.from(knownCallContacts.values())
    .sort((a, b) => a.name.localeCompare(b.name));

  if (status === 'loading') {
    return (
      <div className="chat-app-shell" style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'var(--om-viewport-height, 100dvh)', minHeight:0, overflow:'hidden', background:'var(--bg-app)' }}>
        <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:'var(--brand)', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

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

      <MainLayout onStartCall={startCall} conversationsLoading={conversationsLoading} />

      {callError && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
            transform: 'translateX(-50%)',
            zIndex: 1800,
            maxWidth: 'min(92vw, 420px)',
            borderRadius: 18,
            background: 'rgba(15,23,42,.94)',
            color: '#fff',
            boxShadow: '0 18px 46px rgba(0,0,0,.24)',
            padding: '12px 15px',
            fontSize: 13,
            lineHeight: 1.35,
            fontWeight: 760,
            textAlign: 'center',
          }}
        >
          {callError}
        </div>
      )}

      <CallOverlay
        callState={callState}
        callInfo={callInfo}
        localStream={localStream}
        remoteStreams={remoteStreams}
        addableParticipants={addableCallParticipants}
        isMuted={isMuted}
        isCamOff={isCamOff}
        callerName={callerName}
        callerAvatar={callerAvatar}
        onAnswer={answerCall}
        onEnd={endCall}
        onAddParticipants={addParticipants}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onSwitchCamera={switchCamera}
        onStartScreenShare={startScreenShare}
      />
    </div>
  );
}
