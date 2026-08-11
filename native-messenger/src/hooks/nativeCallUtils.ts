import { NativeModules } from 'react-native';
import type { Socket } from 'socket.io-client';

export type NativeCallState = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'reconnecting' | 'ended';

export type NativeCallInfo = {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName?: string;
  type: 'audio' | 'video';
  participants: string[];
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

export function createNativeCallId() {
  return `native-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emitSocketAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error: Error | null, response: T) => {
      if (error) reject(new Error('Le serveur appel ne répond pas.'));
      else resolve(response);
    });
  });
}

export const OracleCallService = NativeModules.OracleCallService as
  | { startCall?: (callType: string, callerName: string) => Promise<boolean>; stopCall?: () => Promise<boolean> }
  | undefined;
