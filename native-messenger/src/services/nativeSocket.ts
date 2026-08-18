import { io, type Socket } from 'socket.io-client';
import { Alert, Linking } from 'react-native';
import { BACKEND_URL } from '@/config/env';
import { nativeClientInfo } from '@/services/appVersion';

let socket: Socket | null = null;
let socketToken = '';
let updateAlertVisible = false;

type UpdateRequiredEvent = {
  title?: string;
  message?: string;
  updateUrl?: string;
  fallbackUpdateUrl?: string;
  minVersionCode?: number;
  currentVersionCode?: number;
  blockCalls?: boolean;
};

async function openUpdateUrl(event?: UpdateRequiredEvent) {
  const primary = event?.updateUrl || nativeClientInfo.updateUrl;
  const fallback = event?.fallbackUpdateUrl || nativeClientInfo.fallbackUpdateUrl;
  await Linking.openURL(primary).catch(() => Linking.openURL(fallback));
}

function handleUpdateRequired(event?: UpdateRequiredEvent) {
  if (updateAlertVisible) return;
  updateAlertVisible = true;
  const actions = event?.blockCalls
    ? [
        {
          text: 'Mettre à jour',
          onPress: () => {
            updateAlertVisible = false;
            void openUpdateUrl(event);
          },
        },
      ]
    : [
        {
          text: 'Plus tard',
          style: 'cancel' as const,
          onPress: () => {
            updateAlertVisible = false;
          },
        },
        {
          text: 'Mettre à jour',
          onPress: () => {
            updateAlertVisible = false;
            void openUpdateUrl(event);
          },
        },
      ];
  Alert.alert(
    event?.title || 'Mettez à jour',
    event?.message || 'Mettez à jour Oracle Messenger pour continuer les appels. La messagerie reste disponible.',
    actions,
    { cancelable: !event?.blockCalls },
  );
}

export function ensureNativeSocket(token: string) {
  if (!socket || socketToken !== token) {
    socket?.disconnect();
    socketToken = token;
    socket = io(BACKEND_URL, {
      auth: { token, client: nativeClientInfo },
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      randomizationFactor: 0.35,
      timeout: 12000,
    });
    socket.on('app:update-required', handleUpdateRequired);
  } else if (!socket.connected) {
    socket.auth = { token, client: nativeClientInfo };
    socket.connect();
  }
  return socket;
}

export function disconnectNativeSocket() {
  socket?.off('app:update-required', handleUpdateRequired);
  socket?.disconnect();
  socket = null;
  socketToken = '';
}
