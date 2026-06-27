'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Sidebar } from '../../components/layout/Sidebar';
import { ChatWindow } from '../../components/chat/ChatWindow';
import { CallOverlay } from '../../components/call/CallOverlay';
import { useChatStore } from '../../store/chat';
import { useSocket } from '../../hooks/useSocket';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useNotifications } from '../../hooks/useNotifications';
import { api } from '../../lib/api';

export function ChatLayout() {
  const { data: session } = useSession();
  const token  = session?.user?.backendToken ?? '';
  const userId = session?.user?.id ?? '';
  const { setConversations, setCurrentUser, conversations, activeConvId } = useChatStore();
  const { requestPermission, permission } = useNotifications();
  useSocket();

  const {
    callState, callInfo, localStream, remoteStreams,
    isMuted, isCamOff,
    startCall, answerCall, endCall, toggleMute, toggleCamera,
  } = useWebRTC(userId);

  // Bannière permission notifications
  const [showNotifBanner, setShowNotifBanner] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.users.me(token).then(setCurrentUser).catch(() => {});
    api.conversations.list(token).then(setConversations).catch(() => {});
  }, [token]);

  // Afficher bannière si permission pas encore accordée
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window && Notification.permission === 'default') {
      // Attendre 3s avant de demander (moins intrusif)
      const t = setTimeout(() => setShowNotifBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  async function handleAllowNotifs() {
    setShowNotifBanner(false);
    await requestPermission();
  }

  const activeConv = conversations.find(c => c.id === (callInfo?.conversationId ?? activeConvId));
  const callerName = callInfo?.callerName
    ?? (activeConv?.type === 'group' ? activeConv.name : activeConv?.participants?.[0]?.name)
    ?? 'Inconnu';

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg-app)', flexDirection:'column' }}>

      {/* Bannière permission notifications */}
      {showNotifBanner && permission === 'default' && (
        <div style={{
          background:'#00a884', color:'#fff', padding:'10px 16px',
          display:'flex', alignItems:'center', gap:12, flexShrink:0,
          fontSize:13, fontWeight:500,
        }}>
          <span style={{ fontSize:18 }}>🔔</span>
          <span style={{ flex:1 }}>Activez les notifications pour ne manquer aucun message ni appel</span>
          <button onClick={handleAllowNotifs}
            style={{ background:'#fff', color:'#00a884', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontWeight:700, fontSize:13 }}>
            Activer
          </button>
          <button onClick={() => setShowNotifBanner(false)}
            style={{ background:'transparent', border:'none', color:'rgba(255,255,255,.8)', cursor:'pointer', fontSize:20, lineHeight:1 }}>
            ×
          </button>
        </div>
      )}

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <Sidebar onStartCall={startCall} />
        <ChatWindow onStartCall={startCall} />
      </div>

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
