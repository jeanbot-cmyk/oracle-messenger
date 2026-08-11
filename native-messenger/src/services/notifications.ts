import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '@/services/api';

const CALL_CHANNEL_ID = 'oracle_messenger_incoming_calls_v4';
const MESSAGE_CHANNEL_ID = 'oracle_messenger_messages_v3';
const NativeIncomingCall = NativeModules.OracleIncomingCallNotification as
  | {
      showIncomingCall?: (callId: string, conversationId: string, callerName: string, callType: string) => Promise<boolean>;
      cancelIncomingCall?: (callId: string) => Promise<boolean>;
    }
  | undefined;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configureAndroidNotifications() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
    name: 'Appels Oracle Messenger',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'oracle_call.wav',
    vibrationPattern: [0, 650, 250, 650, 250, 1100],
    lightColor: '#128C7E',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
  await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
    name: 'Messages Oracle Messenger',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'oracle_message.wav',
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#128C7E',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export async function registerPushToken(sessionToken: string) {
  await configureAndroidNotifications();
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const permission = granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return { registered: false, reason: 'permission-denied' };
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const token = String(deviceToken.data || '').trim();
  if (!token) return { registered: false, reason: 'empty-token' };
  await api.subscribePush(sessionToken, { type: 'fcm', token, platform: 'android' });
  return { registered: true };
}

export async function showIncomingCallNotification(input: {
  callId: string;
  conversationId: string;
  callerName?: string;
  type: 'audio' | 'video';
}) {
  await configureAndroidNotifications();
  if (Platform.OS === 'android' && NativeIncomingCall?.showIncomingCall) {
    await NativeIncomingCall.showIncomingCall(
      input.callId,
      input.conversationId,
      input.callerName || 'Oracle Messenger',
      input.type,
    );
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${input.type === 'video' ? 'Appel vidéo' : 'Appel audio'} - ${input.callerName || 'Oracle Messenger'}`,
      body: 'Répondez depuis Oracle Messenger.',
      sound: 'oracle_call.wav',
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: {
        type: 'call',
        callId: input.callId,
        conversationId: input.conversationId,
      },
    },
    trigger: null,
  });
}

export async function cancelIncomingCallNotification(callId?: string | null) {
  if (!callId) return;
  if (Platform.OS === 'android' && NativeIncomingCall?.cancelIncomingCall) {
    await NativeIncomingCall.cancelIncomingCall(callId);
    return;
  }
  await Notifications.dismissAllNotificationsAsync();
}
