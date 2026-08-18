import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '@/services/api';
import { nativeDebugLog } from '@/services/nativeLogger';

const CALL_CHANNEL_ID = 'oracle_messenger_incoming_calls_v8';
const MESSAGE_CHANNEL_ID = 'oracle_messenger_messages_v3';
const REMINDER_CHANNEL_ID = 'oracle_messenger_local_reminders_v2';
const NativeIncomingCall = NativeModules.OracleIncomingCallNotification as
  | {
      showIncomingCall?: (callId: string, conversationId: string, callerName: string, callType: string) => Promise<boolean>;
      cancelIncomingCall?: (callId: string) => Promise<boolean>;
      consumePendingCallAction?: () => Promise<{
        action?: string;
        callId?: string;
        conversationId?: string;
        url?: string;
      } | null>;
    }
  | undefined;

function phoneLike(value?: string | null) {
  return /^\+?\d[\d\s().-]{6,}$/.test(String(value || '').trim());
}

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
    sound: 'oracle_incoming_call.wav',
    vibrationPattern: [0, 650, 250, 650, 250, 1100],
    lightColor: '#102A2A',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
  await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
    name: 'Messages Oracle Messenger',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'oracle_message.wav',
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#102A2A',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Rappels Oracle Messenger',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 420, 180, 420, 180, 760],
    lightColor: '#102A2A',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function registerPushToken(sessionToken: string) {
  await configureAndroidNotifications();
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const permission = granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    nativeDebugLog('[NativeNotifications]', { event: 'push-register-skip', reason: 'permission-denied' });
    return { registered: false, reason: 'permission-denied' };
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const token = String(deviceToken.data || '').trim();
  if (!token) {
    nativeDebugLog('[NativeNotifications]', { event: 'push-register-skip', reason: 'empty-token' });
    return { registered: false, reason: 'empty-token' };
  }
  await api.subscribePush(sessionToken, { type: 'fcm', token, platform: 'android' });
  nativeDebugLog('[NativeNotifications]', {
    event: 'push-register-ok',
    platform: 'android',
    tokenSuffix: token.slice(-8),
  });
  return { registered: true };
}

export async function showIncomingCallNotification(input: {
  callId: string;
  conversationId: string;
  callerName?: string;
  callerPhone?: string | null;
  type: 'audio' | 'video';
}) {
  await configureAndroidNotifications();
  const displayCaller = input.callerPhone || (phoneLike(input.callerName) ? input.callerName : '') || 'Oracle Messenger';
  if (Platform.OS === 'android' && NativeIncomingCall?.showIncomingCall) {
    await NativeIncomingCall.showIncomingCall(
      input.callId,
      input.conversationId,
      displayCaller,
      input.type,
    );
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${input.type === 'video' ? 'Appel vidéo' : 'Appel audio'} - ${displayCaller}`,
      body: 'Répondez depuis Oracle Messenger.',
      sound: 'oracle_incoming_call.wav',
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

export async function consumePendingIncomingCallAction() {
  if (Platform.OS !== 'android' || !NativeIncomingCall?.consumePendingCallAction) return null;
  const pending = await NativeIncomingCall.consumePendingCallAction();
  if (!pending?.callId) return null;
  const action = pending.action === 'accept' || pending.action === 'reject' ? pending.action : 'open';
  const conversationId = pending.conversationId || '';
  const url = pending.url || `oraclemessenger://call?action=${encodeURIComponent(action)}&callId=${encodeURIComponent(pending.callId)}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`;
  return {
    action,
    callId: pending.callId,
    conversationId,
    url,
  };
}

async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const permission = granted ? current : await Notifications.requestPermissionsAsync();
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function scheduleLocalReminder(input: { title: string; body?: string; date: Date }) {
  await configureAndroidNotifications();
  const granted = await ensureNotificationPermission();
  if (!granted) return '';
  return Notifications.scheduleNotificationAsync({
    content: {
      title: input.title || 'Rappel Oracle Messenger',
      body: input.body || 'Rappel enregistré dans Oracle Messenger.',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { type: 'local-reminder', scheduledAt: input.date.toISOString() },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: input.date,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
}

export async function cancelLocalReminder(notificationId?: string | null) {
  if (!notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined);
}
