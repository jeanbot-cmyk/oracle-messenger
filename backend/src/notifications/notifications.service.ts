import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

type StoredPushTarget =
  | { type: 'web'; endpoint: string; keys?: Record<string, string>; [key: string]: any }
  | { type: 'fcm'; token: string; platform?: string; [key: string]: any };

function firebaseAppConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_CONFIG,
  );
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        'mailto:admin@oracle-plus.online',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
      );
    }

    if (!getApps().length && firebaseAppConfigured()) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        initializeApp({
          credential: cert(serviceAccount),
        });
      } else {
        initializeApp({
          credential: applicationDefault(),
        });
      }
    }
  }

  async savePushSubscription(userId: string, subscription: any) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });
    const existing = this.parseSubscriptions(existingUser?.pushToken);
    const next = this.upsertSubscription(existing, subscription);

    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: JSON.stringify(next) },
    });
  }

  async sendPush(userId: string, payload: {
    title: string; body: string; url?: string; image?: string; tag?: string;
    type?: string; callId?: string; conversationId?: string;
    requireInteraction?: boolean; vibrate?: number[];
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pushToken) return;
    const subscriptions = this.parseSubscriptions(user.pushToken);
    if (!subscriptions.length) return;

    const results = await Promise.allSettled(
      subscriptions.map(subscription => this.sendOne(subscription, payload)),
    );

    const stillValid = subscriptions.filter((_, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') return true;
      const statusCode = (result.reason as any)?.statusCode;
      const firebaseCode = (result.reason as any)?.code;
      if (firebaseCode === 'messaging/registration-token-not-registered' || firebaseCode === 'messaging/invalid-registration-token') {
        return false;
      }
      return statusCode !== 404 && statusCode !== 410;
    });

    if (stillValid.length !== subscriptions.length) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { pushToken: stillValid.length ? JSON.stringify(stillValid) : null },
      }).catch(() => null);
    }
  }

  async sendToAll(payload: { title: string; body: string }) {
    const users = await this.prisma.user.findMany({ where: { pushToken: { not: null } } });
    await Promise.allSettled(users.map(u => this.sendPush(u.id, payload)));
  }

  private async sendOne(subscription: StoredPushTarget, payload: {
    title: string; body: string; url?: string; image?: string; tag?: string;
    type?: string; callId?: string; conversationId?: string;
    requireInteraction?: boolean; vibrate?: number[];
  }) {
    if (subscription.type === 'fcm') {
      if (!getApps().length) return;
      await getMessaging().send({
        token: subscription.token,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.image,
        },
        data: Object.fromEntries(
          Object.entries({
            url: payload.url,
            tag: payload.tag,
            type: payload.type,
            callId: payload.callId,
            conversationId: payload.conversationId,
            requireInteraction: payload.requireInteraction ? 'true' : undefined,
          }).filter(([, value]) => value !== undefined && value !== null),
        ) as Record<string, string>,
        android: {
          priority: 'high',
          notification: {
            channelId: payload.type === 'call' ? 'oracle_messenger_incoming_calls' : undefined,
            sound: 'default',
            priority: 'high',
            visibility: 'public',
            tag: payload.tag,
          },
        },
      });
      return;
    }
    await webpush.sendNotification(subscription as any, JSON.stringify(payload));
  }

  private parseSubscriptions(raw?: string | null): StoredPushTarget[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      return list.map(item => this.normalizeSubscription(item)).filter(Boolean) as StoredPushTarget[];
    } catch {
      return [];
    }
  }

  private normalizeSubscription(subscription: any): StoredPushTarget | null {
    if (!subscription || typeof subscription !== 'object') return null;
    if (subscription.type === 'fcm' && typeof subscription.token === 'string' && subscription.token.trim()) {
      return {
        type: 'fcm',
        token: subscription.token.trim(),
        platform: subscription.platform ?? 'android',
      };
    }
    if (typeof subscription.endpoint === 'string' && subscription.endpoint.trim()) {
      return {
        ...subscription,
        type: 'web',
        endpoint: subscription.endpoint.trim(),
      };
    }
    return null;
  }

  private upsertSubscription(existing: StoredPushTarget[], subscription: any) {
    const normalized = this.normalizeSubscription(subscription);
    if (!normalized) return existing;
    const withoutDuplicate = existing.filter(item => {
      if (normalized.type === 'fcm') return !(item.type === 'fcm' && item.token === normalized.token);
      return !(item.type === 'web' && item.endpoint === normalized.endpoint);
    });
    return [...withoutDuplicate, normalized].slice(-8);
  }
}
