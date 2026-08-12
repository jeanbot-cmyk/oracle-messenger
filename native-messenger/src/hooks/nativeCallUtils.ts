import { NativeModules } from 'react-native';
import type { Socket } from 'socket.io-client';

export type NativeCallState = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
export type NativeCallMediaProvider = 'livekit' | 'webrtc';

export type NativeCallInfo = {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName?: string;
  calleeName?: string;
  calleeAvatar?: string | null;
  type: 'audio' | 'video';
  participants: string[];
  mediaProvider?: NativeCallMediaProvider;
};

export type NativeCallDiagnosticEntry = {
  id: string;
  at: string;
  event: string;
  callId?: string;
  conversationId?: string;
  state: NativeCallState;
  details?: Record<string, unknown>;
};

export const DEFAULT_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export const CALL_OPERATION_TIMEOUT_MS = 220_000;

export function createNativeCallId() {
  return `native-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function waitForSocketConnection(socket: Socket, timeoutMs: number) {
  if (socket.connected) return Promise.resolve();
  if (!socket.active) socket.connect();

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Connexion au serveur appel impossible.'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };

    socket.once('connect', onConnect);
  });
}

export async function emitSocketAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = CALL_OPERATION_TIMEOUT_MS): Promise<T> {
  const startedAt = Date.now();
  await waitForSocketConnection(socket, timeoutMs);
  const remainingTimeoutMs = Math.max(1000, timeoutMs - (Date.now() - startedAt));
  return new Promise((resolve, reject) => {
    socket.timeout(remainingTimeoutMs).emit(event, payload, (error: Error | null, response: T) => {
      if (error) reject(new Error('Le serveur appel ne répond pas.'));
      else resolve(response);
    });
  });
}

export const OracleCallService = NativeModules.OracleCallService as
  | { startCall?: (callType: string, callerName: string) => Promise<boolean>; stopCall?: () => Promise<boolean> }
  | undefined;

export const OracleCallAlert = NativeModules.OracleCallAlert as
  | { start?: (mode: 'incoming' | 'outgoing', seconds: number) => Promise<boolean>; stop?: () => Promise<boolean> }
  | undefined;
