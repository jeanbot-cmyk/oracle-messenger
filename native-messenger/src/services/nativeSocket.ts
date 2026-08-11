import { io, type Socket } from 'socket.io-client';
import { BACKEND_URL } from '@/config/env';

let socket: Socket | null = null;
let socketToken = '';

export function ensureNativeSocket(token: string) {
  if (!socket || socketToken !== token) {
    socket?.disconnect();
    socketToken = token;
    socket = io(BACKEND_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 800,
      timeout: 12000,
    });
  } else if (!socket.connected && !socket.active) {
    socket.auth = { token };
    socket.connect();
  }
  return socket;
}

export function disconnectNativeSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = '';
}
