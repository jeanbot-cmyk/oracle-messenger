import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from './config';

let socket: Socket | null = null;
let socketToken = '';

export function getSocket(token?: string): Socket | null {
  if (token) {
    if (!socket || socketToken !== token) {
      if (socket) { socket.disconnect(); socket = null; }
      socketToken = token;
      socket = io(BACKEND_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
      });
    } else if (!socket.connected && !socket.active) {
      socket.auth = { token };
      socket.connect();
    }
  }
  return socket;
}

export function ensureSocket(token?: string): Socket | null {
  const activeSocket = getSocket(token);
  if (activeSocket && !activeSocket.connected && !activeSocket.active) {
    activeSocket.connect();
  }
  return activeSocket;
}

export function waitForSocket(token: string, timeoutMs = 5000): Promise<Socket> {
  const activeSocket = ensureSocket(token);
  return new Promise((resolve, reject) => {
    if (!activeSocket) {
      reject(new Error('Socket indisponible'));
      return;
    }
    if (activeSocket.connected) {
      resolve(activeSocket);
      return;
    }
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Connexion appel indisponible'));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      activeSocket.off('connect', onConnect);
      activeSocket.off('connect_error', onError);
    };
    const onConnect = () => {
      cleanup();
      resolve(activeSocket);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    activeSocket.once('connect', onConnect);
    activeSocket.once('connect_error', onError);
    activeSocket.connect();
  });
}

/** Retourne le socket existant sans en créer un nouveau */
export function getExistingSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
  socketToken = '';
}
