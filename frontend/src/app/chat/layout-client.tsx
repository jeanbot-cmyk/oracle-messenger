'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Sidebar } from '../../components/layout/Sidebar';
import { ChatWindow } from '../../components/chat/ChatWindow';
import { CallOverlay } from '../../components/call/CallOverlay';
import { useChatStore } from '../../store/chat';
import { useSocket } from '../../hooks/useSocket';
import { useWebRTC } from '../../hooks/useWebRTC';
import { api } from '../../lib/api';

export function ChatLayout() {
  const { data: session } = useSession();
  const token = session?.user?.backendToken ?? '';
  const userId = session?.user?.id ?? '';
  const { setConversations, setCurrentUser, conversations, activeConvId } = useChatStore();
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

  // Nom de l'appelant
  const activeConv = conversations.find(c => c.id === (callInfo?.conversationId ?? activeConvId));
  const callerName = activeConv?.type === 'group'
    ? activeConv.name
    : activeConv?.participants?.[0]?.name ?? 'Inconnu';

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg-app)' }}>
      <Sidebar onStartCall={startCall} />
      <ChatWindow onStartCall={startCall} />
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
