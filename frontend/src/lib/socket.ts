import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(token?: string): Socket | null {
  if (token && (!socket || !socket.connected)) {
    if (socket) { socket.disconnect(); socket = null; }
    socket = io(process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001', {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

/** Retourne le socket existant sans en créer un nouveau */
export function getExistingSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
